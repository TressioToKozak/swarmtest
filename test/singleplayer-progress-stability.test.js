"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
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

function terminalHarness(storage = memoryStorage()) {
  const source = section("singleplayerTerminalKey", "renderDifficulty").replace(
      /addEventListener\('swarm-account-ready'[^\n]+\n/,
      "",
    ),
    effects = { clears: 0, reloads: 0 };
  const api = Function(
    "localStorage",
    "location",
    "TERMINAL_KEY",
    "clearGameSave",
    `let singleplayerTerminalDescriptor=null,singleplayerAccountId='account-id',running=true,paused=false;${source};return{beginSingleplayerTerminal,retrySingleplayerResultAndReload,restoreSingleplayerTerminal,nextRun(){running=true;paused=false},state(){return{running,paused,singleplayerTerminalDescriptor}}}`,
  )(storage, { reload: () => effects.reloads++ }, "terminal-key", () => effects.clears++);
  return { api, effects, storage };
}

test("single-player multi-kill counts every death with one batch stats persistence", () => {
  const deaths = game.slice(
      game.indexOf("const enemyCountBeforeDeaths"),
      game.indexOf("let enemyWrite", game.indexOf("const enemyCountBeforeDeaths")),
    ),
    updates = ["player.kills++;", "singleplayerStats.totalKills++;", "deathStatsChanged=true;"];
  for (const update of updates) assert.match(deaths, new RegExp(update.replace(/[.+]/g, "\\$&")));
  assert.equal((deaths.match(/saveStats\(\)/g) || []).length, 1);
  let writes = 0;
  const result = Function(
    "saveStats",
    `const player={kills:0},singleplayerStats={totalKills:0};let deathStatsChanged=false;for(let index=0;index<30;index++){${updates.join("")}}if(deathStatsChanged)saveStats();return{player,singleplayerStats}`,
  )(() => writes++);
  assert.equal(result.player.kills, 30);
  assert.equal(result.singleplayerStats.totalKills, 30);
  assert.equal(writes, 1);
});

test("normal single-player flow never queues server-rejected progression operations", () => {
  for (const type of [
    "awardCurrency",
    "awardSingleplayerResult",
    "unlockAchievement",
    "completeMap",
  ])
    assert.doesNotMatch(game, new RegExp(`accountProgress\\('${type}'`));
  assert.match(game, /accountProgress\('purchaseCharacter'/);
});

test("death and victory finish locally without descriptors, retries, or forced reloads", () => {
  for (const kind of ["death", "victory"]) {
    const legacy = { version: 1, kind, result: { id: "legacy-result" } },
      harness = terminalHarness(
        memoryStorage([["terminal-key:account-id", JSON.stringify(legacy)]]),
      );
    harness.api.restoreSingleplayerTerminal();
    assert.equal(harness.storage.getItem("terminal-key:account-id"), null);
    assert.equal(harness.api.beginSingleplayerTerminal(kind === "victory"), true);
    assert.deepEqual(harness.api.state(), {
      running: false,
      paused: true,
      singleplayerTerminalDescriptor: null,
    });
    assert.deepEqual(harness.effects, { clears: 1, reloads: 0 });
    harness.api.nextRun();
    assert.deepEqual(harness.api.state(), {
      running: true,
      paused: false,
      singleplayerTerminalDescriptor: null,
    });
  }
  const start = section("start", "continueGame");
  assert.doesNotMatch(start, /singleplayerTerminalDescriptor|account\.saving|retrySingleplayer/);
});

test("single-player rewards cannot increase the server-owned account coin balance or UI", () => {
  const currency = section("awardCurrency", "formatTime"),
    achievement = section("achievementUnlock", "hasMultiplayerSession"),
    render = section("renderAchievements", "achievementUnlock"),
    award = Function(`${currency};return awardCurrency`)(),
    accountStats = { coins: 10 };
  assert.equal(award(100, "forged local reward"), false);
  assert.equal(accountStats.coins, 10);
  assert.doesNotMatch(currency, /savedStats\.coins|showCoinToast|accountProgress/);
  assert.doesNotMatch(achievement, /savedStats\.coins|accountProgress|entry\.reward/);
  assert.doesNotMatch(render, /entry\.reward|rewards\.gold/);
  assert.match(game, /LOCAL_STATS_KEY='swarmfall-singleplayer-stats-v1'/);
  assert.match(game, /coins:accountStats\.coins/);
  assert.doesNotMatch(section("saveStats", "updateCoinDisplays"), /swarmfall-stats/);
});

test("loot collection persists the run once after its batch", () => {
  const collect = section("collectLoot", "hitCrates");
  assert.equal((collect.match(/saveGame\(\)/g) || []).length, 1);
  assert.match(collect, /if\(collected\)saveGame\(\)/);
});

test("single-player upgrade candidates use deterministic Fisher-Yates without random sort", () => {
  const source = section("shuffleUpgradeCandidates", "upgradeCandidates"),
    shuffle = Function(`${source};return shuffleUpgradeCandidates`)(),
    sequence = [0.1, 0.8, 0.3],
    values = ["a", "b", "c", "d"];
  assert.deepEqual(
    shuffle(values, () => sequence.shift()),
    ["b", "d", "c", "a"],
  );
  assert.deepEqual(new Set(values), new Set(["a", "b", "c", "d"]));
  assert.doesNotMatch(game, /sort\([^)]*Math\.random|sort\(\(\)=>Math\.random/);
  assert.match(
    section("upgradeCandidates", "upgradeCardFromKey"),
    /preferred.*other.*shuffleUpgradeCandidates/s,
  );
});
