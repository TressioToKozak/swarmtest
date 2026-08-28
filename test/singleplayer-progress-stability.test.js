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
function terminalHarness(accountProgress, { map = "ruins", mode = "normal" } = {}) {
  const helper = section("queueSingleplayerResultOnce", "renderDifficulty"),
    cleanup = { clears: 0, reloads: 0 };
  return {
    cleanup,
    api: Function(
      "accountProgress",
      "clearGameSave",
      "location",
      "chosenMap",
      "chosenMode",
      `let singleplayerResultState='idle',singleplayerResultPayload=null,singleplayerCompleteMapState='idle',singleplayerCompleteMapPayload=null,singleplayerTerminalVictory=false,elapsed=125,player={kills:42},chosenCharacter='warrior',running=true,paused=false,transitions=0;${helper};function victory(){if(!running)return;transitions++;if(beginSingleplayerTerminal(true))clearGameSave()}function death(){if(!running)return;transitions++;if(beginSingleplayerTerminal())clearGameSave()}function quit(){if(!running){if(singleplayerResultPayload)retrySingleplayerResultAndReload();return}transitions++;if(beginSingleplayerTerminal())retrySingleplayerResultAndReload()}return{victory,death,quit,retrySingleplayerResultAndReload,state:()=>({running,paused,transitions,singleplayerResultState,singleplayerCompleteMapState})}`,
    )(accountProgress, () => cleanup.clears++, { reload: () => cleanup.reloads++ }, map, mode),
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
      `let singleplayerResultState='idle',singleplayerResultPayload=null,singleplayerCompleteMapState='idle',singleplayerCompleteMapPayload=null,singleplayerTerminalVictory=false,elapsed=125,player={kills:42},chosenCharacter='warrior',chosenMap='ruins',chosenMode='normal';${helper};return{queueSingleplayerResultOnce,reset:()=>singleplayerResultState='idle',state:()=>singleplayerResultState}`,
    )((type, payload, onEnqueued) => {
      operations.push({ type, payload });
      onEnqueued();
    });
  assert.equal(harness.queueSingleplayerResultOnce(), true);
  assert.equal(harness.queueSingleplayerResultOnce(), true);
  assert.deepEqual(operations, [
    { type: "awardSingleplayerResult", payload: { time: 125, kills: 42, character: "warrior" } },
  ]);
  for (const [name, next] of [
    ["winMap", "quitToMenu"],
    ["quitToMenu", "gameOver"],
    ["gameOver", "visibleTerrain"],
  ]) {
    const flow = section(name, next);
    assert.match(
      flow,
      /beginSingleplayerTerminal\((?:true)?\)|retrySingleplayerResultAndReload\(\)/,
    );
    assert.doesNotMatch(flow, /if\(!running\|\|!queueSingleplayerResultOnce\(\)\)return/);
    assert.doesNotMatch(flow, /accountProgress\('awardSingleplayerResult'/);
  }
  harness.reset();
  assert.equal(harness.queueSingleplayerResultOnce(), true);
  assert.equal(operations.length, 2);
});

test("a full outbox leaves result finalization retryable without duplicate successful IDs", async () => {
  const helper = section("queueSingleplayerResultOnce", "renderDifficulty"),
    storage = memoryStorage(),
    cleanup = { clears: 0, reloads: 0 },
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
    "clearGameSave",
    "location",
    `let singleplayerResultState='idle',singleplayerResultPayload=null,singleplayerCompleteMapState='idle',singleplayerCompleteMapPayload=null,singleplayerTerminalVictory=false,elapsed=125,player={kills:42},chosenCharacter='warrior',chosenMap='ruins',chosenMode='normal';${helper};return{queueSingleplayerResultOnce,retrySingleplayerResultAndReload,state:()=>singleplayerResultState}`,
  )(
    (type, payload, onEnqueued, onRejected) => {
      try {
        pending.enqueue(type, payload);
        onEnqueued();
      } catch (error) {
        onRejected(error);
      }
    },
    () => cleanup.clears++,
    { reload: () => cleanup.reloads++ },
  );
  assert.doesNotThrow(() => assert.equal(harness.queueSingleplayerResultOnce(), false));
  assert.equal(harness.state(), "idle");
  await pending.drain();
  sendState.offline = false;
  await pending.drain();
  harness.retrySingleplayerResultAndReload();
  assert.equal(harness.queueSingleplayerResultOnce(), true);
  assert.equal(harness.state(), "queued");
  assert.deepEqual(cleanup, { clears: 1, reloads: 1 });
  assert.equal(
    pending.pending().filter((operation) => operation.type === "awardSingleplayerResult").length,
    1,
  );
  pending.cancel();
  await pending.drain();
});

test("death with a full outbox stops once and does not retry from later frames", () => {
  const helper = section("queueSingleplayerResultOnce", "renderDifficulty"),
    attempts = [],
    harness = Function(
      "accountProgress",
      "clearGameSave",
      "location",
      `let singleplayerResultState='idle',singleplayerResultPayload=null,singleplayerCompleteMapState='idle',singleplayerCompleteMapPayload=null,singleplayerTerminalVictory=false,elapsed=125,player={kills:42},chosenCharacter='warrior',running=true,paused=false,transitions=0;${helper};function terminalFrame(){if(!running)return;transitions++;beginSingleplayerTerminal()}return{terminalFrame,state:()=>({running,paused,transitions,singleplayerResultState})}`,
    )(
      (type, payload, onEnqueued, onRejected) => {
        attempts.push({ type, payload });
        onRejected({ code: "OUTBOX_FULL" });
      },
      () => {},
      { reload() {} },
    );
  harness.terminalFrame();
  for (let frame = 0; frame < 100; frame++) harness.terminalFrame();
  assert.deepEqual(harness.state(), {
    running: false,
    paused: true,
    transitions: 1,
    singleplayerResultState: "idle",
  });
  assert.equal(attempts.length, 1);
});

test("final-boss victory enters a terminal retryable state even when enqueue is full", () => {
  const win = section("winMap", "quitToMenu");
  assert.match(win, /if\(!running\)return;const resultQueued=beginSingleplayerTerminal\(true\)/);
  assert.match(win, /if\(resultQueued\)clearGameSave\(\)/);
  assert.doesNotMatch(win, /if\(!resultQueued\)return/);
});

test("victory at 98/100 durably queues exactly one result and completeMap before cleanup", () => {
  const accepted = [],
    progress = (type, payload, onEnqueued, onRejected) => {
      if (accepted.length >= 100) return onRejected({ code: "OUTBOX_FULL" });
      const operation = { id: `operation-${accepted.length + 1}`, type, payload };
      accepted.push(operation);
      onEnqueued(operation);
    };
  for (let index = 0; index < 98; index++) accepted.push({ id: `existing-${index}` });
  const { api, cleanup } = terminalHarness(progress);
  api.victory();
  assert.deepEqual(
    accepted.slice(98).map(({ type }) => type),
    ["awardSingleplayerResult", "completeMap"],
  );
  assert.equal(cleanup.clears, 1);
});

test("victory at 99/100 retries only missing completeMap and preserves its hard payload", () => {
  const accepted = [];
  for (let index = 0; index < 99; index++) accepted.push({ id: `existing-${index}` });
  const progress = (type, payload, onEnqueued, onRejected) => {
      if (accepted.length >= 100) return onRejected({ code: "OUTBOX_FULL" });
      const operation = { id: `operation-${accepted.length + 1}`, type, payload };
      accepted.push(operation);
      onEnqueued(operation);
    },
    { api, cleanup } = terminalHarness(progress, { map: "toxic", mode: "hard" });
  api.victory();
  assert.equal(cleanup.clears, 0);
  assert.equal(accepted.filter(({ type }) => type === "awardSingleplayerResult").length, 1);
  accepted.shift();
  api.retrySingleplayerResultAndReload();
  assert.equal(accepted.filter(({ type }) => type === "awardSingleplayerResult").length, 1);
  assert.deepEqual(accepted.find(({ type }) => type === "completeMap").payload, {
    map: "toxic",
    mode: "hard",
  });
  assert.deepEqual(cleanup, { clears: 1, reloads: 1 });
});

test("victory at 100/100 stays terminal across frames and user retry queues missing operations", () => {
  const accepted = Array.from({ length: 100 }, (_, index) => ({ id: `existing-${index}` })),
    attempts = [],
    progress = (type, payload, onEnqueued, onRejected) => {
      attempts.push(type);
      if (accepted.length >= 100) return onRejected({ code: "OUTBOX_FULL" });
      const operation = { id: `operation-${attempts.length}`, type, payload };
      accepted.push(operation);
      onEnqueued(operation);
    },
    { api, cleanup } = terminalHarness(progress, { map: "toxic", mode: "nightmare" });
  api.victory();
  for (let frame = 0; frame < 100; frame++) api.victory();
  assert.equal(attempts.length, 1);
  assert.equal(api.state().transitions, 1);
  assert.equal(cleanup.clears, 0);
  accepted.shift();
  api.retrySingleplayerResultAndReload();
  assert.deepEqual(attempts, ["awardSingleplayerResult", "awardSingleplayerResult", "completeMap"]);
  accepted.shift();
  api.retrySingleplayerResultAndReload();
  assert.deepEqual(attempts, [
    "awardSingleplayerResult",
    "awardSingleplayerResult",
    "completeMap",
    "completeMap",
  ]);
  assert.deepEqual(accepted.find(({ type }) => type === "completeMap").payload, {
    map: "toxic",
    mode: "nightmare",
  });
  assert.deepEqual(cleanup, { clears: 1, reloads: 1 });
});

test("death and quit require only one single-player result operation", () => {
  for (const terminal of ["death", "quit"]) {
    const accepted = [],
      progress = (type, payload, onEnqueued) => {
        accepted.push({ id: `${terminal}-operation`, type, payload });
        onEnqueued(accepted[0]);
      },
      { api } = terminalHarness(progress);
    if (terminal === "death") api.death();
    else api.quit();
    assert.deepEqual(
      accepted.map(({ type }) => type),
      ["awardSingleplayerResult"],
    );
  }
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
