"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { AccountStore, mergeClientProgress, applyProgressOperation } = require("../account-store");
const {
  SlidingWindowLimiter,
  originAllowed,
  clientIp,
  requestIsHttps,
  cookieHeader,
  accountEntitlements,
} = require("../server");
const stats = (progress) => JSON.parse(progress["swarmfall-stats"] || "{}");
const operation = (id, type, payload = {}) => ({ id, type, payload });

test("ordinary client sync cannot forge server-owned progression", () => {
  const current = {
      "swarmfall-stats": '{"coins":7}',
      "swarmfall-achievements-v1": '["boss_1"]',
      "swarmfall-unlocked": "[]",
      "swarmfall-modes": "[]",
      "swarmfall-save-v1": "old",
    },
    forged = {
      "swarmfall-stats": '{"coins":999999}',
      "swarmfall-achievements-v1": '["map_1","unknown"]',
      "swarmfall-unlocked": '["warrior","druid"]',
      "swarmfall-modes": '["nightmare"]',
      "swarmfall-save-v1": "new",
    };
  const merged = mergeClientProgress(current, forged);
  assert.equal(stats(merged).coins, 7);
  assert.deepEqual(JSON.parse(merged["swarmfall-achievements-v1"]), ["boss_1"]);
  assert.deepEqual(JSON.parse(merged["swarmfall-unlocked"]), []);
  assert.deepEqual(JSON.parse(merged["swarmfall-modes"]), []);
  assert.equal(merged["swarmfall-save-v1"], "new");
});

test("validated single-player achievement, map and purchase operations are monotonic", () => {
  let progress = { "swarmfall-stats": '{"coins":30}' };
  progress = applyProgressOperation(
    progress,
    operation("operation-achievement", "unlockAchievement", { id: "boss_1" }),
  );
  assert.deepEqual(JSON.parse(progress["swarmfall-achievements-v1"]), ["boss_1"]);
  assert.equal(stats(progress).coins, 35);
  progress = applyProgressOperation(
    progress,
    operation("operation-purchase", "purchaseCharacter", {
      character: "warrior",
    }),
  );
  assert.deepEqual(JSON.parse(progress["swarmfall-unlocked"]), ["warrior"]);
  assert.equal(stats(progress).coins, 5);
  progress = applyProgressOperation(
    progress,
    operation("operation-map", "completeMap", { map: "ruins", mode: "normal" }),
  );
  assert.ok(JSON.parse(progress["swarmfall-achievements-v1"]).includes("map_1"));
  assert.ok(JSON.parse(progress["swarmfall-modes"]).includes("normal"));
  assert.deepEqual(accountEntitlements(progress), {
    unlocked: ["scout", "warrior"],
    maps: ["ruins", "toxic"],
  });
});

test("progress operations reject unknown ids, impossible purchase and arbitrary coin award", () => {
  assert.throws(
    () =>
      applyProgressOperation(
        {},
        operation("unknown-achievement", "unlockAchievement", {
          id: "unknown",
        }),
      ),
    /INVALID_PROGRESSION/,
  );
  assert.throws(
    () =>
      applyProgressOperation(
        {},
        operation("poor-purchase", "purchaseCharacter", { character: "druid" }),
      ),
    /INSUFFICIENT_COINS/,
  );
  assert.throws(
    () =>
      applyProgressOperation({}, operation("forged-coins", "awardCurrency", { amount: 999999 })),
    /INVALID_PROGRESSION/,
  );
});

test("single-player operations are revision-safe and idempotent", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "progress-ops-")),
    file = path.join(directory, "accounts.json"),
    store = new AccountStore(file);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await store.mutate((data) =>
    data.users.push({
      id: "u",
      revision: 0,
      progress: { "swarmfall-stats": '{"coins":30}' },
    }),
  );
  const first = await store.applySingleplayerOperation(
    "u",
    0,
    operation("purchase-warrior", "purchaseCharacter", {
      character: "warrior",
    }),
  );
  assert.equal(first.revision, 1);
  const duplicate = await store.applySingleplayerOperation(
    "u",
    0,
    operation("purchase-warrior", "purchaseCharacter", {
      character: "warrior",
    }),
  );
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.revision, 1);
  await assert.rejects(
    store.applySingleplayerOperation(
      "u",
      0,
      operation("achievement-boss", "unlockAchievement", { id: "boss_1" }),
    ),
    (error) => error.code === "REVISION_CONFLICT" && error.revision === 1,
  );
  const second = await store.applySingleplayerOperation(
    "u",
    1,
    operation("achievement-boss", "unlockAchievement", { id: "boss_1" }),
  );
  assert.equal(second.revision, 2);
  assert.equal(stats(second.progress).coins, 5);
});

test("sliding limiter prunes expired unique keys while retaining active limits", () => {
  let now = 0;
  const limiter = new SlidingWindowLimiter({
    limit: 2,
    windowMs: 100,
    now: () => now,
    sweepEvery: 4,
  });
  for (let i = 0; i < 20; i++) limiter.take(`ip-${i}`);
  assert.equal(limiter.buckets.size, 20);
  now = 101;
  for (let i = 0; i < 4; i++) limiter.take("active");
  assert.ok(limiter.buckets.size <= 2);
  now = 150;
  assert.equal(limiter.take("active"), true);
});

test("sliding limiter keeps a spammed bucket bounded and recovers after its window", () => {
  let now = 0;
  const limiter = new SlidingWindowLimiter({ limit: 2, windowMs: 100, now: () => now });
  assert.equal(limiter.take("attacker"), false);
  assert.equal(limiter.take("attacker"), false);
  for (let request = 0; request < 100_000; request++) assert.equal(limiter.take("attacker"), true);
  assert.equal(limiter.buckets.get("attacker").length, 2);
  now = 101;
  assert.equal(limiter.take("attacker"), false);
  assert.equal(limiter.buckets.get("attacker").length, 1);
});

test("origin policy defaults to exact request host and explicit allowlist stays strict", () => {
  assert.equal(originAllowed(undefined, "https://game.example"), true);
  assert.equal(originAllowed("https://game.example", "https://game.example"), true);
  assert.equal(originAllowed("http://localhost:8080", "https://game.example"), false);
  assert.equal(originAllowed("https://evil.example", "https://game.example"), false);
  assert.equal(originAllowed("https://tressenberg.pl", "", "tressenberg.pl"), true);
  assert.equal(originAllowed("http://localhost:8080", "", "localhost:8080"), true);
  assert.equal(originAllowed("https://evil.com", "", "tressenberg.pl"), false);
  assert.equal(originAllowed("https://evil-tressenberg.pl", "", "tressenberg.pl"), false);
  assert.equal(originAllowed("https://tressenberg.pl.evil.com", "", "tressenberg.pl"), false);
  assert.equal(originAllowed("https://tressenberg.pl:444", "", "tressenberg.pl"), false);
  assert.equal(originAllowed("not an origin", "", "tressenberg.pl"), false);
  assert.equal(originAllowed("wss://tressenberg.pl", "", "tressenberg.pl"), false);
});

test("forwarded address and protocol require trusted proxy mode", () => {
  const req = {
    headers: { "x-forwarded-for": "203.0.113.9", "x-forwarded-proto": "https" },
    socket: { remoteAddress: "127.0.0.1", encrypted: false },
  };
  assert.equal(clientIp(req, false), "127.0.0.1");
  assert.equal(clientIp(req, true), "203.0.113.9");
  assert.equal(requestIsHttps(req, false), false);
  assert.equal(requestIsHttps(req, true), true);
  assert.doesNotMatch(cookieHeader(req, "token", 60, false), /; Secure/);
  assert.match(cookieHeader(req, "token", 60, true), /; Secure/);
});

test("build slot CSS preserves square slot and icon geometry", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
  assert.match(css, /\.item-slot,\.augment-slot\{aspect-ratio:1\/1;height:auto/);
  assert.match(css, /\.slot>\.item-svg,\.slot>\.augment-svg\{[^}]*aspect-ratio:1\/1/);
  assert.match(css, /max-width:72%;max-height:72%/);
});

test("production WebSocket allowlist rejects an unlisted browser origin with 403", async (t) => {
  const WebSocket = require("ws"),
    { createHttpServer, GameServer } = require("../server"),
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "origin-policy-")),
    runtime = createHttpServer(new GameServer(), {
      accountFile: path.join(directory, "accounts.json"),
      allowedOrigins: "https://game.example",
    });
  await new Promise((resolve) => runtime.server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => runtime.server.close(resolve)));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const socket = new WebSocket(`ws://127.0.0.1:${runtime.server.address().port}`, {
    headers: { Origin: "http://localhost:8080" },
  });
  const status = await new Promise((resolve, reject) => {
    socket.once("unexpected-response", (_, response) => resolve(response.statusCode));
    socket.once("open", () => reject(new Error("unlisted origin connected")));
    socket.once("error", () => {});
  });
  assert.equal(status, 403);
});

test("shared character prices stay authoritative and match client data", () => {
  const shared = require("../shared-game-data"),
    { CHARACTER_COSTS } = require("../account-store");
  assert.equal(CHARACTER_COSTS, shared.characterCosts);
  assert.deepEqual(CHARACTER_COSTS, { warrior: 30, druid: 60 });
});

test("expired token lookup removes the session from persistent storage", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "expired-session-")),
    file = path.join(directory, "accounts.json"),
    store = new AccountStore(file),
    token = "expired-token",
    key = require("node:crypto").createHash("sha256").update(token).digest("hex");
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await store.mutate((data) => {
    data.users.push({ id: "u", login: "u", revision: 0, progress: {} });
    data.sessions[key] = { userId: "u", expiresAt: 0 };
  });
  assert.equal(await store.accountForToken(token), null);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).sessions[key], undefined);
});

test("server shuffle and lobby codes exclusively use injected RNG", () => {
  const { shuffleInPlace, GameServer } = require("../server"),
    values = [1, 2, 3, 4],
    sequence = [0, 0.5, 0.25],
    shuffled = shuffleInPlace(values, () => sequence.shift());
  assert.deepEqual(shuffled, [3, 4, 2, 1]);
  const server = new GameServer(
    () => 0,
    () => 0,
  );
  assert.equal(server.code(), "AAAAAA");
  server.lobbies.set("AAAAAA", {});
  server.random = () => 1 - Number.EPSILON;
  assert.equal(server.code(), "999999");
});

test("active WebSocket connection limiter releases slots and isolates proxy-derived IPs", () => {
  const { ActiveConnectionLimiter } = require("../server"),
    limiter = new ActiveConnectionLimiter(2);
  assert.equal(limiter.acquire("ip-a"), true);
  assert.equal(limiter.acquire("ip-a"), true);
  assert.equal(limiter.acquire("ip-a"), false);
  assert.equal(limiter.acquire("ip-b"), true);
  limiter.release("ip-a");
  assert.equal(limiter.acquire("ip-a"), true);
  limiter.release("ip-a");
  limiter.release("ip-a");
  assert.equal(limiter.counts.has("ip-a"), false);
});

test("map completion achievements are not posted as rejected standalone operations", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
  assert.match(source, /\['map_1','hard_clear','nightmare_clear'\]\.includes\(id\)/);
  assert.match(source, /accountProgress\('completeMap'/);
});

test("WebSocket transport enforces per-IP capacity and releases a disconnected slot", async (t) => {
  const WebSocket = require("ws"),
    { createHttpServer, GameServer } = require("../server"),
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "ws-capacity-")),
    runtime = createHttpServer(new GameServer(), {
      accountFile: path.join(directory, "accounts.json"),
      wsLimits: { maxConnectionsPerIp: 1 },
    });
  await new Promise((resolve) => runtime.server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => runtime.server.close(resolve)));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const url = `ws://127.0.0.1:${runtime.server.address().port}`,
    first = new WebSocket(url);
  await new Promise((resolve, reject) => {
    first.once("open", resolve);
    first.once("error", reject);
  });
  const blocked = new WebSocket(url),
    status = await new Promise((resolve, reject) => {
      blocked.once("unexpected-response", (_, response) => resolve(response.statusCode));
      blocked.once("open", () => reject(new Error("capacity bypassed")));
      blocked.once("error", () => {});
    });
  assert.equal(status, 429);
  first.close();
  await new Promise((resolve) => first.once("close", resolve));
  const replacement = new WebSocket(url);
  await new Promise((resolve, reject) => {
    replacement.once("open", resolve);
    replacement.once("error", reject);
  });
  replacement.close();
});

test("reconnect and create-lobby transport limiters close abusive clients", async (t) => {
  const WebSocket = require("ws"),
    { createHttpServer, GameServer } = require("../server"),
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "ws-rates-")),
    runtime = createHttpServer(new GameServer(), {
      accountFile: path.join(directory, "accounts.json"),
      wsLimits: { reconnectLimit: 1, createLobbyLimit: 1 },
    });
  await new Promise((resolve) => runtime.server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => runtime.server.close(resolve)));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const url = `ws://127.0.0.1:${runtime.server.address().port}`;
  for (const messages of [
    [
      { type: "hello", resume: { playerId: "x", reconnectToken: "bad" } },
      { type: "hello", resume: { playerId: "x", reconnectToken: "bad" } },
    ],
    [{ type: "createLobby" }, { type: "createLobby" }],
  ]) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    for (const message of messages) socket.send(JSON.stringify(message));
    const code = await new Promise((resolve) => socket.once("close", resolve));
    assert.equal(code, 1013);
  }
});
