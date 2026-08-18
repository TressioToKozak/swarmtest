const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const minimap = document.querySelector('#minimap');
const mapCtx = minimap.getContext('2d');
const WORLD = { w: 3000, h: 2200 };
const camera = { x: 0, y: 0 };
const MAP_SHAPE = [[180,40],[1080,40],[1210,120],[1780,70],[1940,35],[2790,80],[2960,270],[2930,820],[2990,980],[2945,1640],[2860,1760],[2900,2020],[2700,2160],[1910,2180],[1760,2090],[1190,2160],[990,2080],[260,2150],[55,1950],[90,1430],[35,1260],[95,730],[45,500]];
const terrain = [
  {type:'water', points:[[160,260],[480,180],[720,310],[650,560],[390,650],[130,520]]},
  {type:'water', points:[[2180,1450],[2480,1320],[2800,1440],[2870,1760],[2650,1940],[2290,1840],[2110,1650]]},
  {type:'water', points:[[1130,1660],[1370,1510],[1600,1600],[1660,1900],[1430,2050],[1160,1940]]},
  {type:'wall', x:840,y:360,w:390,h:42}, {type:'wall',x:1190,y:360,w:42,h:290},
  {type:'wall', x:1830,y:720,w:42,h:430}, {type:'wall',x:1830,y:1108,w:390,h:42},
  {type:'wall', x:520,y:1220,w:430,h:42}, {type:'wall',x:910,y:1010,w:42,h:252},
  {type:'rock',x:1530,y:470,r:92}, {type:'rock',x:2450,y:520,r:115},
  {type:'rock',x:480,y:940,r:86}, {type:'rock',x:1530,y:1280,r:105},
  {type:'rock',x:2520,y:1050,r:78}, {type:'rock',x:720,y:1790,r:120}
];
function tracePolygon(context, points){context.beginPath();points.forEach(([x,y],i)=>i?context.lineTo(x,y):context.moveTo(x,y));context.closePath()}
function pointInPolygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const [xi,yi]=points[i],[xj,yj]=points[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside}return inside}
function circleTouchesPolygon(x,y,r,points,insideIsBlocked=true){
  const samples=[[0,0],[r,0],[-r,0],[0,r],[0,-r],[r*.7,r*.7],[-r*.7,r*.7],[r*.7,-r*.7],[-r*.7,-r*.7]];
  return samples.some(([ox,oy])=>pointInPolygon(x+ox,y+oy,points)===insideIsBlocked);
}
function blocked(x,y,r=14){
  if(circleTouchesPolygon(x,y,r,MAP_SHAPE,false))return true;
  return terrain.some(t=>t.type==='water'?circleTouchesPolygon(x,y,r,t.points,true):t.type==='wall'?x+r>t.x&&x-r<t.x+t.w&&y+r>t.y&&y-r<t.y+t.h:Math.hypot(x-t.x,y-t.y)<r+t.r);
}
function projectileBlocked(x,y){return terrain.some(t=>t.type==='wall'?x>t.x&&x<t.x+t.w&&y>t.y&&y<t.y+t.h:t.type==='rock'&&Math.hypot(x-t.x,y-t.y)<t.r)}
const NAV_CELL=70,NAV_COLS=Math.ceil(WORLD.w/NAV_CELL),NAV_ROWS=Math.ceil(WORLD.h/NAV_CELL);
let flowMap=new Int32Array(NAV_COLS*NAV_ROWS).fill(-1);
function navIndex(x,y){return y*NAV_COLS+x}
function rebuildFlow(){
  flowMap.fill(-1);const sx=Math.max(0,Math.min(NAV_COLS-1,Math.floor(player.x/NAV_CELL))),sy=Math.max(0,Math.min(NAV_ROWS-1,Math.floor(player.y/NAV_CELL))),queue=[[sx,sy]];flowMap[navIndex(sx,sy)]=0;
  for(let head=0;head<queue.length;head++){const [x,y]=queue[head],cost=flowMap[navIndex(x,y)]+1;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=NAV_COLS||ny>=NAV_ROWS||flowMap[navIndex(nx,ny)]!==-1)continue;const wx=(nx+.5)*NAV_CELL,wy=(ny+.5)*NAV_CELL;if(blocked(wx,wy,16))continue;flowMap[navIndex(nx,ny)]=cost;queue.push([nx,ny])}}
}
function flowAngle(e,directAngle){
  const cx=Math.floor(e.x/NAV_CELL),cy=Math.floor(e.y/NAV_CELL);let best=Infinity,target=null;for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=NAV_COLS||y>=NAV_ROWS)continue;const value=flowMap[navIndex(x,y)];if(value>=0&&value<best){best=value;target={x:(x+.5)*NAV_CELL,y:(y+.5)*NAV_CELL}}}return target?Math.atan2(target.y-e.y,target.x-e.x):directAngle;
}
function hasClearPath(from,to,r){const length=dist(from,to),steps=Math.ceil(length/28);for(let i=1;i<=steps;i++){const t=i/steps;if(blocked(from.x+(to.x-from.x)*t,from.y+(to.y-from.y)*t,r))return false}return true}
function moveEnemy(e,directAngle,distance){
  e.losClock=(e.losClock||0)-1;if(e.losClock<=0){e.losClock=10;e.hasLos=hasClearPath(e,player,e.r)}const angle=e.hasLos?directAngle:flowAngle(e,directAngle);for(const offset of [0,.28,-.28,.6,-.6,1.05,-1.05,Math.PI/2,-Math.PI/2]){const nx=e.x+Math.cos(angle+offset)*distance,ny=e.y+Math.sin(angle+offset)*distance;if(!blocked(nx,ny,e.r)){e.x=nx;e.y=ny;return}}
}


const scenery = Array.from({length: 145}, (_, i) => {
  const x = 90 + ((i * 811) % (WORLD.w - 180));
  const y = 90 + ((i * 457) % (WORLD.h - 180));
  return {x, y, type: i % 9 < 5 ? 'crystal' : i % 9 < 8 ? 'rock' : 'vent', size: 14 + (i * 13) % 25, rot: (i * 1.71) % 6.28};
});
const ui = Object.fromEntries(['timer','kills','level','healthText','healthBar','xpLevel','xpText','xpBar','slots','cards','startModal','instructionsModal','statsModal','pauseModal','levelModal','endModal','newLevel','endStats','bestTime','totalTime','bestKills','totalKills','phaseLabel'].map(id=>[id,document.getElementById(id)]));
let W=0,H=0,dpr=1,last=0,running=false,paused=true,elapsed=0,spawnClock=0,shotClock=0,screenShake=0,flowClock=0,statsClock=0,saveClock=0;
const keys={}, mouse={x:innerWidth*.7,y:innerHeight*.5};
const player={x:WORLD.w/2,y:WORLD.h/2,r:15,speed:250,hp:100,maxHp:100,xp:0,level:1,nextXp:24,kills:0,invuln:0};
let enemies=[],bullets=[],enemyBullets=[],orbs=[],particles=[],rings=[];
const skills={q:{cd:0,max:5},e:{cd:0,max:9},r:{cd:0,max:28}};
const upgrades=[
  {id:'power',name:'Większe obrażenia',icon:'ϟ',desc:'+25% obrażeń pocisków',color:'#51f6df'},
  {id:'rapid',name:'Szybszy atak',icon:'»',desc:'+18% szybkości ataku',color:'#4cc8ff'},
  {id:'speed',name:'Szybszy ruch',icon:'◇',desc:'+12% prędkości ruchu',color:'#a06cff'},
  {id:'vital',name:'Więcej zdrowia',icon:'♥',desc:'+20 maks. życia i leczenie',color:'#ff6688'},
  {id:'multi',name:'Dodatkowy pocisk',icon:'Ψ',desc:'+1 dodatkowy pocisk',color:'#ffd467'},
  {id:'magnet',name:'Magnes doświadczenia',icon:'⊙',desc:'+45% zasięgu zbierania',color:'#6df59d'},
  {id:'crit',name:'Trafienie krytyczne',icon:'✦',desc:'+10% szansy na cios krytyczny',color:'#ff9657'}
];
const levels={};
function resize(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.setTransform(dpr,0,0,dpr,0,0)}
addEventListener('resize',resize);resize();
addEventListener('mousemove',e=>{mouse.x=e.clientX;mouse.y=e.clientY;const c=document.querySelector('#crosshair');c.style.left=e.clientX+'px';c.style.top=e.clientY+'px'});
addEventListener('keydown',e=>{const key=e.key.toLowerCase();if(key==='escape'){e.preventDefault();togglePause();return}keys[key]=true;if(!paused&&['q','e','r'].includes(key))cast(key)});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
document.querySelector('#startBtn').onclick=start;document.querySelector('#continueBtn').onclick=continueGame;document.querySelector('#restartBtn').onclick=()=>location.reload();document.querySelector('#instructionsBtn').onclick=()=>{ui.startModal.classList.add('hidden');ui.instructionsModal.classList.remove('hidden')};document.querySelector('#backBtn').onclick=()=>{ui.instructionsModal.classList.add('hidden');ui.startModal.classList.remove('hidden')};document.querySelector('#statsBtn').onclick=showStats;document.querySelector('#statsBackBtn').onclick=()=>{ui.statsModal.classList.add('hidden');ui.startModal.classList.remove('hidden')};document.querySelector('#pauseBtn').onclick=togglePause;document.querySelector('#resumeBtn').onclick=togglePause;document.querySelector('#quitBtn').onclick=gameOver;
const defaultStats={bestTime:0,totalTime:0,bestKills:0,totalKills:0};
function loadStats(){try{return {...defaultStats,...JSON.parse(localStorage.getItem('swarmfall-stats')||'{}')}}catch{return {...defaultStats}}}
let savedStats=loadStats();
const SAVE_KEY='swarmfall-save-v1';
function getRunSave(){try{return JSON.parse(localStorage.getItem(SAVE_KEY)||'null')}catch{return null}}
function saveGame(){
  if(!running)return;const state={version:1,savedAt:Date.now(),elapsed,spawnClock,shotClock,player:{...player},skills:{q:{...skills.q},e:{...skills.e},r:{...skills.r}},levels:{...levels},enemies,bullets,enemyBullets,orbs,rings,levelPending:!ui.levelModal.classList.contains('hidden')};
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(state))}catch{}
}
function clearGameSave(){try{localStorage.removeItem(SAVE_KEY)}catch{}}
function refreshContinueButton(){document.querySelector('#continueBtn').classList.toggle('hidden',!getRunSave())}
function continueGame(){
  const state=getRunSave();if(!state||state.version!==1)return;elapsed=state.elapsed||0;spawnClock=state.spawnClock||0;shotClock=state.shotClock||0;Object.assign(player,state.player);Object.assign(skills,state.skills);Object.keys(levels).forEach(k=>delete levels[k]);Object.assign(levels,state.levels||{});enemies=state.enemies||[];bullets=state.bullets||[];enemyBullets=state.enemyBullets||[];orbs=state.orbs||[];rings=state.rings||[];particles=[];renderSlots();ui.startModal.classList.add('hidden');running=true;paused=false;last=performance.now();rebuildFlow();updateUI();if(state.levelPending)showLevelUp();requestAnimationFrame(loop);
}

function saveStats(){try{localStorage.setItem('swarmfall-stats',JSON.stringify(savedStats))}catch{}}
function formatTime(seconds){return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`}
function showStats(){savedStats=loadStats();ui.bestTime.textContent=formatTime(savedStats.bestTime);ui.totalTime.textContent=formatTime(savedStats.totalTime);ui.bestKills.textContent=savedStats.bestKills;ui.totalKills.textContent=savedStats.totalKills;ui.startModal.classList.add('hidden');ui.statsModal.classList.remove('hidden')}
function togglePause(){if(!running||!ui.levelModal.classList.contains('hidden')||!ui.endModal.classList.contains('hidden'))return;paused=!paused;if(paused)saveGame();ui.pauseModal.classList.toggle('hidden',!paused);keys.w=keys.a=keys.s=keys.d=false}
function start(){clearGameSave();ui.startModal.classList.add('hidden');running=true;paused=false;last=performance.now();requestAnimationFrame(loop)}
function enemyAt(x,y,type='melee'){
  const scale=1+Math.min(elapsed,900)*.0025,stats={melee:{r:13,hp:22,speed:76},brute:{r:24,hp:70,speed:49},shooter:{r:16,hp:32,speed:62},charger:{r:19,hp:48,speed:67},exploder:{r:17,hp:35,speed:61},swarm:{r:7,hp:7,speed:132}}[type];
  return {x,y,type,r:stats.r,hp:stats.hp*scale,max:stats.hp*scale,speed:stats.speed,hit:0,attackCd:1+Math.random(),chargeCd:1.5+Math.random()*2,phase:Math.random()*6.28};
}
function spawnEnemy(typeOverride){
  let x,y;for(let tries=0;tries<20;tries++){const a=Math.random()*Math.PI*2,d=Math.max(W,H)*(.58+Math.random()*.12);x=Math.max(35,Math.min(WORLD.w-35,player.x+Math.cos(a)*d));y=Math.max(35,Math.min(WORLD.h-35,player.y+Math.sin(a)*d));if(!blocked(x,y,28)&&dist({x,y},player)>350)break}if(blocked(x,y,28))return;
  const roll=Math.random();let type=typeOverride||'melee';if(!typeOverride){if(roll<.12)type='swarm';else if(roll<.24)type='exploder';else if(roll<.36)type='shooter';else if(roll<.47)type='charger';else if(roll>.93)type='brute'};
  if(type==='swarm'){for(let i=0;i<5+Math.floor(Math.random()*3);i++){const a=Math.random()*6.28,d=Math.random()*38,nx=x+Math.cos(a)*d,ny=y+Math.sin(a)*d;if(!blocked(nx,ny,8))enemies.push(enemyAt(nx,ny,'swarm'))}}else enemies.push(enemyAt(x,y,type));
}
function directorState(){
  const cycle=Math.floor(elapsed/300),time=elapsed%300,difficulty=1+cycle*.12;
  if(time<120)return {name:`FAZA ${cycle*3+1} · NAPŁYW`,interval:.82/difficulty,pool:['melee','melee','melee','melee','swarm','brute']};
  if(time<240)return {name:`FAZA ${cycle*3+2} · OSTRZAŁ`,interval:.76/difficulty,pool:['shooter','shooter','melee','melee','exploder','swarm']};
  return {name:`FAZA ${cycle*3+3} · ELITA`,interval:1.08/difficulty,pool:['charger','charger','brute','brute','shooter','exploder']};
}
function spawnEncounter(){const director=directorState(),type=director.pool[Math.floor(Math.random()*director.pool.length)];spawnEnemy(type);if(elapsed%300>=240&&Math.random()<.22)spawnEnemy('melee')}
function updateEnemy(e,dt){
  const direct=Math.atan2(player.y-e.y,player.x-e.x),d=dist(e,player);e.attackCd-=dt;e.chargeCd-=dt;
  if(e.type==='shooter'){
    if(d>390)moveEnemy(e,direct,e.speed*dt);else if(d<255)moveEnemy(e,direct+Math.PI,e.speed*.75*dt);
    else{e.strafe=(e.strafe||1);moveEnemy(e,direct+e.strafe*Math.PI/2,e.speed*.28*dt)}
    if(e.attackCd<=0&&d<560&&hasClearPath(e,player,4)){const a=Math.atan2(player.y-e.y,player.x-e.x);enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(a)*260,vy:Math.sin(a)*260,r:6,life:3});e.attackCd=1.75;burst(e.x,e.y,'#ffb45e',7)}
  }else if(e.type==='charger'){
    if(e.charging){const nx=e.x+e.chargeX*430*dt,ny=e.y+e.chargeY*430*dt;if(blocked(nx,ny,e.r)){e.charging=0;e.chargeCd=2.5;screenShake=3}else{e.x=nx;e.y=ny;e.charging-=dt}}
    else if(e.windup){e.windup-=dt;if(e.windup<=0){const a=Math.atan2(player.y-e.y,player.x-e.x);e.chargeX=Math.cos(a);e.chargeY=Math.sin(a);e.charging=.55;screenShake=5}}
    else if(e.chargeCd<=0&&d<480){e.windup=.65;e.chargeCd=4}else moveEnemy(e,direct,e.speed*dt);
  }else moveEnemy(e,direct,e.speed*dt);
}

function shoot(){const a=Math.atan2(mouse.y+camera.y-player.y,mouse.x+camera.x-player.x),count=1+(levels.multi||0);for(let i=0;i<count;i++){const spread=(i-(count-1)/2)*.12;bullets.push({x:player.x,y:player.y,vx:Math.cos(a+spread)*570,vy:Math.sin(a+spread)*570,r:4,life:1.3,damage:14*(1+.25*(levels.power||0))})}burst(player.x+Math.cos(a)*22,player.y+Math.sin(a)*22,'#51f6df',4)}
function cast(k){const s=skills[k];if(s.cd>0)return;s.cd=s.max;if(k==='q'){const a=Math.atan2(mouse.y+camera.y-player.y,mouse.x+camera.x-player.x);for(let i=-2;i<=2;i++){const aa=a+i*.11;bullets.push({x:player.x,y:player.y,vx:Math.cos(aa)*720,vy:Math.sin(aa)*720,r:7,life:.7,damage:30,pierce:2})}screenShake=6}else if(k==='e'){rings.push({x:player.x,y:player.y,r:5,max:190,life:.5,color:'#4cc8ff'});enemies.forEach(e=>{if(dist(e,player)<190){e.hp-=35;const a=Math.atan2(e.y-player.y,e.x-player.x);e.x+=Math.cos(a)*70;e.y+=Math.sin(a)*70}});player.invuln=1}else{rings.push({x:player.x,y:player.y,r:10,max:500,life:1,color:'#b66cff'});enemies.forEach(e=>{if(dist(e,player)<500)e.hp-=110});screenShake=14;for(let i=0;i<60;i++)burst(player.x,player.y,i%2?'#a06cff':'#51f6df',1)}}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}function burst(x,y,color,n=8){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=Math.random()*120+25;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.3,color,size:Math.random()*3+1})}}
function update(dt){elapsed+=dt;saveClock+=dt;if(saveClock>=5){saveClock=0;saveGame()}flowClock-=dt;if(flowClock<=0){rebuildFlow();flowClock=.4}statsClock+=dt;if(statsClock>=1){savedStats.totalTime+=Math.floor(statsClock);statsClock%=1;saveStats()}player.invuln=Math.max(0,player.invuln-dt);Object.values(skills).forEach(s=>s.cd=Math.max(0,s.cd-dt));let dx=(keys.d?1:0)-(keys.a?1:0),dy=(keys.s?1:0)-(keys.w?1:0),l=Math.hypot(dx,dy)||1,speed=player.speed*(1+.12*(levels.speed||0));const nextX=player.x+dx/l*speed*dt,nextY=player.y+dy/l*speed*dt;if(!blocked(nextX,player.y,player.r))player.x=nextX;if(!blocked(player.x,nextY,player.r))player.y=nextY;camera.x=Math.max(0,Math.min(WORLD.w-W,player.x-W/2));camera.y=Math.max(0,Math.min(WORLD.h-H,player.y-H/2));shotClock-=dt;if(shotClock<=0){shoot();shotClock=.62/Math.pow(1.18,levels.rapid||0)}spawnClock-=dt;if(spawnClock<=0){const director=directorState();spawnEncounter();spawnClock=Math.max(.34,director.interval)}
  bullets.forEach(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(projectileBlocked(b.x,b.y)){b.life=0;burst(b.x,b.y,'#8ca1b5',5)}});enemyBullets.forEach(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(projectileBlocked(b.x,b.y))b.life=0;if(b.life>0&&dist(b,player)<b.r+player.r&&player.invuln<=0){b.life=0;player.hp-=10;player.invuln=.5;screenShake=7;burst(player.x,player.y,'#ff9d57',10)}});enemyBullets=enemyBullets.filter(b=>b.life>0);
  enemies.forEach(e=>{updateEnemy(e,dt);e.hit=Math.max(0,e.hit-dt);if(dist(e,player)<e.r+player.r&&player.invuln<=0){const damage=e.type==='brute'||e.type==='charger'?16:e.type==='swarm'?5:9;player.hp-=damage;player.invuln=.55;screenShake=9;burst(player.x,player.y,'#ff5577',12)}});
  bullets.forEach(b=>enemies.forEach(e=>{if(b.life>0&&e.hp>0&&dist(b,e)<b.r+e.r&&e.hit<=0){let dmg=b.damage;if(Math.random()<.1*(levels.crit||0)){dmg*=2;burst(e.x,e.y,'#ffd467',9)}e.hp-=dmg;e.hit=.06;b.pierce=(b.pierce||0)-1;if(b.pierce<0)b.life=0;burst(e.x,e.y,'#58e9e0',4)}}));
  enemies.filter(e=>e.hp<=0).forEach(e=>{player.kills++;savedStats.totalKills++;saveStats();const value=e.type==='brute'?6:e.type==='swarm'?1:3;orbs.push({x:e.x,y:e.y,r:5,value,vx:0,vy:0});if(e.type==='exploder'){rings.push({x:e.x,y:e.y,r:8,max:145,life:.55,color:'#ff8b38'});if(dist(e,player)<145&&player.invuln<=0){player.hp-=18;player.invuln=.6;screenShake=12}for(let i=0;i<30;i++)burst(e.x,e.y,i%2?'#ff8b38':'#ffe26d',1)}else burst(e.x,e.y,e.type==='brute'?'#b56cff':'#ff5577',e.type==='swarm'?7:14)});enemies=enemies.filter(e=>e.hp>0);
  const magnet=105*Math.pow(1.45,levels.magnet||0);orbs.forEach(o=>{const d=dist(o,player);if(d<magnet){const a=Math.atan2(player.y-o.y,player.x-o.x),v=200+(magnet-d)*4;o.x+=Math.cos(a)*v*dt;o.y+=Math.sin(a)*v*dt}if(d<player.r+10){o.dead=true;gainXp(o.value)}});orbs=orbs.filter(o=>!o.dead);
  particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.95;p.vy*=.95;p.life-=dt});particles=particles.filter(p=>p.life>0);rings.forEach(r=>{r.r+=(r.max-r.r)*9*dt;r.life-=dt});rings=rings.filter(r=>r.life>0);bullets=bullets.filter(b=>b.life>0);screenShake*=.87;if(player.hp<=0)gameOver();updateUI()}
function gainXp(n){player.xp+=n;burst(player.x,player.y,'#51f6df',3);if(player.xp>=player.nextXp){player.xp-=player.nextXp;player.level++;player.nextXp=Math.floor(player.nextXp*1.34);showLevelUp()}}
function showLevelUp(){paused=true;ui.newLevel.textContent=player.level;ui.levelModal.classList.remove('hidden');const owned=Object.keys(levels),available=upgrades.filter(u=>owned.length<5||levels[u.id]);const picks=[...available].sort(()=>Math.random()-.5).slice(0,3);ui.cards.innerHTML=picks.map(u=>`<button class="card" data-id="${u.id}" style="--card:${u.color}"><div class="rarity">${levels[u.id]?'ULEPSZENIE':'NOWA ZDOLNOŚĆ'}</div><div class="card-art ${u.id}" style="--glow:${u.color}"><i></i><span>${u.icon}</span><i></i></div><h3>${u.name}</h3><p>${u.desc}</p><span class="level">${levels[u.id]?'POZIOM '+(levels[u.id]+1):'POZIOM 1'}</span></button>`).join('');ui.cards.querySelectorAll('.card').forEach(c=>c.onclick=()=>choose(c.dataset.id))}
function choose(id){levels[id]=(levels[id]||0)+1;if(id==='vital'){player.maxHp+=20;player.hp=Math.min(player.maxHp,player.hp+30)}ui.levelModal.classList.add('hidden');paused=false;renderSlots()}
function renderSlots(){const entries=Object.entries(levels);ui.slots.innerHTML='';for(let i=0;i<5;i++){const el=document.createElement('div');el.className='slot'+(entries[i]?' filled':'');if(entries[i]){const u=upgrades.find(x=>x.id===entries[i][0]);el.style.color=u.color;el.innerHTML=`${u.icon}<b>LV ${entries[i][1]}</b>`}ui.slots.appendChild(el)}document.querySelector('.equipment p span').textContent=entries.length+' / 5'}renderSlots();
function updateUI(){ui.phaseLabel.textContent=directorState().name;ui.timer.textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`;ui.kills.textContent=player.kills;ui.level.textContent=ui.xpLevel.textContent=player.level;ui.healthText.textContent=`${Math.ceil(player.hp)} / ${player.maxHp}`;ui.healthBar.style.width=Math.max(0,player.hp/player.maxHp*100)+'%';ui.xpText.textContent=`${player.xp} / ${player.nextXp} XP`;ui.xpBar.style.width=player.xp/player.nextXp*100+'%';document.querySelector('#coordinates').textContent=`X ${String(Math.round(player.x)).padStart(4,'0')} · Y ${String(Math.round(player.y)).padStart(4,'0')}`;for(const [k,s] of Object.entries(skills)){const el=document.querySelector(`[data-key="${k.toUpperCase()}"]`);el.classList.toggle('cooldown',s.cd>0);el.querySelector('.cd').textContent=s.cd>0?s.cd.toFixed(s.cd<10?1:0):''}}
function gameOver(){if(!running)return;running=false;clearGameSave();paused=true;savedStats.bestTime=Math.max(savedStats.bestTime,Math.floor(elapsed));savedStats.bestKills=Math.max(savedStats.bestKills,player.kills);saveStats();ui.pauseModal.classList.add('hidden');ui.endStats.textContent=`Przetrwano ${ui.timer.textContent} • ${player.kills} eliminacji • poziom ${player.level}`;ui.endModal.classList.remove('hidden')}
function drawTerrain(){terrain.forEach(t=>{ctx.save();if(t.type==='water'){tracePolygon(ctx,t.points);const water=ctx.createLinearGradient(t.points[0][0],t.points[0][1],t.points[2][0],t.points[2][1]);water.addColorStop(0,'#082b3b');water.addColorStop(1,'#0d5265');ctx.fillStyle=water;ctx.fill();ctx.clip();ctx.strokeStyle='rgba(88,222,229,.16)';ctx.lineWidth=3;for(let y=0;y<WORLD.h;y+=24){ctx.beginPath();ctx.moveTo(0,y+Math.sin(elapsed+y)*5);ctx.lineTo(WORLD.w,y);ctx.stroke()}ctx.restore();ctx.save();tracePolygon(ctx,t.points);ctx.strokeStyle='#25788a';ctx.lineWidth=5;ctx.stroke()}else if(t.type==='wall'){ctx.fillStyle='#263346';ctx.strokeStyle='#64748a';ctx.lineWidth=3;ctx.shadowBlur=12;ctx.shadowColor='#000';ctx.fillRect(t.x,t.y,t.w,t.h);ctx.strokeRect(t.x,t.y,t.w,t.h);ctx.fillStyle='#151e2d';for(let x=t.x+12;x<t.x+t.w-8;x+=34)for(let y=t.y+10;y<t.y+t.h-8;y+=30)ctx.fillRect(x,y,18,7)}else{const g=ctx.createRadialGradient(t.x-t.r*.3,t.y-t.r*.35,5,t.x,t.y,t.r);g.addColorStop(0,'#435064');g.addColorStop(.45,'#263246');g.addColorStop(1,'#111a28');ctx.fillStyle=g;ctx.strokeStyle='#536176';ctx.lineWidth=3;ctx.beginPath();for(let i=0;i<11;i++){const a=i/11*Math.PI*2,rr=t.r*(.78+(i%4)*.07);ctx.lineTo(t.x+Math.cos(a)*rr,t.y+Math.sin(a)*rr)}ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#73819655';ctx.beginPath();ctx.moveTo(t.x-t.r*.45,t.y-t.r*.3);ctx.lineTo(t.x+t.r*.1,t.y-t.r*.05);ctx.lineTo(t.x+t.r*.42,t.y+t.r*.32);ctx.stroke()}ctx.restore()})}
function drawScenery(s){
  ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.rot);
  if(s.type==='crystal'){ctx.shadowBlur=16;ctx.shadowColor='rgba(43,192,191,.35)';ctx.fillStyle='#122f3b';ctx.strokeStyle='#277a83';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-s.size);ctx.lineTo(s.size*.55,4);ctx.lineTo(s.size*.25,s.size*.65);ctx.lineTo(-s.size*.38,s.size*.45);ctx.lineTo(-s.size*.55,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(0,-s.size);ctx.lineTo(0,s.size*.45);ctx.lineTo(s.size*.55,4);ctx.stroke()}
  else if(s.type==='rock'){ctx.fillStyle='#121a2a';ctx.strokeStyle='#28334b';ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<7;i++){const a=i/7*Math.PI*2,r=s.size*(.7+(i%3)*.13);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='rgba(105,127,157,.18)';ctx.beginPath();ctx.moveTo(-s.size*.4,-s.size*.3);ctx.lineTo(s.size*.2,-s.size*.1);ctx.lineTo(s.size*.45,s.size*.4);ctx.stroke()}
  else{ctx.fillStyle='#131d2e';ctx.strokeStyle='#344860';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,s.size,0,7);ctx.fill();ctx.stroke();ctx.strokeStyle='#51f6df44';for(let i=0;i<6;i++){ctx.rotate(Math.PI/3);ctx.beginPath();ctx.moveTo(s.size*.3,0);ctx.lineTo(s.size*.78,0);ctx.stroke()}ctx.fillStyle='#050912';ctx.beginPath();ctx.arc(0,0,s.size*.3,0,7);ctx.fill()}
  ctx.restore();
}
function drawEnemy(e){
  const a=Math.atan2(player.y-e.y,player.x-e.x),bob=Math.sin(elapsed*7+e.phase);
  ctx.save();ctx.translate(e.x,e.y);ctx.rotate(a);ctx.shadowBlur=e.hit?24:14;
  if(e.type==='shooter'){
    ctx.rotate(Math.sin(elapsed*2+e.phase)*.12);ctx.shadowColor='#ffb45e';ctx.fillStyle=e.hit?'#fff':'#4a2c22';ctx.strokeStyle='#ffb45e';ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<6;i++){const aa=i/6*6.28,r=i%2?e.r*.65:e.r;ctx.lineTo(Math.cos(aa)*r,Math.sin(aa)*r)}ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#ffe0a8';ctx.fillRect(1,-4,e.r+9,8);ctx.fillStyle='#1b0e0a';ctx.beginPath();ctx.arc(1,0,5,0,7);ctx.fill();
  }else if(e.type==='charger'){
    const pulse=e.windup?1+Math.sin(elapsed*35)*.13:1;ctx.scale(pulse,pulse);ctx.shadowColor='#67a9ff';ctx.fillStyle=e.hit?'#fff':'#182f51';ctx.strokeStyle=e.windup?'#fff':'#62a4ff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(e.r*1.45,0);ctx.lineTo(e.r*.4,-e.r*.8);ctx.lineTo(-e.r*.9,-e.r);ctx.lineTo(-e.r*.5,0);ctx.lineTo(-e.r*.9,e.r);ctx.lineTo(e.r*.4,e.r*.8);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#a9d1ff';ctx.fillRect(e.r*.1,-3,e.r*.85,6);if(e.windup){ctx.strokeStyle='#a9d1ff';ctx.globalAlpha=.7;ctx.beginPath();ctx.moveTo(e.r*1.7,0);ctx.lineTo(e.r*4.3,0);ctx.stroke()}
  }else if(e.type==='exploder'){
    const pulse=1+Math.sin(elapsed*8+e.phase)*.09;ctx.scale(pulse,pulse);ctx.shadowColor='#ff7b36';ctx.fillStyle=e.hit?'#fff':'#512717';ctx.strokeStyle='#ff8b38';ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<10;i++){const aa=i/10*6.28,r=i%2?e.r*.76:e.r;ctx.lineTo(Math.cos(aa)*r,Math.sin(aa)*r)}ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#ffd05e';ctx.shadowBlur=18;ctx.beginPath();ctx.arc(0,0,e.r*.43,0,7);ctx.fill();ctx.strokeStyle='#5d2413';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.rotate(2.1);ctx.beginPath();ctx.moveTo(e.r*.45,0);ctx.lineTo(e.r*.85,0);ctx.stroke()}
  }else if(e.type==='swarm'){
    ctx.translate(0,bob*2);ctx.rotate(bob*.18);ctx.shadowColor='#ec6dff';ctx.fillStyle=e.hit?'#fff':'#7e2d8d';ctx.strokeStyle='#f39dff';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(e.r*1.4,0);ctx.lineTo(-e.r,-e.r*.8);ctx.lineTo(-e.r*.35,0);ctx.lineTo(-e.r,e.r*.8);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#e9a5ff';ctx.beginPath();ctx.moveTo(0,-e.r*.5);ctx.lineTo(-e.r*1.5,-e.r*1.25-bob);ctx.moveTo(0,e.r*.5);ctx.lineTo(-e.r*1.5,e.r*1.25+bob);ctx.stroke();
  }else{
    const brute=e.type==='brute';ctx.scale(1+bob*.04,1+bob*.04);ctx.shadowColor=brute?'#a06cff':'#ff3e6d';ctx.fillStyle=e.hit?'#fff':brute?'#3e255e':'#411629';ctx.strokeStyle=brute?'#c781ff':'#ff557c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(e.r*1.18,0);ctx.bezierCurveTo(e.r*.45,-e.r*.9,-e.r*.5,-e.r,-e.r*.85,-e.r*.35);ctx.lineTo(-e.r*1.25,-e.r*.7);ctx.lineTo(-e.r*.92,0);ctx.lineTo(-e.r*1.25,e.r*.7);ctx.bezierCurveTo(-e.r*.5,e.r,e.r*.45,e.r*.9,e.r*1.18,0);ctx.fill();ctx.stroke();ctx.fillStyle=brute?'#d4a0ff':'#ff9aae';ctx.beginPath();ctx.ellipse(e.r*.35,-e.r*.22,e.r*.2,e.r*.11,-.25,0,7);ctx.ellipse(e.r*.35,e.r*.22,e.r*.2,e.r*.11,.25,0,7);ctx.fill();
  }
  ctx.restore();if(e.type==='brute'||e.type==='charger'){ctx.fillStyle='#161427';ctx.fillRect(e.x-22,e.y-e.r-14,44,4);ctx.fillStyle=e.type==='charger'?'#62a4ff':'#a96cff';ctx.fillRect(e.x-22,e.y-e.r-14,44*e.hp/e.max,4)}
}
function drawPlayer(){ctx.save();ctx.translate(player.x,player.y);const a=Math.atan2(mouse.y+camera.y-player.y,mouse.x+camera.x-player.x);ctx.rotate(a);ctx.shadowBlur=28;ctx.shadowColor=player.invuln?'#fff':'#51f6df';
  ctx.fillStyle='#0b2630';ctx.strokeStyle=player.invuln?'#fff':'#61fff0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(23,0);ctx.lineTo(7,-12);ctx.lineTo(-10,-15);ctx.lineTo(-5,-6);ctx.lineTo(-18,-4);ctx.lineTo(-18,4);ctx.lineTo(-5,6);ctx.lineTo(-10,15);ctx.lineTo(7,12);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#9afff5';ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(2,-4);ctx.lineTo(2,4);ctx.closePath();ctx.fill();ctx.fillStyle='#eaffff';ctx.beginPath();ctx.arc(-3,0,5,0,7);ctx.fill();ctx.strokeStyle='#4cc8ff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-10,-10);ctx.lineTo(-24,-15);ctx.moveTo(-10,10);ctx.lineTo(-24,15);ctx.stroke();ctx.restore()}
function drawMinimap(){const mw=minimap.width,mh=minimap.height,sx=mw/WORLD.w,sy=mh/WORLD.h;mapCtx.clearRect(0,0,mw,mh);mapCtx.fillStyle='#03070d';mapCtx.fillRect(0,0,mw,mh);tracePolygon(mapCtx,MAP_SHAPE.map(([x,y])=>[x*sx,y*sy]));mapCtx.fillStyle='#0b1b29';mapCtx.fill();mapCtx.strokeStyle='#315467';mapCtx.stroke();mapCtx.strokeStyle='#183247';mapCtx.lineWidth=1;for(let x=0;x<mw;x+=22){mapCtx.beginPath();mapCtx.moveTo(x,0);mapCtx.lineTo(x,mh);mapCtx.stroke()}for(let y=0;y<mh;y+=15){mapCtx.beginPath();mapCtx.moveTo(0,y);mapCtx.lineTo(mw,y);mapCtx.stroke()}terrain.forEach(t=>{if(t.type==='water'){mapCtx.fillStyle='#0d5064';tracePolygon(mapCtx,t.points.map(([x,y])=>[x*sx,y*sy]));mapCtx.fill()}else if(t.type==='wall'){mapCtx.fillStyle='#738398';mapCtx.fillRect(t.x*sx,t.y*sy,t.w*sx,t.h*sy)}else{mapCtx.fillStyle='#3b4657';mapCtx.beginPath();mapCtx.arc(t.x*sx,t.y*sy,t.r*sx,0,7);mapCtx.fill()}});mapCtx.fillStyle='#355064';scenery.filter((_,i)=>i%3===0).forEach(s=>mapCtx.fillRect(s.x*sx,s.y*sy,1.5,1.5));enemies.forEach(e=>{mapCtx.fillStyle={shooter:'#ffb45e',charger:'#62a4ff',exploder:'#ff7638',swarm:'#ed83ff'}[e.type]||'#ff5277';mapCtx.fillRect(e.x*sx-1,e.y*sy-1,e.type==='swarm'?2:3,e.type==='swarm'?2:3)});mapCtx.strokeStyle='#51f6df55';mapCtx.strokeRect(camera.x*sx,camera.y*sy,W*sx,H*sy);mapCtx.shadowBlur=8;mapCtx.shadowColor='#51f6df';mapCtx.fillStyle='#9ffff3';mapCtx.beginPath();mapCtx.arc(player.x*sx,player.y*sy,3.5,0,7);mapCtx.fill();mapCtx.shadowBlur=0}
function draw(){ctx.save();if(screenShake)ctx.translate((Math.random()-.5)*screenShake,(Math.random()-.5)*screenShake);ctx.fillStyle='#070b15';ctx.fillRect(0,0,W,H);ctx.translate(-camera.x,-camera.y);
  const bg=ctx.createRadialGradient(player.x,player.y,40,player.x,player.y,900);bg.addColorStop(0,'#173144');bg.addColorStop(.6,'#102232');bg.addColorStop(1,'#09131e');tracePolygon(ctx,MAP_SHAPE);ctx.fillStyle=bg;ctx.shadowBlur=30;ctx.shadowColor='#02040a';ctx.fill();ctx.shadowBlur=0;ctx.save();tracePolygon(ctx,MAP_SHAPE);ctx.clip();
  ctx.strokeStyle='rgba(77,148,173,.045)';ctx.lineWidth=1;for(let x=0;x<WORLD.w;x+=120){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,WORLD.h);ctx.stroke()}for(let y=0;y<WORLD.h;y+=120){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WORLD.w,y);ctx.stroke()}ctx.restore();drawTerrain();
  tracePolygon(ctx,MAP_SHAPE);ctx.strokeStyle='#315467';ctx.lineWidth=12;ctx.stroke();ctx.strokeStyle='#51f6df22';ctx.lineWidth=2;ctx.stroke();
  scenery.forEach(s=>{if(!blocked(s.x,s.y,2)&&s.x>camera.x-60&&s.x<camera.x+W+60&&s.y>camera.y-60&&s.y<camera.y+H+60)drawScenery(s)});
  orbs.forEach(o=>{ctx.shadowBlur=16;ctx.shadowColor='#51f6df';ctx.fillStyle='#80fff0';ctx.beginPath();ctx.moveTo(o.x,o.y-o.r);ctx.lineTo(o.x+o.r,o.y);ctx.lineTo(o.x,o.y+o.r);ctx.lineTo(o.x-o.r,o.y);ctx.fill();ctx.shadowBlur=0});
  bullets.forEach(b=>{ctx.shadowBlur=14;ctx.shadowColor='#51f6df';ctx.fillStyle='#bafff7';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,7);ctx.fill();ctx.shadowBlur=0});enemyBullets.forEach(b=>{ctx.shadowBlur=18;ctx.shadowColor='#ff8b38';ctx.fillStyle='#ffd078';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,7);ctx.fill();ctx.strokeStyle='#ff7a3d';ctx.beginPath();ctx.moveTo(b.x-b.vx*.045,b.y-b.vy*.045);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.shadowBlur=0});enemies.forEach(drawEnemy);
  rings.forEach(r=>{ctx.globalAlpha=Math.max(0,r.life);ctx.strokeStyle=r.color;ctx.lineWidth=5;ctx.shadowBlur=20;ctx.shadowColor=r.color;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,7);ctx.stroke();ctx.globalAlpha=1;ctx.shadowBlur=0});particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size);ctx.globalAlpha=1});drawPlayer();ctx.restore();drawMinimap()}

addEventListener('beforeunload',()=>saveGame());addEventListener('visibilitychange',()=>{if(document.hidden)saveGame()});refreshContinueButton();
function loop(t){const dt=Math.min((t-last)/1000,.033);last=t;if(running&&!paused)update(dt);draw();requestAnimationFrame(loop)}draw();
document.querySelectorAll('.ability canvas').forEach((c,i)=>{const x=c.getContext('2d'),colors=['#51f6df','#4cc8ff','#a06cff'];x.strokeStyle=colors[i];x.lineWidth=4;x.shadowBlur=12;x.shadowColor=colors[i];x.beginPath();if(i===0){x.moveTo(18,52);x.lineTo(53,17);x.moveTo(25,53);x.lineTo(55,23)}else if(i===1){x.arc(36,36,18,0,Math.PI*1.7);x.lineTo(47,27)}else{for(let a=0;a<7;a++){const r=a%2?10:23,aa=-Math.PI/2+a*Math.PI/3.5;x.lineTo(36+Math.cos(aa)*r,36+Math.sin(aa)*r)}x.closePath()}x.stroke()});
