(() => {
  let session=null,state=null,previous=null,receivedAt=0,sendClock=0,lastLevelRound=0,remotePlayers=[],effectiveSpeed=0,remoteVisuals=new Map(),localAttackSeq=0,localAbilitySeq=0;
  try{session=JSON.parse(sessionStorage.getItem('swarmfall-multiplayer-session')||'null')}catch{}
  const socket=()=>window.SwarmSocket;
  function getSession(){if(session)return session;try{session=JSON.parse(sessionStorage.getItem('swarmfall-multiplayer-session')||'null')}catch{}return session}
  function isActive(){return Boolean(getSession()&&running&&socket()?.isOpen())}
  function accept(message){
    if(!getSession())return;
    if(message.type==='gameStarted'){document.getElementById('multiplayerWaiting').classList.add('hidden');state=null;previous=null;lastLevelRound=0;remoteVisuals.clear();remotePlayers=[];localAttackSeq=0;localAbilitySeq=0}
    if(message.type==='gameState'){previous=state;state=message.state;receivedAt=performance.now();applyState()}
    if(message.type==='upgradeWaiting')document.getElementById('multiplayerWaiting').classList.remove('hidden');
    if(message.type==='levelResume'){paused=false;document.getElementById('multiplayerWaiting').classList.add('hidden')}
    if(message.type==='upgradeOffer'&&message.round===lastLevelRound){upgradeOfferKeys=message.offer.slice(0,3);upgradeRerolled.push(message.index);renderUpgradeOffer(bossChoicesQueued>0)}
    if(message.type==='gameOver'){running=false;paused=true;ui.endTitle.textContent='KONIEC MECZU';ui.endStats.textContent='Cała drużyna została pokonana.';ui.restartBtn.textContent='WRÓĆ DO LOBBY';ui.restartBtn.onclick=()=>{socket().send('returnToLobby');sessionStorage.removeItem('swarmfall-multiplayer-session');session=null;state=null;ui.endModal.classList.add('hidden');document.getElementById('multiplayerModal').classList.remove('hidden')};ui.endModal.classList.remove('hidden')}
    if(message.type==='levelUp'&&message.round>lastLevelRound){lastLevelRound=message.round;paused=true;levelChoicesQueued=1;upgradeOfferKeys=Array.isArray(message.offer)?message.offer.slice(0,3):[];upgradeRerolled=[];showLevelUp(false)}
  }
  function applyState(){
    if(!state)return;elapsed=state.time;player.level=state.level;player.xp=state.xp;player.nextXp=state.nextXp;paused=state.paused;if(!paused)document.getElementById('multiplayerWaiting').classList.add('hidden');const mine=state.players.find(p=>p.id===session.playerId);
    if(mine){const error=Math.hypot(player.x-mine.x,player.y-mine.y);if(error>90){player.x=mine.x;player.y=mine.y}else{player.x+=(mine.x-player.x)*.35;player.y+=(mine.y-player.y)*.35}player.hp=mine.hp;player.maxHp=mine.maxHp;player.kills=mine.kills;effectiveSpeed=mine.speed||characterDefs[chosenCharacter].speed;if(mine.attackSeq!==localAttackSeq){localAttackSeq=mine.attackSeq;player.attackAnim=.28;player.attackAngle=mine.facing}if(mine.abilitySeq!==localAbilitySeq){localAbilitySeq=mine.abilitySeq;player.skillAnim=mine.lastAbility;player.skillAnimTime=.5}if(mine.cooldowns){skills.q.cd=mine.cooldowns.q;skills.e.cd=mine.cooldowns.e;skills.r.cd=mine.cooldowns.r}}
    remotePlayers=state.players.filter(p=>p.id!==session.playerId);SwarmRemoteVisuals.update(remoteVisuals,remotePlayers,receivedAt);enemies=state.enemies.map(e=>({...e,type:e.type||'melee',attackCd:1,chargeCd:1,phase:0,hit:SwarmRemoteVisuals.damageFlash(previous?.enemies.find(old=>old.id===e.id),e)}));bullets=state.bullets.map(b=>({...b,r:b.r||4,kind:b.kind||'scoutBullet'}));enemyBullets=(state.enemyBullets||[]).map(b=>({...b,r:b.r||6}));orbs=(state.orbs||[]).map(o=>({...o,r:5,vx:0,vy:0}));loot=state.loot||[];crates=state.crates||crates;camera.x=Math.max(0,Math.min(WORLD.w-W,player.x-W/2));camera.y=Math.max(0,Math.min(WORLD.h-H,player.y-H/2));updateUI()
  }
  function frame(dt){
    if(!isActive())return;player.attackAnim=Math.max(0,(player.attackAnim||0)-dt);player.skillAnimTime=Math.max(0,(player.skillAnimTime||0)-dt);sendClock-=dt;if(sendClock<=0){const aim=Math.atan2(mouse.y+camera.y-player.y,mouse.x+camera.x-player.x);socket().send('playerInput',{up:!!keys.w,down:!!keys.s,left:!!keys.a,right:!!keys.d,aim,q:!!keys.q,e:!!keys.e,r:!!keys.r});sendClock=1/25}
    if(!paused){const dx=(keys.d?1:0)-(keys.a?1:0),dy=(keys.s?1:0)-(keys.w?1:0),len=Math.hypot(dx,dy)||1,speed=effectiveSpeed||characterDefs[chosenCharacter].speed,nx=player.x+dx/len*speed*dt,ny=player.y+dy/len*speed*dt;if(!blocked(nx,player.y,player.r))player.x=nx;if(!blocked(player.x,ny,player.r))player.y=ny}
    if(state){const alpha=Math.min(1,(performance.now()-receivedAt)/80);remotePlayers=[...remoteVisuals.values()].map(visual=>SwarmRemoteVisuals.sample(visual,performance.now()));enemies=state.enemies.map(current=>{const old=previous?.enemies.find(e=>e.id===current.id)||current;return{...current,x:old.x+(current.x-old.x)*alpha,y:old.y+(current.y-old.y)*alpha,attackCd:1,chargeCd:1,phase:0,hit:SwarmRemoteVisuals.damageFlash(old,current)}});bullets=state.bullets.map(current=>{const old=previous?.bullets.find(b=>b.id===current.id)||current;return{...current,x:old.x+(current.x-old.x)*alpha,y:old.y+(current.y-old.y)*alpha,r:current.r||4}})}
  }
  function levelShown(){}
  function choiceMade(choice){if(!isActive())return false;document.getElementById('multiplayerWaiting').classList.remove('hidden');socket().send('upgradeChoice',{choice});return true}
  function requestReroll(index){if(isActive())socket().send('rerollUpgrade',{index})}
  function drawPlayers(context){remotePlayers.filter(other=>other.alive!==false).forEach(other=>drawCharacterActor(context,{x:other.x,y:other.y,character:other.character,facing:other.facing,animation:other.animation,animationTime:other.animationTime,name:other.name||'GRACZ',hp:other.hp,maxHp:other.maxHp,attackAnim:other.attackAnim,abilityActive:other.abilityActive,lastAbility:other.lastAbility}))}
  window.SwarmMultiplayerSync={isActive,frame,levelShown,choiceMade,requestReroll,drawPlayers};
  const wait=setInterval(()=>{if(socket()?.on){socket().on(accept);clearInterval(wait)}},50)
})();
