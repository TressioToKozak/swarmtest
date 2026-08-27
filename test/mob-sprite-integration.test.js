const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

function pngSize(path){const data=fs.readFileSync(path);assert.equal(data.toString('ascii',1,4),'PNG');return[data.readUInt32BE(16),data.readUInt32BE(20)]}

test('mob sprite sheets retain the expected six-frame source dimensions',()=>{
  for(const type of ['swarm','brute','shooter','charger','exploder'])for(const animation of ['move','attack'])assert.deepEqual(pngSize(`assets/mobs/${type}/${animation}.png`),[768,128]);
  for(const animation of ['windup','charge'])assert.deepEqual(pngSize(`assets/mobs/charger/${animation}.png`),[768,128]);
  assert.deepEqual(pngSize('assets/mobs/shooter/projectile.png'),[384,64]);
  for(const animation of ['explosion','explosion_radius'])assert.deepEqual(pngSize(`assets/mobs/exploder/${animation}.png`),[2304,384]);
});

test('custom toxic-map mobs and all boss assets retain their authored dimensions',()=>{
  for(const type of ['melee','toxic','trapper'])for(const animation of ['move','attack'])assert.deepEqual(pngSize(`assets/mobs/${type}/${animation}.png`),[768,128]);
  assert.deepEqual(pngSize('assets/mobs/toxic/poison_cloud.png'),[2304,384]);
  assert.deepEqual(pngSize('assets/mobs/trapper/trap.png'),[768,128]);
  assert.deepEqual(pngSize('assets/mobs/trapper/trap_trigger.png'),[2304,384]);
  const bosses={boss_titan:['charge','slam_radius'],boss_warden:['projectile'],boss_void:['projectile','void_ring'],toxic_boss_spore:['spore_cloud'],toxic_boss_fog:['projectile','fog_cloud'],toxic_boss_core:['projectile','trap','trap_trigger']};
  for(const [type,effects] of Object.entries(bosses)){
    const map=type.startsWith('toxic_')?'toxic':'ruins',base=`assets/bosses/${map}/${type}`;
    for(const animation of ['move','attack'])assert.deepEqual(pngSize(`${base}/${animation}.png`),[1536,256]);
    for(const effect of effects){const size=effect==='projectile'?[384,64]:effect==='trap'?[768,128]:effect==='charge'?[1536,256]:[2304,384];assert.deepEqual(pngSize(`${base}/${effect}.png`),size)}
  }
  for(const name of ['nightmare_projectile','nightmare_cloud'])assert.deepEqual(pngSize(`assets/bosses/common/${name}.png`),name.endsWith('projectile')?[384,64]:[2304,384]);
});

test('sprite integration preserves direction and timing without legacy model fallbacks',()=>{
  const visuals=fs.readFileSync('enemy-visuals.js','utf8'),game=fs.readFileSync('game.js','utf8'),server=fs.readFileSync('server.js','utf8');
  assert.match(visuals,/ENEMY_SPRITE_ANGLE_OFFSET=0/);
  assert.match(visuals,/EXPLODER_EXPLOSION_DIAMETER:290/);
  assert.match(visuals,/\(\.65-e\.windup\)\/\.65/);
  assert.match(visuals,/\(\.55-e\.charging\)\/\.55/);
  assert.match(game,/Math\.atan2\(e\.chargeY,e\.chargeX\)/);
  assert.match(game,/Math\.atan2\(b\.vy,b\.vx\)/);
  assert.match(game,/kind:'shooterBullet'/);
  assert.match(server,/kind:\s*'shooterBullet'/);
  assert.match(visuals,/window\.drawEnemyModel=.*=>drawMobSprite/);
  assert.doesNotMatch(visuals,/else if\(e\.type==='swarm'\)swarm|toxicBoss\(ctx/);
  for(const type of ['melee','toxic','trapper','boss_titan','boss_warden','boss_void','toxic_boss_spore','toxic_boss_fog','toxic_boss_core'])assert.match(visuals,new RegExp(`${type}:\\{size:`));
  assert.match(game,/visual:'boss_titan'/);assert.match(game,/visual:'boss_void'/);
  assert.match(game,/kind:'boss_warden'/);assert.match(game,/kind:'boss_void'/);
  assert.match(game,/kind:'toxic_boss_fog'/);assert.match(game,/kind:'toxic_boss_core'/);
  assert.match(game,/\{melee:\.30,swarm:/);
});
