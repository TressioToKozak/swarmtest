'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {update,sample}=require('../multiplayer-visual-state');
const {GameServer}=require('../server');

function match(random=()=>.25){let now=1000;const core=new GameServer(()=>now,random),client=core.addClient(()=>{});core.handle(client,{type:'hello',installationId:'host',unlocked:[],maps:['ruins']});now+=2000;core.handle(client,{type:'createLobby'});const lobby=core.lobbies.get(client.lobby);core.start(lobby);return{core,lobby,game:lobby.game,player:lobby.game.players[client.playerId]}}

test('25 Hz snapshots interpolate monotonically at a 60 Hz render rate',()=>{
  const cache=new Map(),id='remote',base={id,y:100,character:'scout',name:'Remote',hp:100,maxHp:100,alive:true,facing:0,attackSeq:0,abilitySeq:0};
  update(cache,[{...base,x:0}],0);let rendered=0,maxFrameStep=0;
  for(let tick=1;tick<=75;tick++){
    const snapshotAt=tick*40;update(cache,[{...base,x:tick*10}],snapshotAt);
    for(let frame=1;frame<=3;frame++){const x=sample(cache.get(id),snapshotAt+frame*1000/60,72).x;assert.ok(x>=rendered-1e-9,'interpolation must never move backwards');maxFrameStep=Math.max(maxFrameStep,x-rendered);rendered=x}
  }
  assert.ok(rendered>730&&rendered<=750);assert.ok(maxFrameStep<10,'render frames must not snap an entire server tick');
});

test('authoritative 25 Hz simulation stays finite during a four-player stress run',()=>{
  const h=match(()=>.25),template=h.player;
  for(let i=1;i<4;i++)h.game.players[`p${i}`]={...template,id:`p${i}`,x:template.x+i*25,y:template.y,stats:{...template.stats,cooldowns:{q:0,e:0,r:0}},input:{right:i%2===0,left:i%2===1,aim:i*Math.PI/2,received:true},items:{},augments:[],shot:0};
  for(let tick=0;tick<25*20;tick++)h.core.tick(h.lobby,1/25);
  for(const player of Object.values(h.game.players)){assert.ok(Number.isFinite(player.x)&&Number.isFinite(player.y));assert.ok(player.x>=0&&player.x<=3000&&player.y>=0&&player.y<=2200)}
  for(const entity of [...h.game.enemies,...h.game.bullets,...h.game.enemyBullets])assert.ok(Number.isFinite(entity.x)&&Number.isFinite(entity.y));
  assert.equal(h.game.tick,500);assert.ok(h.game.enemies.length<200,'paced waves must keep entity count bounded');
});

test('enemy spawning follows the team and matches single-player scaling and swarm packs',()=>{
  const h=match(()=>0);h.player.x=600;h.player.y=600;h.game.time=400;h.core.spawnEnemy(h.lobby,'melee');const enemy=h.game.enemies[0];assert.ok(Math.hypot(enemy.x-h.player.x,enemy.y-h.player.y)<800);assert.equal(enemy.maxHp,22*(1+400*.0025));
  h.game.enemies=[];h.core.spawnEnemy(h.lobby,'swarm');assert.equal(h.game.enemies.length,5);assert.ok(h.game.enemies.every(e=>e.type==='swarm'));
});
test('fixed-step accumulator bounds catch-up after an event-loop stall',()=>{const {createFixedStepper}=require('../server'),step=createFixedStepper(1/30,5,.25);assert.equal(step(.04),1);assert.equal(step(.04),1);assert.equal(step(.16),5);assert.ok(step(.04)<=2)});
test('simulation and snapshot rates are separated',()=>{const {TICK_RATE,SNAPSHOT_RATE}=require('../server');assert.equal(TICK_RATE,30);assert.equal(SNAPSHOT_RATE,20);const h=match(),messages=[];for(const member of h.lobby.players){const client=h.core.currentConnection(member.id);client.send=message=>messages.push(message)}for(let i=0;i<30;i++)h.core.tick(h.lobby,1/30);const snapshots=messages.filter(message=>message.type==='gameState');assert.ok(snapshots.length>=19&&snapshots.length<=20)});
test('large authoritative snapshot payload remains compact',t=>{const h=match(()=>.25),messages=[],base=h.player;h.core.currentConnection(h.player.id).send=message=>messages.push(message);for(let i=1;i<4;i++)h.game.players[`p${i}`]={...base,id:`p${i}`,stats:{...base.stats,cooldowns:{...base.stats.cooldowns}},input:{},items:{},augments:[]};for(let i=0;i<50;i++)h.game.enemies.push({id:`e${i}`,type:'melee',ai:'melee',x:500+i*10,y:500,hp:22,maxHp:22,r:13,speed:0,damage:9,xp:3});for(let i=0;i<100;i++)h.game.bullets.push({id:`b${i}`,ownerId:'host',x:1500,y:1100,vx:570,vy:0,r:4,life:2,damage:14,pierce:0,kind:'scoutBullet',crit:false});h.core.tick(h.lobby,.05);const snapshot=messages.find(message=>message.type==='gameState'),bytes=Buffer.byteLength(JSON.stringify(snapshot));t.diagnostic(`snapshot bytes: ${bytes}`);assert.ok(bytes<30000)});
test('spatial grid reduces projectile collision candidates without missing bosses',()=>{const {createSpatialGrid,spatialCandidates}=require('../server'),entities=[];for(let i=0;i<100;i++)entities.push({id:`e${i}`,x:(i%10)*300+50,y:Math.floor(i/10)*200+50,r:13});const boss={id:'boss',x:1500,y:1000,r:80};entities.push(boss);const grid=createSpatialGrid(entities,140),near=spatialCandidates(grid,1500,1000);assert.ok(near.includes(boss));assert.ok(near.length<entities.length/4)});

test('radius spatial query matches brute-force splash candidates at cell boundaries',()=>{
  const {createSpatialGrid,spatialRadiusCandidates}=require('../server');
  const entities=[
    {id:'center',x:70,y:70,r:13},
    {id:'edge-x',x:140,y:70,r:13},
    {id:'corner',x:140,y:140,r:80},
    {id:'exact-radius',x:210,y:70,r:13},
    {id:'far',x:900,y:900,r:13}
  ];
  const grid=createSpatialGrid(entities,140);
  for(const [x,y,radius] of [[70,70,140],[140,70,80],[140,140,220],[0,0,1000]]){
    const brute=entities.filter(entity=>{const dx=entity.x-x,dy=entity.y-y;return dx*dx+dy*dy<radius*radius}).map(entity=>entity.id);
    const broad=spatialRadiusCandidates(grid,x,y,radius).filter(entity=>{const dx=entity.x-x,dy=entity.y-y;return dx*dx+dy*dy<radius*radius}).map(entity=>entity.id);
    assert.deepEqual(broad,brute);
    assert.equal(new Set(spatialRadiusCandidates(grid,x,y,radius)).size,spatialRadiusCandidates(grid,x,y,radius).length);
  }
});

test('in-place compaction preserves order for authoritative hot collections',()=>{
  const {compactInPlace}=require('../server');
  for(const values of [[1,2,3,4,5],['bullet-a','bullet-b','bullet-c'],['orb-a','orb-b']]){
    const expected=values.filter((_,index)=>index%2===0),kept=new Set(expected),reference=values;
    assert.equal(compactInPlace(values,value=>kept.has(value)),reference);
    assert.deepEqual(values,expected);
  }
});
