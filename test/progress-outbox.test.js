"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  create,
  createAndDrain,
  keyForAccount,
  DEFAULT_KEY,
  MAX_OPERATIONS,
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
  for (const terminalCode of ["INVALID_PROGRESSION", "INSUFFICIENT_COINS"]) {
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
  for (let index = 0; index < MAX_OPERATIONS; index++)
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
