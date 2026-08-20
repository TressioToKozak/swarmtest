'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {update,sample}=require('../multiplayer-visual-state');
const {GameServer}=require('../server');

function match(random=()=>.25){let now=1000;const core=new GameServer(()=>now,random),client=core.addClient(()=>{});core.handle(client,{type:'hello',clientId:'host',unlocked:[],maps:['ruins']});now+=2000;core.handle(client,{type:'createLobby'});const lobby=core.lobbies.get(client.lobby);core.start(lobby);return{core,lobby,game:lobby.game,player:lobby.game.players.host}}

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
