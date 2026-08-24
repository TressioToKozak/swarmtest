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

test('sprite integration preserves direction, timing, radius and procedural fallback contracts',()=>{
  const visuals=fs.readFileSync('enemy-visuals.js','utf8'),game=fs.readFileSync('game.js','utf8'),server=fs.readFileSync('server.js','utf8');
  assert.match(visuals,/ENEMY_SPRITE_ANGLE_OFFSET=0/);
  assert.match(visuals,/EXPLODER_EXPLOSION_DIAMETER:290/);
  assert.match(visuals,/\(\.65-e\.windup\)\/\.65/);
  assert.match(visuals,/\(\.55-e\.charging\)\/\.55/);
  assert.match(game,/Math\.atan2\(e\.chargeY,e\.chargeX\)/);
  assert.match(game,/Math\.atan2\(b\.vy,b\.vx\)/);
  assert.match(game,/kind:'shooterBullet'/);
  assert.match(server,/kind:'shooterBullet'/);
  assert.match(visuals,/if\(drawMobSprite\(ctx,e,time,hit\)\)return true/);
  assert.match(visuals,/else if\(e\.type==='swarm'\)swarm/);
});
