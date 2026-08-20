'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {server,lobbies,tickLobby}=require('../server');
let port;
test.before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));port=server.address().port});
test.after(async()=>{lobbies.clear();await new Promise(resolve=>server.close(resolve))});
test('serves the game client',async()=>{const response=await fetch(`http://127.0.0.1:${port}/`);assert.equal(response.status,200);assert.match(await response.text(),/SWARMFALL/)});
test('creates a lobby through a real WebSocket connection',async()=>{const ws=new WebSocket(`ws://127.0.0.1:${port}`);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});ws.send(JSON.stringify({type:'hello',clientId:'test-player',unlocked:['scout']}));ws.send(JSON.stringify({type:'createLobby',character:'scout'}));const data=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Lobby response timeout')),1000);ws.onmessage=event=>{const parsed=JSON.parse(event.data);if(parsed.type==='lobbyState'){clearTimeout(timer);resolve(parsed)}}});assert.match(data.lobby.code,/^[A-Z2-9]{6}$/);assert.equal(data.lobby.players[0].host,true);ws.close()});
test('authoritative tick advances a running match',()=>{const lobby={map:'ruins',players:[],game:{tick:0,time:0,level:1,xp:0,nextXp:24,paused:false,levelRound:0,players:{},enemies:[],bullets:[],spawn:10}};tickLobby(lobby,.04);assert.equal(lobby.game.tick,1);assert.equal(lobby.game.time,.04)});
