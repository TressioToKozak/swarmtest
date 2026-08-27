const test=require('node:test');
const assert=require('node:assert/strict');
const {SpatialGrid}=require('../spatial-grid');

function exactHits(entities,x,y,r){return entities.filter(entity=>{const dx=entity.x-x,dy=entity.y-y,sum=entity.r+r;return dx*dx+dy*dy<sum*sum}).map(entity=>entity.id)}
function gridHits(grid,x,y,r){return grid.queryCircle(x,y,r,[]).filter(entity=>{const dx=entity.x-x,dy=entity.y-y,sum=entity.r+r;return dx*dx+dy*dy<sum*sum}).map(entity=>entity.id)}

test('spatial grid exposes the same constructor to a browser global',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),context={};
  vm.runInNewContext(fs.readFileSync(require.resolve('../spatial-grid'),'utf8'),context);
  assert.equal(typeof context.SwarmSpatialGrid?.SpatialGrid,'function');
  assert.equal(new context.SwarmSpatialGrid.SpatialGrid(64).cellSize,64);
});

test('spatial grid broad phase preserves exact circle hits across boundaries and radii',()=>{
  let seed=0x51a7c0de;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/0x100000000};
  for(let scenario=0;scenario<1000;scenario++){
    const entities=Array.from({length:20+Math.floor(random()*80)},(_,id)=>({id,x:random()*3000,y:random()*2200,r:id%17===0?84:8+random()*30}));
    entities.push({id:'boundary',x:128,y:256,r:34});
    const grid=new SpatialGrid(128).rebuild(entities),x=random()*3000,y=random()*2200,r=scenario%13===0?180:2+random()*45;
    assert.deepEqual(gridHits(grid,x,y,r),exactHits(entities,x,y,r));
  }
});

test('spatial grid substantially reduces dispersed projectile candidates',()=>{
  const entities=Array.from({length:600},(_,id)=>({id,x:(id%30)*100,y:Math.floor(id/30)*100,r:id%97===0?84:18}));
  const grid=new SpatialGrid(128).rebuild(entities);let candidates=0;
  for(let i=0;i<500;i++)candidates+=grid.queryCircle((i%30)*100,Math.floor(i/30)*100,6,[]).length;
  assert.ok(candidates<500*600/10,`candidate count ${candidates} should remain well below brute-force 300000`);
});

test('steady-state rebuild reuses cell arrays and stale cells are pruned',()=>{const grid=new SpatialGrid(128),entities=[{id:1,x:64,y:64,r:18},{id:2,x:190,y:64,r:18}];grid.rebuild(entities);const created=grid.cellArraysCreated,cells=[...grid.cells.values()].map(cell=>cell);for(let frame=0;frame<60;frame++)grid.rebuild(entities);assert.equal(grid.cellArraysCreated,created);assert.deepEqual([...grid.cells.values()].map(cell=>cell),cells);entities[0].x=5000;entities[1].x=5200;for(let frame=0;frame<241;frame++)grid.rebuild(entities);assert.ok(grid.cells.size<10);assert.ok(grid.activeCellCount>0)});

test('browser integration uses the broad phase while retaining the exact narrow phase',()=>{
  const fs=require('node:fs'),game=fs.readFileSync(require.resolve('../game.js'),'utf8'),html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  assert.match(game,/enemySpatialGrid\.rebuild\(enemies\)/);
  assert.match(game,/dist\(b,e\)<b\.r\+e\.r/);
  assert.match(game,/projectileCollision/);
  assert.match(html,/spatial-grid\.js\?v=3/);
  assert.match(html,/id="fpsCounter">FPS --/);
});
