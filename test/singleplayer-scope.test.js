"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  Progress = require("../singleplayer-progress");

function storage(entries = []) {
  const values = new Map(entries);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}
function session(id) {
  return storage(id ? [[Progress.ACTIVE_ACCOUNT_KEY, id]] : []);
}

test("local single-player progress is isolated by immutable account id", () => {
  const local = storage(),
    allowed = new Set(["boss_1", "map_1"]),
    a = session("user-a"),
    b = session("user-b");
  const progressA = Progress.array(local, a, "achievements-v1", [], allowed);
  local.setItem(progressA.key, JSON.stringify(["boss_1"]));
  const normalizeObject = (value) => (value && typeof value === "object" ? value : {}),
    statsA = Progress.object(local, a, "stats-v1", [], normalizeObject),
    modesA = Progress.array(local, a, "modes", [], new Set(["normal", "hard"]));
  local.setItem(statsA.key, JSON.stringify({ totalKills: 12 }));
  local.setItem(modesA.key, JSON.stringify(["normal"]));
  const progressB = Progress.array(local, b, "achievements-v1", [], allowed);
  assert.deepEqual(progressB.value, []);
  assert.deepEqual(Progress.object(local, b, "stats-v1", [], normalizeObject).value, {});
  assert.deepEqual(Progress.array(local, b, "modes", [], new Set(["normal", "hard"])).value, []);
  local.setItem(progressB.key, JSON.stringify(["map_1"]));
  assert.deepEqual(Progress.array(local, a, "achievements-v1", [], allowed).value, ["boss_1"]);
  assert.deepEqual(Progress.object(local, a, "stats-v1", [], normalizeObject).value, {
    totalKills: 12,
  });
  assert.deepEqual(Progress.array(local, a, "modes", [], new Set(["normal", "hard"])).value, [
    "normal",
  ]);
  assert.notEqual(progressA.key, progressB.key);
  assert.match(Progress.key("stats-v1", session()), /:guest:/);
});

test("legacy progress is claimed once, merged safely and never imported by another account", () => {
  const local = storage([["swarmfall-singleplayer-modes", '["normal","hard","invalid","hard"]']]),
    allowed = new Set(["normal", "hard", "nightmare", "endless"]),
    a = session("user-a"),
    b = session("user-b"),
    first = Progress.array(local, a, "modes", ["swarmfall-singleplayer-modes"], allowed);
  assert.deepEqual(first.value, ["normal", "hard"]);
  assert.equal(local.getItem("swarmfall-singleplayer-modes"), '["normal","hard","invalid","hard"]');
  local.setItem("swarmfall-singleplayer-modes", '["nightmare"]');
  assert.deepEqual(
    Progress.array(local, a, "modes", ["swarmfall-singleplayer-modes"], allowed).value,
    ["normal", "hard"],
  );
  assert.deepEqual(
    Progress.array(local, b, "modes", ["swarmfall-singleplayer-modes"], allowed).value,
    [],
  );
});

test("character, map and difficulty access is enforced at fresh and resume boundaries", () => {
  const access = {
    unlocked: new Set(["scout"]),
    completed: new Set(),
    toxicUnlocked: false,
  };
  assert.deepEqual(
    Progress.sanitizeSelection({ character: "warrior", map: "toxic", mode: "nightmare" }, access),
    { character: "scout", map: "ruins", mode: "normal" },
  );
  assert.equal(
    Progress.canResume(
      { chosenCharacter: "warrior", chosenMap: "ruins", chosenMode: "normal" },
      access,
    ),
    false,
  );
  const unlocked = {
    unlocked: new Set(["scout", "warrior"]),
    completed: new Set(["normal", "hard"]),
    toxicUnlocked: true,
  };
  assert.equal(
    Progress.canResume(
      { chosenCharacter: "warrior", chosenMap: "toxic", chosenMode: "nightmare" },
      unlocked,
    ),
    true,
  );
});

test("a completed purchase unlocks its character but cannot overtake a newer selection intent", async () => {
  const guard = Progress.createIntentGuard(),
    unlocked = new Set(["scout"]),
    selected = { value: "scout" };
  let resolvePurchase;
  const purchase = new Promise((resolve) => (resolvePurchase = resolve)),
    oldIntent = guard.begin(),
    completion = purchase.then(() => {
      unlocked.add("warrior");
      if (guard.isCurrent(oldIntent)) selected.value = "warrior";
    });
  guard.begin();
  selected.value = "scout";
  resolvePurchase();
  await completion;
  assert.equal(unlocked.has("warrior"), true);
  assert.equal(selected.value, "scout");
});
