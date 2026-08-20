'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateSingleplayerSave,startupFlow}=require('../save-state');
const valid={mode:'singleplayer',version:3,elapsed:10,chosenCharacter:'scout',chosenMap:'ruins',player:{x:10,y:20,hp:80,maxHp:100},enemies:[],bullets:[],orbs:[]};
test('only valid singleplayer saves activate Continue',()=>{assert.equal(validateSingleplayerSave(valid),true);assert.equal(validateSingleplayerSave({...valid,mode:'multiplayer'}),false);assert.equal(validateSingleplayerSave({...valid,player:{hp:NaN}}),false);assert.equal(validateSingleplayerSave({broken:true}),false)});
test('startup flow prioritizes multiplayer reconnect over singleplayer Continue',()=>{assert.equal(startupFlow({code:'ABC234',playerId:'p1'},valid),'multiplayer-reconnect');assert.equal(startupFlow(null,valid),'singleplayer-continue');assert.equal(startupFlow(null,{broken:true}),'fresh-menu')});
