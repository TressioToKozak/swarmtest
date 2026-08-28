"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const outbox = require("../progress-outbox");
const game = fs.readFileSync(require.resolve("../game.js"), "utf8");

function section(name, next) {
  const start = game.indexOf(`function ${name}`),
    end = game.indexOf(`function ${next}`, start);
  return game.slice(start, end);
}
function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
}

test("single-player multi-kill counts every death with one batch stats persistence", () => {
  const deaths = game.slice(
      game.indexOf("const enemyCountBeforeDeaths"),
      game.indexOf("let enemyWrite", game.indexOf("const enemyCountBeforeDeaths")),
    ),
    updates = ["player.kills++;", "savedStats.totalKills++;", "deathStatsChanged=true;"];
  for (const update of updates) assert.match(deaths, new RegExp(update.replace(/[.+]/g, "\\$&")));
  assert.equal((deaths.match(/saveStats\(\)/g) || []).length, 1);
  let writes = 0;
  const result = Function(
    "saveStats",
    `const player={kills:0},savedStats={totalKills:0};let deathStatsChanged=false;for(let index=0;index<30;index++){${updates.join("")}}if(deathStatsChanged)saveStats();return{player,savedStats}`,
  )(() => writes++);
  assert.equal(result.player.kills, 30);
  assert.equal(result.savedStats.totalKills, 30);
  assert.equal(writes, 1);
});

test("win, death and quit share one guarded single-player result finalizer", () => {
  const helper = section("queueSingleplayerResultOnce", "renderDifficulty"),
    operations = [],
    harness = Function(
      "accountProgress",
      `let singleplayerResultState='idle',elapsed=125,player={kills:42},chosenCharacter='warrior';${helper};return{queueSingleplayerResultOnce,reset:()=>singleplayerResultState='idle',state:()=>singleplayerResultState}`,
    )((type, payload, onEnqueued) => {
      operations.push({ type, payload });
      onEnqueued();
    });
  assert.equal(harness.queueSingleplayerResultOnce(), true);
  assert.equal(harness.queueSingleplayerResultOnce(), false);
  assert.deepEqual(operations, [
    { type: "awardSingleplayerResult", payload: { time: 125, kills: 42, character: "warrior" } },
  ]);
  for (const [name, next] of [
    ["winMap", "quitToMenu"],
    ["quitToMenu", "gameOver"],
    ["gameOver", "visibleTerrain"],
  ]) {
    const flow = section(name, next);
    assert.match(flow, /queueSingleplayerResultOnce\(\)/);
    assert.match(flow, /if\(!running\|\|!queueSingleplayerResultOnce\(\)\)return/);
    assert.doesNotMatch(flow, /accountProgress\('awardSingleplayerResult'/);
  }
  harness.reset();
  assert.equal(harness.queueSingleplayerResultOnce(), true);
  assert.equal(operations.length, 2);
});

test("a full outbox leaves result finalization retryable without duplicate successful IDs", async () => {
  const helper = section("queueSingleplayerResultOnce", "renderDifficulty"),
    storage = memoryStorage(),
    sendState = { offline: true },
    pending = outbox.create({
      storage,
      accountId: "full-account",
      createId: (() => {
        let id = 0;
        return () => `operation-${++id}`;
      })(),
      getRevision: () => 0,
      reconcile: () => {},
      send: async () => {
        if (sendState.offline) throw { code: "NETWORK_OFFLINE" };
        return { revision: 1, progress: {} };
      },
      yieldTask: async () => {},
    });
  for (let index = 0; index < outbox.MAX_OPERATIONS; index++)
    pending.enqueue("awardCurrency", { amount: 1 });
  const harness = Function(
    "accountProgress",
    `let singleplayerResultState='idle',elapsed=125,player={kills:42},chosenCharacter='warrior';${helper};return{queueSingleplayerResultOnce,state:()=>singleplayerResultState}`,
  )((type, payload, onEnqueued, onRejected) => {
    try {
      pending.enqueue(type, payload);
      onEnqueued();
    } catch (error) {
      onRejected(error);
    }
  });
  assert.doesNotThrow(() => assert.equal(harness.queueSingleplayerResultOnce(), false));
  assert.equal(harness.state(), "idle");
  await pending.drain();
  sendState.offline = false;
  await pending.drain();
  assert.equal(harness.queueSingleplayerResultOnce(), true);
  assert.equal(harness.queueSingleplayerResultOnce(), false);
  assert.equal(harness.state(), "queued");
  assert.equal(
    pending.pending().filter((operation) => operation.type === "awardSingleplayerResult").length,
    1,
  );
  pending.cancel();
  await pending.drain();
});

test("account progress failures stay contained outside gameplay", async () => {
  const accountProgressSource = section("accountProgress", "queueSingleplayerResultOnce");
  const run = (account) =>
    Function(
      "window",
      `${accountProgressSource};return accountProgress`,
    )({ SwarmAccount: account });
  assert.doesNotThrow(() =>
    run({
      progress: () => {
        throw new Error("full");
      },
    })("awardCurrency", {}),
  );
  run({
    progress: () => Promise.reject(new Error("offline")),
    sync: () => Promise.reject(new Error("still offline")),
  })("awardCurrency", {});
  await new Promise((resolve) => setImmediate(resolve));
});

test("offline quit result remains durable and drains after reload", async () => {
  const storage = memoryStorage(),
    accountId = "offline-account",
    key = outbox.keyForAccount(accountId);
  let ids = 0;
  const options = (send) => ({
      storage,
      accountId,
      createId: () => `result-${++ids}`,
      getRevision: () => 0,
      reconcile: () => {},
      send,
      yieldTask: async () => {},
    }),
    offline = outbox.create(
      options(async () => {
        throw { code: "NETWORK_OFFLINE" };
      }),
    );
  const operation = offline.enqueue("awardSingleplayerResult", {
    time: 125,
    kills: 42,
    character: "warrior",
  });
  await offline.drain();
  assert.equal(JSON.parse(storage.getItem(key))[0].id, operation.id);
  const sent = [],
    reloaded = outbox.create(
      options(async (pending) => {
        sent.push(pending);
        return { revision: 1, progress: {} };
      }),
    );
  await reloaded.drain();
  assert.deepEqual(sent, [operation]);
  assert.equal(storage.getItem(key), null);
});

test("loot collection persists the run once after its batch", () => {
  const collect = section("collectLoot", "hitCrates");
  assert.equal((collect.match(/saveGame\(\)/g) || []).length, 1);
  assert.match(collect, /if\(collected\)saveGame\(\)/);
});
