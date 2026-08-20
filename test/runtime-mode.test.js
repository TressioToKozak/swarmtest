'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {singleplayerSimulationAllowed}=require('../multiplayer-visual-state');

test('disconnected multiplayer mode never permits singleplayer simulation fallback',()=>{assert.equal(singleplayerSimulationAllowed(true),false);assert.equal(singleplayerSimulationAllowed(false),true)});
test('frontend routes loop, ESC, abilities and pause buttons by multiplayer mode',()=>{const source=fs.readFileSync(require.resolve('../game.js'),'utf8');assert.match(source,/running&&window\.SwarmMultiplayerSync\?\.isMultiplayerMode\(\)/);assert.match(source,/if\(multiplayer\)window\.SwarmMultiplayerSync\.toggleLocalMenu\(\)/);assert.match(source,/if\(multiplayer\)\{if\(window\.SwarmMultiplayerSync\.isActive\(\)\)window\.SwarmMultiplayerSync\.pressAbility/);assert.match(source,/function togglePause\(\)\{if\(window\.SwarmMultiplayerSync\?\.isMultiplayerMode\(\)\)/)});
