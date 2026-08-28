"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { create } = require("../progress-outbox");
function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

test("outbox keeps one operation id across network failure and reload", async () => {
  const store = storage(),
    seen = [];
  let fail = true,
    revision = 0;
  const options = {
    storage: store,
    key: "queue",
    createId: () => "operation-1",
    getRevision: () => revision,
    reconcile: (r) => (revision = r.revision),
    send: async (operation) => {
      seen.push(operation.id);
      if (fail) {
        fail = false;
        throw Object.assign(new Error("offline"), { code: "NETWORK_OFFLINE" });
      }
      return { revision: 1, progress: {} };
    },
  };
  const first = create(options),
    operation = first.enqueue("unlockAchievement", { id: "boss_1" });
  await first.drain();
  assert.equal(first.pending().length, 1);
  const afterReload = create(options);
  await afterReload.drain();
  assert.deepEqual(seen, ["operation-1", "operation-1"]);
  assert.equal(afterReload.pending().length, 0);
  assert.equal(operation.id, "operation-1");
});

test("lost response and revision conflict retry exactly the same id", async () => {
  const store = storage(),
    ids = [];
  let calls = 0,
    revision = 0;
  const outbox = create({
    storage: store,
    createId: () => "stable-operation",
    getRevision: () => revision,
    reconcile: (r) => (revision = r.revision),
    send: async (operation) => {
      ids.push(operation.id);
      calls++;
      if (calls === 1)
        throw { code: "REVISION_CONFLICT", revision: 4, progress: {} };
      return { revision: 5, progress: {} };
    },
  });
  outbox.enqueue("purchaseCharacter", { character: "warrior" });
  await outbox.drain();
  assert.deepEqual(ids, ["stable-operation", "stable-operation"]);
  assert.equal(revision, 5);
  assert.equal(outbox.pending().length, 0);
});
