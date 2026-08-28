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
  assert.throws(
    () => create({ storage: store }),
    /stable account id is required/,
  );
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

test("network and HTTP 5xx failures retain the same operation", async () => {
  for (const error of [
    { code: "NETWORK_OFFLINE" },
    { code: "SERVER_UNAVAILABLE" },
    { code: "REQUEST_FAILED", status: 503 },
  ]) {
    const store = storage(),
      ids = [],
      outbox = create(
        options(
          store,
          `account-${error.status || error.code}`,
          async (operation) => {
            ids.push(operation.id);
            throw error;
          },
        ),
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
      if (++calls === 1)
        throw { code: "REVISION_CONFLICT", revision: 4, progress: {} };
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

test("repeated conflicts are bounded and do not spin forever", async () => {
  const store = storage();
  let calls = 0;
  const outbox = create(
    options(store, "account-a", async () => {
      calls++;
      throw { code: "REVISION_CONFLICT", revision: calls, progress: {} };
    }),
  );
  outbox.enqueue("unlockAchievement", { id: "boss_1" });
  await outbox.drain();
  assert.equal(calls, 2);
  assert.equal(outbox.pending().length, 1);
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
          if (operation.type === "bad")
            throw { code: terminalCode, status: 400 };
          return { revision: sent.length, progress: {} };
        },
        { onTerminal: (operation) => rejected.push(operation.type) },
      ),
    );
    outbox.enqueue("bad", {});
    outbox.enqueue("good", {});
    await outbox.drain();
    assert.deepEqual(sent, ["bad", "good"]);
    assert.deepEqual(rejected, ["bad"]);
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
  for (const type of ["A", "B", "C"]) outbox.enqueue(type, {});
  await outbox.drain();
  assert.deepEqual(sent, ["A", "B", "C"]);
  assert.equal(store.writes.filter(([kind]) => kind === "remove").length, 1);
});

test("queue and payload limits are bounded", async () => {
  const store = storage(),
    outbox = create(
      options(store, "account-a", async () => new Promise(() => {})),
    );
  for (let index = 0; index < MAX_OPERATIONS; index++)
    outbox.enqueue(`operation-${index}`, {});
  assert.throws(
    () => outbox.enqueue("overflow", {}),
    (error) => error.code === "OUTBOX_FULL",
  );
  const other = create(options(storage(), "account-b", async () => ({})));
  assert.throws(
    () => other.enqueue("huge", { value: "x".repeat(20_000) }),
    /Invalid operation/,
  );
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
