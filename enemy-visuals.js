/* Procedural enemy models. Movement, combat and balance stay in game.js; this
   file owns silhouettes and animation so visual iterations remain isolated. */
(()=>{
  const TAU=Math.PI*2;
  const FRAME_COUNT=6,ENEMY_SPRITE_ANGLE_OFFSET=0;
  const configs={
    swarm:{size:40,fps:14,attackDuration:.22},brute:{size:84,fps:6,attackDuration:.34},
    shooter:{size:76,fps:8,attackDuration:.30},charger:{size:78,fps:8,attackDuration:.26},
    exploder:{size:68,fps:8,attackDuration:.30}
  };
  const sheets={};
  const paths={swarm:['move','attack'],brute:['move','attack'],shooter:['move','attack','projectile'],charger:['move','attack','windup','charge'],exploder:['move','attack','explosion','explosion_radius']};
  if(typeof Image!=='undefined')for(const [type,names] of Object.entries(paths)){sheets[type]={};for(const name of names){const entry=sheets[type][name]={image:new Image(),loaded:false,error:false};entry.image.onload=()=>entry.loaded=true;entry.image.onerror=()=>entry.error=true;entry.image.src=`assets/mobs/${type}/${name}.png`}}
  function loaded(type,name){const entry=sheets[type]?.[name];return entry?.loaded&&entry.image.naturalWidth>0?entry.image:null}
  function oneShotFrame(remaining,duration){return Math.min(FRAME_COUNT-1,Math.max(0,Math.floor((1-Math.max(0,remaining)/duration)*FRAME_COUNT)))}
  function drawMobSprite(ctx,e,time,hit){
    const config=configs[e.type];if(!config||e.bossTier)return false;
    let animation='move',frame=Math.floor((time+(e.phase||0))*config.fps)%FRAME_COUNT;
    if(e.type==='charger'&&e.charging>0){animation='charge';frame=Math.min(5,Math.floor(Math.max(0,(.55-e.charging)/.55)*6))}
    else if(e.type==='charger'&&e.windup>0){animation='windup';frame=Math.min(5,Math.floor(Math.max(0,(.65-e.windup)/.65)*6))}
    else if(e.attackAnim>0){animation='attack';frame=oneShotFrame(e.attackAnim,config.attackDuration)}
    const image=loaded(e.type,animation);if(!image)return false;
    ctx.save();ctx.rotate(ENEMY_SPRITE_ANGLE_OFFSET);if(hit){ctx.filter='brightness(1.8) saturate(.45)'}
    ctx.drawImage(image,frame*128,0,128,128,-config.size/2,-config.size/2,config.size,config.size);ctx.restore();return true
  }
  function drawProjectile(ctx,b,time){const image=b.kind==='shooterBullet'&&loaded('shooter','projectile');if(!image)return false;const frame=Math.floor(time*18)%6;ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.drawImage(image,frame*64,0,64,64,-12,-12,24,24);ctx.restore();return true}
  function drawExplosion(ctx,event){const duration=.55,remaining=Math.max(0,event.life),frame=oneShotFrame(remaining,duration),progress=1-remaining/duration;let drawn=false;for(const [name,size] of [['explosion_radius',290],['explosion',290]]){const image=loaded('exploder',name);if(!image)continue;ctx.save();ctx.globalAlpha=name==='explosion_radius'?Math.min(1,(1-progress)*1.8):1;ctx.drawImage(image,frame*384,0,384,384,event.x-size/2,event.y-size/2,size,size);ctx.restore();drawn=true}return drawn}
  window.enemySpriteVisuals={configs,sheets,drawProjectile,drawExplosion,EXPLODER_EXPLOSION_DIAMETER:290};
  function ellipse(ctx,x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill()}
  function organic(ctx,r,points=12,wobble=0){
    ctx.beginPath();
    for(let i=0;i<=points;i++){const a=i/points*TAU,rr=r*(1+Math.sin(i*2.37+wobble)*.09),x=Math.cos(a)*rr,y=Math.sin(a)*rr*.82;i?ctx.quadraticCurveTo(Math.cos(a-TAU/points/2)*rr,y,x,y):ctx.moveTo(x,y)}
    ctx.closePath();
  }
  function eye(ctx,x,size,color='#fff'){ellipse(ctx,x,0,size,size*.72,color);ellipse(ctx,x+size*.2,0,size*.38,size*.38,'#07101a')}
  function legs(ctx,r,color,time,count=3){ctx.strokeStyle=color;ctx.lineWidth=Math.max(1.5,r*.11);ctx.lineCap='round';for(let side of [-1,1])for(let i=0;i<count;i++){const y=side*(r*.25+i*r*.26),step=Math.sin(time*9+i*1.7+side)*r*.18;ctx.beginPath();ctx.moveTo(-r*.3,y*.72);ctx.quadraticCurveTo(-r*.8+step,y,-r*1.2+step,y*1.18);ctx.stroke()}}
  function swarm(ctx,e,time,hit){
    const flap=Math.sin(time*18+e.phase),r=e.r;ctx.shadowColor='#ed83ff';ctx.shadowBlur=13;
    ctx.fillStyle='rgba(237,131,255,.28)';for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(-r*.1,side*r*.25);ctx.quadraticCurveTo(-r*1.8,side*r*(1.25+flap*.28),-r*2.15,side*r*.18);ctx.quadraticCurveTo(-r*1.1,side*r*.03,-r*.1,side*r*.25);ctx.fill()}
    legs(ctx,r,'#d67ce8',time,2);ctx.fillStyle=hit?'#fff':'#61236f';ctx.strokeStyle='#f1a2ff';ctx.lineWidth=1.4;organic(ctx,r,9,time*3);ctx.fill();ctx.stroke();eye(ctx,r*.42,r*.24,'#ffd8ff');
  }
  function shooter(ctx,e,time,hit){
    // attackCd may stay negative while the shooter has no clear line of fire.
    // Never feed that unbounded value into the muzzle ellipse: older saves could
    // otherwise grow it to thousands of pixels and stall the canvas renderer.
    const r=e.r,recoil=e.attackCd>1.55?Math.max(-8,Math.min(8,(1.75-e.attackCd)*8)):0,charge=e.attackCd>=0?Math.max(0,Math.min(1,1-e.attackCd/.5)):0;ctx.shadowColor='#ffb45e';ctx.shadowBlur=17;
    legs(ctx,r,'#a75935',time,3);ctx.fillStyle=hit?'#fff':'#43251f';ctx.strokeStyle='#ff9f59';ctx.lineWidth=2.2;organic(ctx,r,12,time*.9);ctx.fill();ctx.stroke();
    ctx.fillStyle='#24120e';ctx.beginPath();ctx.moveTo(-r*.75,-r*.45);ctx.lineTo(-r*1.2,-r*.85);ctx.lineTo(-r*.95,-r*.1);ctx.moveTo(-r*.75,r*.45);ctx.lineTo(-r*1.2,r*.85);ctx.lineTo(-r*.95,r*.1);ctx.fill();
    ctx.save();ctx.translate(-recoil,0);ctx.fillStyle='#d57d3e';ctx.beginPath();ctx.rect(r*.1,-r*.34,r*1.25,r*.68);ctx.fill();ctx.stroke();ellipse(ctx,r*1.35,0,r*.28,r*.42,'#1b0d09');ctx.restore();eye(ctx,-r*.05,r*.25,'#ffe0a8');
    if(charge){ctx.globalAlpha=.35+charge*.55;ellipse(ctx,r*1.65,0,3+charge*6,3+charge*6,'#fff2bd')}
  }
  function charger(ctx,e,time,hit){
    const r=e.r,wind=Math.max(0,Math.min(.65,e.windup||0)),surge=e.charging?1:0,pulse=1+Math.sin(time*28)*wind*.12;ctx.scale(pulse,1/pulse);ctx.shadowColor='#62a4ff';ctx.shadowBlur=22;
    if(surge){ctx.globalAlpha=.28;for(let i=0;i<3;i++){ctx.fillStyle='#7fc4ff';ctx.beginPath();ctx.moveTo(-r*(1+i*.45),-r*.55);ctx.lineTo(-r*(2.4+i*.55),0);ctx.lineTo(-r*(1+i*.45),r*.55);ctx.fill()}ctx.globalAlpha=1}
    legs(ctx,r,'#497ebc',time,3);ctx.fillStyle=hit?'#fff':'#162d4d';ctx.strokeStyle=wind?'#d8efff':'#68b1ff';ctx.lineWidth=2.6;ctx.beginPath();ctx.moveTo(r*1.42,0);ctx.bezierCurveTo(r*.85,-r*.95,-r*.45,-r*1.08,-r*.88,-r*.55);ctx.quadraticCurveTo(-r*1.2,0,-r*.88,r*.55);ctx.bezierCurveTo(-r*.45,r*1.08,r*.85,r*.95,r*1.42,0);ctx.fill();ctx.stroke();
    ctx.fillStyle='#6eb8ff';for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(r*.1,side*r*.7);ctx.quadraticCurveTo(-r*.25,side*r*1.45,-r*.85,side*r*1.2);ctx.lineTo(-r*.55,side*r*.58);ctx.fill()}eye(ctx,r*.48,r*.3,'#cdeaff');
    if(wind){ctx.globalAlpha=.25+.25*Math.sin(time*30);ctx.strokeStyle='#bfe7ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,Math.max(1,r*(1.35+wind*.6)),0,TAU);ctx.stroke()}
  }
  function exploder(ctx,e,time,hit){
    const r=e.r,arming=e.state==='arming'?Math.max(0,Math.min(1,e.armingProgress||0)):0,frequency=7+arming*24,beat=(Math.sin(time*frequency+e.phase)+1)/2,pulse=1+arming*.12*beat;ctx.scale(pulse,pulse);ctx.shadowColor=arming>.82?'#fff3b0':'#ff7938';ctx.shadowBlur=18+beat*9+arming*28;legs(ctx,r,'#a84828',time,3);if(arming){ctx.globalAlpha=.35+arming*.55;ctx.strokeStyle=arming>.82?'#fff5bc':'#ff7040';ctx.lineWidth=2+arming*4;ctx.beginPath();ctx.arc(0,0,r*(1.25+arming*.65),0,TAU);ctx.stroke();ctx.globalAlpha=1}
    ctx.fillStyle=hit?'#fff':'#4b231b';ctx.strokeStyle='#ff8240';ctx.lineWidth=2.2;organic(ctx,r*(1+beat*.05),14,time*1.5);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#ffb052';ctx.lineWidth=2;for(let i=0;i<5;i++){ctx.save();ctx.rotate(i/5*TAU+time*.08);ctx.beginPath();ctx.moveTo(r*.42,0);ctx.quadraticCurveTo(r*.62,-r*.2,r*.9,0);ctx.stroke();ctx.restore()}
    ellipse(ctx,0,0,r*(.34+beat*.08),r*(.34+beat*.08),'#ffd46b');ellipse(ctx,0,0,r*.15,r*.15,'#fff4ba');
  }
  function toxic(ctx,e,time,hit){
    const r=e.r,breath=1+Math.sin(time*5+e.phase)*.07;ctx.scale(breath,1/breath);ctx.shadowColor='#9dff52';ctx.shadowBlur=22;legs(ctx,r,'#679d35',time,3);ctx.fillStyle=hit?'#fff':'#263d1d';ctx.strokeStyle='#a8ff58';ctx.lineWidth=2.4;organic(ctx,r,14,time*.8);ctx.fill();ctx.stroke();
    for(let i=0;i<5;i++){const a=i/5*TAU+time*.22;ellipse(ctx,Math.cos(a)*r*.62,Math.sin(a)*r*.5,r*.16,r*.12,i%2?'#6fdc45':'#d4ff68')}eye(ctx,r*.38,r*.24,'#efffbd');
  }
  function trapper(ctx,e,time,hit){
    const r=e.r;ctx.shadowColor='#d6ff65';ctx.shadowBlur=16;legs(ctx,r,'#927b42',time,3);ctx.fillStyle=hit?'#fff':'#3b3420';ctx.strokeStyle='#d8ee72';ctx.lineWidth=2.3;organic(ctx,r,11,time*.5);ctx.fill();ctx.stroke();
    ctx.save();ctx.rotate(time*.8);ctx.strokeStyle='#b6ff62';ctx.setLineDash([4,3]);ctx.beginPath();ctx.arc(-r*.35,0,r*.58,0,TAU);ctx.stroke();ctx.restore();ctx.fillStyle='#d9ff79';ctx.beginPath();ctx.moveTo(r*1.2,0);ctx.lineTo(r*.42,-r*.34);ctx.lineTo(r*.42,r*.34);ctx.fill();eye(ctx,0,r*.22,'#fff5b3');
  }
  function toxicBoss(ctx,e,time,hit,data){
    const r=e.r,color=data[e.bossTier].color;ctx.shadowColor=color;ctx.shadowBlur=42;ctx.strokeStyle=color;ctx.lineWidth=5;ctx.fillStyle=hit?'#fff':e.bossTier===1?'#29451d':e.bossTier===2?'#123e31':'#38440f';
    if(e.bossTier===1){organic(ctx,r,22,time*.5);ctx.fill();ctx.stroke();for(let i=0;i<8;i++){const a=i/8*TAU+time*.14;ctx.fillStyle=i%2?'#76d845':'#d0ff70';ctx.beginPath();ctx.ellipse(Math.cos(a)*r*.72,Math.sin(a)*r*.58,r*.18,r*.1,a,0,TAU);ctx.fill()}eye(ctx,r*.12,r*.2,'#f3ffc5')}
    else if(e.bossTier===2){for(let i=0;i<9;i++){const a=i/9*TAU+time*.12;ctx.globalAlpha=.32;ellipse(ctx,Math.cos(a)*r*(1.05+Math.sin(time+i)*.14),Math.sin(a)*r*(.8+Math.sin(time+i)*.1),r*.42,r*.3,color)}ctx.globalAlpha=1;organic(ctx,r*.68,18,time*.35);ctx.fill();ctx.stroke();eye(ctx,0,r*.2,'#d5ffe8')}
    else{for(let i=0;i<7;i++){ctx.save();ctx.rotate(i/7*TAU-time*.1);ctx.beginPath();ctx.moveTo(r*.35,0);ctx.bezierCurveTo(r*.75,-r*.45,r*1.25,-r*.3,r*1.55,0);ctx.stroke();ctx.restore()}organic(ctx,r*.7,20,time*.6);ctx.fill();ctx.stroke();ellipse(ctx,0,0,r*.28+Math.sin(time*4)*4,r*.22,'#e4ff64');ellipse(ctx,0,0,r*.1,r*.08,'#fff')}
  }
  function boss(ctx,e,time,hit,data){
    const r=e.r,color=data[e.bossTier].color,pulse=1+Math.sin(time*3+e.phase)*.035;ctx.scale(pulse,pulse);ctx.shadowColor=color;ctx.shadowBlur=38;ctx.lineCap='round';
    if(e.bossTier===1){
      legs(ctx,r,'#8d3040',time,4);ctx.fillStyle=hit?'#fff':'#401720';ctx.strokeStyle=color;ctx.lineWidth=4;organic(ctx,r,18,time*.35);ctx.fill();ctx.stroke();
      ctx.fillStyle='#842c3e';for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(-r*.2,side*r*.65);ctx.bezierCurveTo(-r*.55,side*r*1.45,-r*1.45,side*r*1.32,-r*1.65,side*r*.65);ctx.bezierCurveTo(-r*.95,side*r*.82,-r*.65,side*r*.3,-r*.2,side*r*.65);ctx.fill();ctx.stroke()}eye(ctx,r*.28,r*.22,'#ffd2b1');
    }else if(e.bossTier===2){
      ctx.strokeStyle=color;for(let i=0;i<6;i++){ctx.save();ctx.rotate(i/6*TAU+time*.16);ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(r*.35,0);ctx.bezierCurveTo(r*.75,-r*.35,r*1.2,-r*.25,r*1.42,0);ctx.stroke();ctx.restore()}
      ctx.fillStyle=hit?'#fff':'#102b4b';ctx.lineWidth=4;organic(ctx,r*.78,16,time*.25);ctx.fill();ctx.stroke();ctx.save();ctx.rotate(-time*.35);ctx.strokeStyle='#9de4ff';ctx.lineWidth=3;ctx.setLineDash([18,10]);ctx.beginPath();ctx.arc(0,0,r*.56,0,TAU);ctx.stroke();ctx.restore();eye(ctx,0,r*.22,'#dff7ff');
    }else{
      ctx.strokeStyle=color;ctx.lineWidth=9;for(let i=0;i<10;i++){const a=i/10*TAU+time*.13,wave=Math.sin(time*2+i)*r*.22;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.42,Math.sin(a)*r*.42);ctx.bezierCurveTo(Math.cos(a+.32)*(r*.8+wave),Math.sin(a+.32)*(r*.8+wave),Math.cos(a-.22)*r*1.1,Math.sin(a-.22)*r*1.1,Math.cos(a)*r*1.42,Math.sin(a)*r*1.42);ctx.stroke()}
      ctx.fillStyle=hit?'#fff':'#260e3b';ctx.lineWidth=4;organic(ctx,r*.72,20,time*.45);ctx.fill();ctx.stroke();ellipse(ctx,0,0,r*.28+Math.sin(time*4)*3,r*.22+Math.sin(time*4)*3,'#dca0ff');ellipse(ctx,0,0,r*.1,r*.1,'#fff');
    }
  }
  window.drawEnemyModel=(ctx,e,{time,hit,bossData})=>{
    if(drawMobSprite(ctx,e,time,hit))return true;
    if(e.bossTier&&e.type.startsWith('toxic_'))toxicBoss(ctx,e,time,hit,bossData);else if(e.bossTier)boss(ctx,e,time,hit,bossData);else if(e.type==='toxic')toxic(ctx,e,time,hit);else if(e.type==='trapper')trapper(ctx,e,time,hit);else if(e.type==='swarm')swarm(ctx,e,time,hit);else if(e.type==='shooter')shooter(ctx,e,time,hit);else if(e.type==='charger')charger(ctx,e,time,hit);else if(e.type==='exploder')exploder(ctx,e,time,hit);else return false;return true;
  };
})();
