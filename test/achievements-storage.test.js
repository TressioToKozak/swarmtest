"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  Progress = require("../singleplayer-progress");
const source = fs.readFileSync(require.resolve("../achievements.js"), "utf8");

function boot(current, legacy) {
  const values = new Map(),
    localStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    },
    sessionStorage = {
      getItem: (key) => (key === Progress.ACTIVE_ACCOUNT_KEY ? "account-a" : null),
    };
  if (current !== undefined) values.set("swarmfall-singleplayer-achievements-v1", current);
  if (legacy !== undefined) values.set("swarmfall-achievements-v1", legacy);
  const context = {
    window: {},
    localStorage,
    sessionStorage,
    SwarmSingleplayerProgress: Progress,
    console,
  };
  vm.runInNewContext(source, context);
  return { achievements: context.window.Achievements, values };
}

test("achievement migration rejects malformed and wrong JSON types without crashing", () => {
  for (const value of ["not-json", "{}", "null", "42"])
    assert.doesNotThrow(() => {
      const result = boot(value);
      assert.deepEqual([...result.achievements.completed], []);
    });
});

test("achievement migration keeps only known unique ids across current and legacy arrays", () => {
  const result = boot('["boss_1","unknown","boss_1"]', '["map_1","boss_1"]');
  assert.deepEqual([...result.achievements.completed], ["boss_1", "map_1"]);
  const scoped = [...result.values.entries()].find(([key]) =>
    key.includes(":account:account-a:achievements-v1"),
  );
  assert.deepEqual(JSON.parse(scoped[1]), ["boss_1", "map_1"]);
  assert.equal(
    result.achievements.definitions.some((entry) => "reward" in entry),
    false,
  );
});
