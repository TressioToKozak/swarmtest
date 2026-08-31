"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  create,
  createAndDrain,
  keyForAccount,
  DEFAULT_KEY,
  MAX_OPERATIONS,
  MAX_TOTAL_OPERATIONS,
} = require("../progress-outbox");

function storage(entries = []) {
  const values = new Map(entries);
  const writes = [];
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      writes.push(["set", key, value]);
      values.set(key, value);
    },
    removeItem(key) {
      writes.push(["remove", key]);
      values.delete(key);
    },
    values,
    writes,
  };
}

function options(store, accountId, send, extra = {}) {
  let revision = 0;
  return {
    storage: store,
    accountId,
    createId: (() => {
      let id = 0;
      return () => `operation-${accountId}-${++id}`;
    })(),
    getRevision: () => revision,
    reconcile: (result) => {
      revision = result.revision;
    },
    send,
    yieldTask: async () => {},
    ...extra,
  };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("account-scoped keys isolate A, B and reject a missing id", async () => {
  const store = storage();
  const a = create(
    options(store, "account-a", async () => {
      throw { code: "NETWORK_OFFLINE" };
    }),
  );
  a.enqueue("unlockAchievement", { id: "boss_1" });
  await a.drain();
  const sentByB = [];
  const b = create(
    options(store, "account-b", async (operation) => {
      sentByB.push(operation);
      return { revision: 1, progress: {} };
    }),
  );
  await b.drain();
  assert.equal(a.pending().length, 1);
  assert.deepEqual(sentByB, []);
  assert.equal(keyForAccount(undefined), null);
  assert.throws(() => create({ storage: store }), /stable account id is required/);
});

test("legacy undefined queue is never adopted by a real account", async () => {
  const legacy = JSON.stringify([
    {
      id: "legacy-operation",
      type: "purchaseCharacter",
      payload: { character: "druid" },
    },
  ]);
  const store = storage([[`${DEFAULT_KEY}:undefined`, legacy]]),
    sent = [];
  const outbox = create(
    options(store, "real-account", async (operation) => {
      sent.push(operation);
      return { revision: 1, progress: {} };
    }),
  );
  await outbox.drain();
  assert.deepEqual(sent, []);
  assert.equal(store.getItem(`${DEFAULT_KEY}:undefined`), legacy);
});

test("authenticated boot automatically drains a queue restored after reload", async () => {
  const store = storage(),
    first = create(
      options(store, "account-a", async () => {
        throw { code: "SERVER_UNAVAILABLE" };
      }),
    );
  first.enqueue("unlockAchievement", { id: "boss_1" });
  await first.drain();
  const sent = [];
  createAndDrain(
    options(store, "account-a", async (operation) => {
      sent.push(operation.id);
      return { revision: 1, progress: {} };
    }),
  );
  await settle();
  assert.deepEqual(sent, ["operation-account-a-1"]);
  assert.equal(store.getItem(keyForAccount("account-a")), null);
});

test("network, timeout, rate limit and HTTP 5xx failures retain the same operation", async () => {
  for (const error of [
    { code: "NETWORK_OFFLINE" },
    { code: "SERVER_UNAVAILABLE" },
    { code: "REQUEST_FAILED", status: 408 },
    { code: "REQUEST_FAILED", status: 425 },
    { code: "REQUEST_FAILED", status: 429, retryAfterMs: 30_000 },
    { code: "REQUEST_FAILED", status: 500 },
    { code: "REQUEST_FAILED", status: 503 },
  ]) {
    const store = storage(),
      ids = [],
      outbox = create(
        options(store, `account-${error.status || error.code}`, async (operation) => {
          ids.push(operation.id);
          throw error;
        }),
      );
    const queued = outbox.enqueue("unlockAchievement", { id: "boss_1" });
    await outbox.drain();
    assert.equal(outbox.pending()[0].id, queued.id);
    assert.deepEqual(ids, [queued.id]);
  }
});

test("revision conflict reconciles once and retries the same id", async () => {
  const store = storage(),
    ids = [];
  let calls = 0;
  const outbox = create(
    options(store, "account-a", async (operation) => {
      ids.push(operation.id);
      if (++calls === 1) throw { code: "REVISION_CONFLICT", revision: 4, progress: {} };
      return { revision: 5, progress: {} };
    }),
  );
  const operation = outbox.enqueue("purchaseCharacter", {
    character: "warrior",
  });
  await outbox.drain();
  assert.deepEqual(ids, [operation.id, operation.id]);
  assert.equal(outbox.pending().length, 0);
});

test("repeated conflicts schedule a delayed retry with the same id", async () => {
  const store = storage(),
    ids = [];
  let calls = 0,
    retrySignals = 0,
    conflicts = true;
  const outbox = create(
    options(
      store,
      "account-a",
      async (operation) => {
        calls++;
        ids.push(operation.id);
        if (conflicts) throw { code: "REVISION_CONFLICT", revision: calls, progress: {} };
        return { revision: calls, progress: {} };
      },
      { onRetryable: () => retrySignals++ },
    ),
  );
  const operation = outbox.enqueue("unlockAchievement", { id: "boss_1" });
  await outbox.drain();
  assert.equal(calls, 2);
  assert.equal(retrySignals, 1);
  assert.equal(outbox.pending().length, 1);
  conflicts = false;
  await outbox.drain();
  assert.equal(outbox.pending().length, 0);
  assert.deepEqual(ids, [operation.id, operation.id, operation.id]);
});

test("terminal domain failures are dead-lettered and do not block order", async () => {
  for (const terminalCode of [
    "INVALID_PROGRESSION",
    "INSUFFICIENT_COINS",
    "UNTRUSTED_PROGRESSION",
  ]) {
    const store = storage(),
      sent = [],
      rejected = [];
    const outbox = create(
      options(
        store,
        `account-${terminalCode}`,
        async (operation) => {
          sent.push(operation.type);
          if (operation.type === "unlockAchievement") throw { code: terminalCode, status: 400 };
          return { revision: sent.length, progress: {} };
        },
        { onTerminal: (operation) => rejected.push(operation.type) },
      ),
    );
    outbox.enqueue("unlockAchievement", { id: "unknown" });
    outbox.enqueue("purchaseCharacter", { character: "warrior" });
    await outbox.drain();
    assert.deepEqual(sent, ["unlockAchievement", "purchaseCharacter"]);
    assert.deepEqual(rejected, ["unlockAchievement"]);
    assert.equal(outbox.pending().length, 0);
  }
});

test("session expiry preserves only the same account queue", async () => {
  const store = storage(),
    a = create(
      options(store, "account-a", async () => {
        throw { code: "SESSION_EXPIRED", status: 401 };
      }),
    );
  a.enqueue("unlockAchievement", { id: "boss_1" });
  await a.drain();
  const sentByB = [],
    b = create(
      options(store, "account-b", async (operation) => {
        sentByB.push(operation);
        return { revision: 1, progress: {} };
      }),
    );
  await b.drain();
  assert.equal(a.pending().length, 1);
  assert.deepEqual(sentByB, []);
  await a.drain();
  assert.equal(a.pending().length, 1);
});

test("successful operations preserve FIFO order and avoid redundant empty writes", async () => {
  const store = storage(),
    sent = [],
    outbox = create(
      options(store, "account-a", async (operation) => {
        sent.push(operation.type);
        return { revision: sent.length, progress: {} };
      }),
    );
  for (const type of ["awardCurrency", "unlockAchievement", "completeMap"])
    outbox.enqueue(type, {});
  await outbox.drain();
  assert.deepEqual(sent, ["awardCurrency", "unlockAchievement", "completeMap"]);
  assert.equal(store.writes.filter(([kind]) => kind === "remove").length, 1);
});

test("oversized legacy queues preserve the oldest operations in FIFO order", async () => {
  const accountId = "account-a";
  const legacy = Array.from({ length: 105 }, (_, index) => ({
    id: `legacy-${index + 1}`,
    type: "awardCurrency",
    payload: { amount: index + 1 },
  }));
  const store = storage([[keyForAccount(accountId), JSON.stringify(legacy)]]);
  const sent = [];
  const outbox = create(
    options(store, accountId, async (operation) => {
      sent.push(operation.id);
      return { revision: sent.length, progress: {} };
    }),
  );

  assert.equal(outbox.pending().length, MAX_OPERATIONS);
  assert.equal(outbox.pending()[0].id, "legacy-1");
  assert.equal(outbox.pending().at(-1).id, "legacy-100");
  await outbox.drain();
  assert.deepEqual(
    sent,
    legacy.slice(0, MAX_OPERATIONS).map(({ id }) => id),
  );
});

test("queue and payload limits are bounded", async () => {
  const store = storage(),
    outbox = create(options(store, "account-a", async () => new Promise(() => {})));
  for (let index = 0; index < MAX_TOTAL_OPERATIONS; index++)
    outbox.enqueue("awardCurrency", { amount: index });
  assert.throws(
    () => outbox.enqueue("awardCurrency", { amount: 1 }),
    (error) => error.code === "OUTBOX_FULL",
  );
  const other = create(options(storage(), "account-b", async () => ({})));
  assert.throws(
    () => other.enqueue("awardCurrency", { value: "x".repeat(20_000) }),
    /Invalid operation/,
  );
  assert.throws(() => other.enqueue("not-a-real-operation", {}), /Invalid operation/);
});

test("more than one hundred offline semantic events remain durable in FIFO active and backlog windows", async () => {
  const store = storage(),
    outbox = create(
      options(store, "long-offline", async () => {
        throw { code: "NETWORK_OFFLINE" };
      }),
    ),
    types = [
      ["awardCurrency", { amount: 1 }],
      ["unlockAchievement", { id: "boss_1" }],
      ["purchaseCharacter", { character: "warrior" }],
      ["awardSingleplayerResult", { time: 10, kills: 2, character: "scout" }],
      ["completeMap", { map: "ruins", mode: "normal" }],
    ];
  const accepted = Array.from({ length: 175 }, (_, index) => {
    const [type, payload] = types[index % types.length];
    return outbox.enqueue(type, payload);
  });
  await outbox.drain();
  const state = outbox.state(),
    reloaded = create(options(store, "long-offline", async () => ({ revision: 1, progress: {} })));
  assert.equal(state.active.length, MAX_OPERATIONS);
  assert.equal(state.backlog.length, 75);
  assert.deepEqual(
    reloaded.pending().map(({ id }) => id),
    accepted.map(({ id }) => id),
  );
});

test("failed enqueue persistence rolls RAM back and retry creates only one durable operation", () => {
  const store = storage();
  let fail = true;
  const nativeSet = store.setItem;
  store.setItem = (key, value) => {
    if (fail) throw new Error("quota");
    nativeSet(key, value);
  };
  const outbox = create(options(store, "transactional-enqueue", async () => ({})));
  assert.throws(() => outbox.enqueue("awardCurrency", { amount: 1 }, "stable-operation"), /quota/);
  assert.deepEqual(outbox.pending(), []);
  fail = false;
  outbox.enqueue("awardCurrency", { amount: 1 }, "stable-operation");
  assert.deepEqual(
    outbox.pending().map(({ id }) => id),
    ["stable-operation"],
  );
});

test("hard-cap rejection is controlled for every semantic operation type", () => {
  const payloads = {
    awardCurrency: { amount: 1 },
    unlockAchievement: { id: "boss_1" },
    purchaseCharacter: { character: "warrior" },
    awardSingleplayerResult: { time: 1, kills: 1, character: "scout" },
    completeMap: { map: "ruins", mode: "normal" },
  };
  for (const [type, payload] of Object.entries(payloads)) {
    const outbox = create(options(storage(), `full-${type}`, async () => new Promise(() => {})));
    for (let index = 0; index < MAX_TOTAL_OPERATIONS; index++)
      outbox.enqueue("awardCurrency", { amount: 1 });
    assert.throws(
      () => outbox.enqueue(type, payload),
      (error) => error.code === "OUTBOX_FULL",
    );
    assert.equal(outbox.pending().length, MAX_TOTAL_OPERATIONS);
    outbox.cancel();
  }
});

test("maintenance persistence failure retains the same sent operation for idempotent retry", async () => {
  const store = storage(),
    sent = [];
  let failRemove = true;
  const nativeRemove = store.removeItem;
  store.removeItem = (key) => {
    if (failRemove) throw new Error("remove failed");
    nativeRemove(key);
  };
  const outbox = create(
    options(store, "transactional-shift", async (operation) => {
      sent.push(operation.id);
      return { revision: sent.length, progress: {} };
    }),
  );
  outbox.enqueue("awardCurrency", { amount: 1 }, "maintenance-operation");
  await outbox.drain();
  assert.deepEqual(
    outbox.pending().map(({ id }) => id),
    ["maintenance-operation"],
  );
  failRemove = false;
  await outbox.drain();
  assert.deepEqual(sent, ["maintenance-operation", "maintenance-operation"]);
  assert.deepEqual(outbox.pending(), []);
});

test("terminal maintenance failure is contained and retains FIFO for deterministic retry", async () => {
  const store = storage();
  let failRemove = true,
    retryable = 0;
  const nativeRemove = store.removeItem;
  store.removeItem = (key) => {
    if (failRemove) throw new Error("remove failed");
    nativeRemove(key);
  };
  const box = create(
    options(
      store,
      "terminal-maintenance",
      async () => {
        throw { code: "INVALID_PROGRESSION", status: 400 };
      },
      { onRetryable: () => retryable++ },
    ),
  );
  box.enqueue("unlockAchievement", { id: "unknown" }, "terminal-operation");
  await box.drain();
  assert.equal(retryable, 1);
  assert.deepEqual(
    box.pending().map(({ id }) => id),
    ["terminal-operation"],
  );
  failRemove = false;
  await box.drain();
  assert.deepEqual(box.pending(), []);
});

test("failed backlog promotion leaves active and backlog FIFO unchanged", async () => {
  const store = storage(),
    sent = [];
  let failPromotion = false;
  const nativeSet = store.setItem;
  store.setItem = (key, value) => {
    if (failPromotion) throw new Error("promotion failed");
    nativeSet(key, value);
  };
  const outbox = create(
    options(store, "transactional-promotion", async (operation) => {
      sent.push(operation.id);
      return { revision: sent.length, progress: {} };
    }),
  );
  outbox.cancel();
  for (let index = 0; index <= MAX_OPERATIONS; index++)
    outbox.enqueue("awardCurrency", { amount: 1 }, `promotion-${index}`);
  const reloaded = create(
    options(store, "transactional-promotion", async (operation) => {
      sent.push(operation.id);
      return { revision: sent.length, progress: {} };
    }),
  );
  failPromotion = true;
  await reloaded.drain();
  assert.deepEqual(
    reloaded.pending().map(({ id }) => id),
    outbox.pending().map(({ id }) => id),
  );
  failPromotion = false;
  await reloaded.drain();
  assert.equal(sent[0], "promotion-0");
  assert.equal(sent[1], "promotion-0");
  assert.deepEqual(reloaded.pending(), []);
});

test("lost response retries the same id and applies the reward once", async () => {
  const store = storage(),
    applied = new Set(),
    ids = [];
  let rewards = 0,
    loseResponse = true;
  const send = async (operation) => {
    ids.push(operation.id);
    if (!applied.has(operation.id)) {
      applied.add(operation.id);
      rewards++;
    }
    if (loseResponse) {
      loseResponse = false;
      throw { code: "SERVER_UNAVAILABLE" };
    }
    return { revision: 1, progress: {} };
  };
  const first = create(options(store, "account-a", send));
  const operation = first.enqueue("awardCurrency", { amount: 5 });
  await first.drain();
  const reloaded = create(options(store, "account-a", send));
  await reloaded.drain();
  assert.deepEqual(ids, [operation.id, operation.id]);
  assert.equal(rewards, 1);
  assert.equal(reloaded.pending().length, 0);
});

test("one failed drain emits one retry signal without internal polling", async () => {
  const store = storage();
  let retrySignals = 0;
  const outbox = create(
    options(
      store,
      "account-a",
      async () => {
        throw { code: "SERVER_UNAVAILABLE" };
      },
      { onRetryable: () => retrySignals++ },
    ),
  );
  outbox.enqueue("unlockAchievement", { id: "boss_1" });
  await outbox.drain();
  assert.equal(retrySignals, 1);
  assert.equal(outbox.pending().length, 1);
});

test("payload limit measures UTF-8 bytes", () => {
  const outbox = create(options(storage(), "account-a", async () => ({})));
  assert.doesNotThrow(() => outbox.enqueue("awardCurrency", { note: "😀".repeat(4_000) }));
  assert.throws(
    () => outbox.enqueue("awardCurrency", { note: "😀".repeat(4_100) }),
    /Invalid operation/,
  );
});

test("cancel prevents a previous account drain from starting another request", async () => {
  const store = storage(),
    sentA = [],
    sentB = [];
  let releaseFirst;
  const firstRequest = new Promise((resolve) => (releaseFirst = resolve));
  const a = create(
    options(store, "account-a", async (operation) => {
      sentA.push(operation.type);
      if (sentA.length === 1) await firstRequest;
      return { revision: sentA.length, progress: {} };
    }),
  );
  a.enqueue("awardCurrency", { amount: 1 });
  a.enqueue("unlockAchievement", { id: "boss_1" });
  await settle();
  a.cancel();
  releaseFirst();
  await a.drain();
  assert.deepEqual(sentA, ["awardCurrency"]);
  assert.equal(a.pending().length, 1);
  const b = create(
    options(store, "account-b", async (operation) => {
      sentB.push(operation.type);
      return { revision: 1, progress: {} };
    }),
  );
  await b.drain();
  assert.deepEqual(sentB, []);
  const restoredA = create(
    options(store, "account-a", async (operation) => {
      sentA.push(operation.type);
      return { revision: 2, progress: {} };
    }),
  );
  await restoredA.drain();
  assert.deepEqual(sentA, ["awardCurrency", "unlockAchievement"]);
});

test("account progress facade converts synchronous OUTBOX_FULL into rejection", async () => {
  const account = require("../account-client"),
    error = Object.assign(new Error("full"), { code: "OUTBOX_FULL" }),
    outbox = {
      enqueue() {
        throw error;
      },
    };
  let promise;
  assert.doesNotThrow(() => {
    promise = account.enqueueProgress(outbox, "awardCurrency", { amount: 1 });
  });
  await assert.rejects(promise, (candidate) => candidate === error);
});

test("retry controller has one bounded backoff timer and honors Retry-After", () => {
  const { createRetryController } = require("../account-client"),
    scheduled = [],
    cleared = [],
    runs = [],
    controller = createRetryController({
      run: () => runs.push("run"),
      setTimer(callback, delay) {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      clearTimer: (id) => cleared.push(id),
    });
  assert.equal(controller.schedule({}), true);
  assert.equal(controller.schedule({}), false);
  assert.equal(scheduled[0].delay, 5_000);
  scheduled[0].callback();
  assert.equal(controller.schedule({}), true);
  assert.equal(scheduled[1].delay, 10_000);
  scheduled[1].callback();
  assert.equal(controller.schedule({ retryAfterMs: 30_000 }), true);
  assert.equal(scheduled[2].delay, 30_000);
  controller.reset();
  scheduled[2].callback();
  assert.equal(controller.schedule({}), true);
  assert.equal(scheduled[3].delay, 5_000);
  controller.cancel();
  assert.deepEqual(runs, ["run", "run", "run"]);
  assert.ok(cleared.length > 0);
});

test("autosave failure does not deadlock progression sequencing", async () => {
  const { SyncController } = require("../account-client");
  let retryCallback,
    autosaveCalls = 0;
  const controller = new SyncController({
    getSnapshot: () => ({}),
    send: async () => {
      autosaveCalls++;
      throw new Error("offline");
    },
    setTimer(callback) {
      retryCallback = callback;
      return 1;
    },
    clearTimer() {},
  });
  controller.initialize(0);
  controller.markDirty();
  await controller.settlePending();
  assert.equal(controller.inFlight, false);
  assert.equal(controller.dirty, true);
  assert.equal(typeof retryCallback, "function");
  assert.equal(autosaveCalls, 1);
});

test("client-owned generations protect pending and in-flight writes from stale reconciles", async () => {
  const {
    ClientWriteTracker,
    SyncController,
    applyProgress,
    snapshot,
  } = require("../account-client");
  const store = storage(),
    tracker = new ClientWriteTracker(),
    sent = [];
  let release;
  const firstResponse = new Promise((resolve) => (release = resolve));
  store.setItem("swarmfall-save-v1", "A");
  tracker.mark("swarmfall-save-v1");
  const controller = new SyncController({
    getSnapshot: () => snapshot(store, tracker.keys),
    onSnapshot: () => tracker.begin(),
    onSnapshotSettled: (token, success) => tracker.settle(token, success),
    send: async (progress) => {
      sent.push(progress);
      if (sent.length === 1) return firstResponse;
      return { revision: 3, progress };
    },
    onReconcile: ({ progress }) => applyProgress(store, progress, tracker.protectedKeys()),
  });
  controller.initialize(0);
  controller.markDirty();
  await settle();
  store.setItem("swarmfall-save-v1", "B");
  tracker.mark("swarmfall-save-v1");
  controller.markPending();
  controller.reconcile({
    revision: 1,
    progress: { "swarmfall-save-v1": "OLD", "swarmfall-stats": "server-stats" },
  });
  assert.equal(store.getItem("swarmfall-save-v1"), "B");
  assert.equal(store.getItem("swarmfall-stats"), "server-stats");
  release({ revision: 2, progress: { "swarmfall-save-v1": "A" } });
  await controller.settlePending();
  assert.deepEqual(
    sent.map((value) => value["swarmfall-save-v1"]),
    ["A", "B"],
  );
  assert.equal(store.getItem("swarmfall-save-v1"), "B");
  assert.equal(controller.revision, 3);
  controller.reconcile({ revision: 4, progress: { "swarmfall-save-v1": "SERVER" } });
  assert.equal(store.getItem("swarmfall-save-v1"), "SERVER");
});

test("boot writes and account switches establish a clean client-write baseline", async () => {
  const {
    ClientWriteTracker,
    SyncController,
    applyProgress,
    snapshot,
  } = require("../account-client");
  const store = storage(),
    tracker = new ClientWriteTracker();
  let release;
  const response = new Promise((resolve) => (release = resolve));
  const controller = new SyncController({
    getSnapshot: () => snapshot(store, tracker.keys),
    onInitialize: () => tracker.reset(),
    onSnapshot: () => tracker.begin(),
    onSnapshotSettled: (token, success) => tracker.settle(token, success),
    send: () => response,
    onReconcile: ({ progress }) => applyProgress(store, progress, tracker.protectedKeys()),
  });
  const localWrite = (key, value) => {
    store.setItem(key, value);
    if (controller.enabled) {
      tracker.mark(key);
      controller.markPending();
    }
  };

  localWrite("swarmfall-character", "scout");
  assert.deepEqual([...tracker.protectedKeys()], []);
  controller.initialize(1);
  controller.reconcile({ revision: 2, progress: { "swarmfall-character": "druid" } });
  assert.equal(store.getItem("swarmfall-character"), "druid");

  localWrite("swarmfall-character", "warrior");
  controller.retryNow();
  await settle();
  controller.reconcile({ revision: 3, progress: { "swarmfall-character": "scout" } });
  assert.equal(store.getItem("swarmfall-character"), "warrior");
  release({ revision: 4, progress: { "swarmfall-character": "warrior" } });
  await controller.settlePending();
  controller.reconcile({ revision: 5, progress: { "swarmfall-character": "druid" } });
  assert.equal(store.getItem("swarmfall-character"), "druid");

  tracker.mark("swarmfall-character");
  assert.deepEqual([...tracker.protectedKeys()], ["swarmfall-character"]);
  controller.initialize(10);
  assert.deepEqual([...tracker.protectedKeys()], []);
  controller.reconcile({ revision: 11, progress: { "swarmfall-character": "scout" } });
  assert.equal(store.getItem("swarmfall-character"), "scout");
});

test("PUT snapshots and dirty tracking remain restricted to client-owned keys", () => {
  const accountSource = require("node:fs").readFileSync(
    require.resolve("../account-client"),
    "utf8",
  );
  const account = require("../account-client"),
    store = storage([
      ["swarmfall-stats", "stats"],
      ["swarmfall-save-v1", "save"],
      ["swarmfall-character", "druid"],
    ]);
  assert.deepEqual(account.snapshot(store, account.CLIENT_PROGRESS_KEY_SET), {
    "swarmfall-save-v1": "save",
    "swarmfall-character": "druid",
  });
  assert.match(
    accountSource,
    /CLIENT_PROGRESS_KEY_SET\.has\(key\).*clientWrites\.mark\(key\);sync\.markPending\(\)/,
  );
  assert.doesNotMatch(
    accountSource,
    /ACCOUNT_PROGRESS_KEY_SET\.has\(String\(key\)\).*sync\.markPending/,
  );
});
