/* Procedural enemy models. Movement, combat and balance stay in game.js; this
   file owns silhouettes and animation so visual iterations remain isolated. */
(()=>{
  const TAU=Math.PI*2;
  const FRAME_COUNT=6,ENEMY_SPRITE_ANGLE_OFFSET=0,ENEMY_ASSET_VERSION='4';
  const configs={
    swarm:{size:40,fps:14,attackDuration:.22},brute:{size:84,fps:6,attackDuration:.34},
    shooter:{size:76,fps:8,attackDuration:.30},charger:{size:78,fps:8,attackDuration:.26},
    exploder:{size:68,fps:8,attackDuration:.30},melee:{size:62,fps:10,attackDuration:.30},
    toxic:{size:76,fps:8,attackDuration:.36},trapper:{size:72,fps:8,attackDuration:.34}
  };
  const bossConfigs={
    boss_titan:{size:150,fps:7,attackDuration:.65},boss_warden:{size:142,fps:8,attackDuration:.42},boss_void:{size:148,fps:8,attackDuration:.48},
    toxic_boss_spore:{size:152,fps:7,attackDuration:.55},toxic_boss_fog:{size:148,fps:8,attackDuration:.50},toxic_boss_core:{size:154,fps:8,attackDuration:.48}
  };
  const sheets={};
  const paths={swarm:['move','attack'],brute:['move','attack'],shooter:['move','attack','projectile'],charger:['move','attack','windup','charge'],exploder:['move','attack','explosion','explosion_radius'],melee:['move','attack'],toxic:['move','attack','poison_cloud'],trapper:['move','attack','trap','trap_trigger']};
  const bossPaths={boss_titan:['move','attack','charge','slam_radius'],boss_warden:['move','attack','projectile'],boss_void:['move','attack','projectile','void_ring'],toxic_boss_spore:['move','attack','spore_cloud'],toxic_boss_fog:['move','attack','projectile','fog_cloud'],toxic_boss_core:['move','attack','projectile','trap','trap_trigger']};
  const sharedEnemies=['melee','swarm','brute','shooter','charger','exploder','common'];
  const requiredByMap={ruins:[...sharedEnemies,'boss_titan','boss_warden','boss_void'],toxic:[...sharedEnemies,'toxic','trapper','toxic_boss_spore','toxic_boss_fog','toxic_boss_core']};
  function preload(type,names,base){sheets[type]={};if(type!=='common')names=['model',...names];for(const name of names){const entry=sheets[type][name]={image:new Image(),loaded:false,error:false};entry.image.onload=()=>entry.loaded=true;entry.image.onerror=()=>entry.error=true;entry.image.src=`${base}/${type}/${name}.png?v=${ENEMY_ASSET_VERSION}`}}
  if(typeof Image!=='undefined'){for(const [type,names] of Object.entries(paths))preload(type,names,'assets/mobs');for(const [type,names] of Object.entries(bossPaths))preload(type,names,`assets/bosses/${type.startsWith('toxic_')?'toxic':'ruins'}`);preload('common',['nightmare_projectile','nightmare_cloud'],'assets/bosses')}
  function loaded(type,name){const entry=sheets[type]?.[name];return entry?.loaded&&entry.image.naturalWidth>0?entry.image:null}
  function oneShotFrame(remaining,duration){return Math.min(FRAME_COUNT-1,Math.max(0,Math.floor((1-Math.max(0,remaining)/duration)*FRAME_COUNT)))}
  function drawMobSprite(ctx,e,time,hit){
    const config=e.bossTier?bossConfigs[e.type]:configs[e.type];if(!config)return false;
    let animation='move',frame=Math.floor((time+(e.phase||0))*config.fps)%FRAME_COUNT;
    if(e.type==='boss_titan'&&e.dash>0){animation='charge';frame=Math.min(5,Math.floor(Math.max(0,(.8-e.dash)/.8)*6))}
    else if(e.type==='charger'&&e.charging>0){animation='charge';frame=Math.min(5,Math.floor(Math.max(0,(.55-e.charging)/.55)*6))}
    else if(e.type==='charger'&&e.windup>0){animation='windup';frame=Math.min(5,Math.floor(Math.max(0,(.65-e.windup)/.65)*6))}
    else if(e.attackAnim>0){animation='attack';frame=oneShotFrame(e.attackAnim,config.attackDuration)}
    const image=loaded(e.type,animation);if(!image)return false;
    ctx.save();ctx.rotate(ENEMY_SPRITE_ANGLE_OFFSET);if(hit){ctx.filter='brightness(1.8) saturate(.45)'}
    const source=e.bossTier?256:128;ctx.drawImage(image,frame*source,0,source,source,-config.size/2,-config.size/2,config.size,config.size);ctx.restore();return true
  }
  function drawProjectile(ctx,b,time){const type=({shooterBullet:'shooter',boss_warden:'boss_warden',boss_void:'boss_void',toxic_boss_fog:'toxic_boss_fog',toxic_boss_core:'toxic_boss_core',nightmare:'common'})[b.kind],name=b.kind==='nightmare'?'nightmare_projectile':'projectile',image=type&&loaded(type,name);if(!image)return false;const frame=Math.floor(time*18)%6,size=b.boss?30:24;ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.drawImage(image,frame*64,0,64,64,-size/2,-size/2,size,size);ctx.restore();return true}
  function drawEffect(ctx,image,x,y,size,time,alpha=1){if(!image)return false;ctx.save();ctx.globalAlpha*=alpha;const frame=Math.floor(time*10)%6;ctx.drawImage(image,frame*384,0,384,384,x-size/2,y-size/2,size,size);ctx.restore();return true}
  function drawCloud(ctx,cloud,time){const type=cloud.visual||(cloud.fog?'toxic_boss_fog':null);if(cloud.nightmare)return drawEffect(ctx,loaded('common','nightmare_cloud'),cloud.x,cloud.y,cloud.r*2,time,Math.min(1,cloud.life*.25));const map={toxic:'poison_cloud',toxic_boss_spore:'spore_cloud',toxic_boss_fog:'fog_cloud'};return drawEffect(ctx,loaded(type,map[type]),cloud.x,cloud.y,cloud.r*2,time,Math.min(.75,cloud.life*.16))}
  function drawTrap(ctx,trap,time){const type=trap.visual||'trapper',name=trap.armed>0?'trap_trigger':'trap',image=loaded(type,name);if(!image)return false;const source=name==='trap'?128:384,frame=Math.floor(time*10)%6,size=trap.r*2;ctx.save();ctx.translate(trap.x,trap.y);ctx.drawImage(image,frame*source,0,source,source,-size/2,-size/2,size,size);ctx.restore();return true}
  function drawRing(ctx,ring){const type=ring.visual,name=type==='boss_titan'?'slam_radius':type==='boss_void'?'void_ring':null,image=name&&loaded(type,name);if(!image)return false;const duration=type==='boss_titan'?.65:.8,frame=oneShotFrame(ring.life,duration),size=ring.max*2;ctx.save();ctx.globalAlpha=Math.min(1,ring.life/duration*1.8);ctx.drawImage(image,frame*384,0,384,384,ring.x-size/2,ring.y-size/2,size,size);ctx.restore();return true}
  function drawExplosion(ctx,event){const duration=.55,remaining=Math.max(0,event.life),frame=oneShotFrame(remaining,duration),progress=1-remaining/duration;let drawn=false;for(const [name,size] of [['explosion_radius',290],['explosion',290]]){const image=loaded('exploder',name);if(!image)continue;ctx.save();ctx.globalAlpha=name==='explosion_radius'?Math.min(1,(1-progress)*1.8):1;ctx.drawImage(image,frame*384,0,384,384,event.x-size/2,event.y-size/2,size,size);ctx.restore();drawn=true}return drawn}
  window.enemySpriteVisuals={configs,bossConfigs,sheets,requiredByMap,ENEMY_ASSET_VERSION,drawProjectile,drawExplosion,drawCloud,drawTrap,drawRing,EXPLODER_EXPLOSION_DIAMETER:290};
  window.drawEnemyModel=(ctx,e,{time,hit})=>drawMobSprite(ctx,e,time,hit);
})();
