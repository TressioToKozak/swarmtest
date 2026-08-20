(() => {
  let session=null,authoritativePlayerId=null,connectionGeneration=0,lastAppliedHelloAck=null,state=null,previous=null,receivedAt=0,sendClock=0,lastLevelRound=0,lastWaveSeq=0,inputSeq=0,abilityInputSeq=0,serverOffset=0,serverPaused=false,localMenuOpen=false,isDead=false,isSpectator=false,spectatorTargetId=null,deathOverlayUntil=0;
  let remotePlayers=[],effectiveSpeed=0,remoteVisuals=new Map(),localAttackSeq=0,localAbilitySeq=0,pendingInputs=[];
  let previousEnemies=new Map(),enemyVisuals=new Map(),bulletVisuals=new Map();
  const cooldownElements={};
  try{session=JSON.parse(sessionStorage.getItem('swarmfall-multiplayer-session')||'null')}catch{}
  const socket=()=>window.SwarmSocket;
  function getSession(){if(session)return session;try{session=JSON.parse(sessionStorage.getItem('swarmfall-multiplayer-session')||'null')}catch{}return session}
  function isActive(){return Boolean(getSession()&&authoritativePlayerId&&running&&socket()?.isOpen())}
  function accept(message){
    if(message.type==='helloAck'){if(!SwarmSocketState.shouldApplyHelloAck(lastAppliedHelloAck,message))return;lastAppliedHelloAck={connectionId:message.connectionId,connectionGeneration:message.connectionGeneration};authoritativePlayerId=message.playerId;connectionGeneration=message.connectionGeneration;const sequences=SwarmRemoteVisuals.resumeSequences(inputSeq,abilityInputSeq,message);inputSeq=sequences.inputSeq;abilityInputSeq=sequences.abilityInputSeq;pendingInputs=pendingInputs.filter(input=>input.seq>inputSeq);remoteVisuals.clear();enemyVisuals.clear();bulletVisuals.clear();session=getSession();return}
    if(message.type==='resumeRejected'){authoritativePlayerId=null;connectionGeneration=0;lastAppliedHelloAck=null;session=null;pendingInputs=[];remoteVisuals.clear();enemyVisuals.clear();bulletVisuals.clear();return}
    if(!getSession()||!authoritativePlayerId)return;
    if(message.type==='gameStarted'){
      document.getElementById('multiplayerWaiting').classList.add('hidden');state=null;previous=null;lastLevelRound=0;lastWaveSeq=0;
      remoteVisuals.clear();remotePlayers=[];previousEnemies.clear();enemyVisuals.clear();bulletVisuals.clear();localAttackSeq=0;localAbilitySeq=0;
      screenShake=0;rings=[];playerEchoes=[];pendingInputs=[];isDead=false;isSpectator=false;spectatorTargetId=null;deathOverlayUntil=0;hideDeathUi();renderTeamHud([]);
    }
    if(message.type==='gameState'){previous=state;state=message.state;receivedAt=performance.now();applyState()}
    if(message.type==='upgradeWaiting')document.getElementById('multiplayerWaiting').classList.remove('hidden');
    if(message.type==='levelResume'){paused=false;document.getElementById('multiplayerWaiting').classList.add('hidden')}
    if(message.type==='upgradeOffer'&&message.round===lastLevelRound){upgradeOfferKeys=message.offer.slice(0,3);upgradeRerolled.push(message.index);renderUpgradeOffer(bossChoicesQueued>0)}
    if(message.type==='upgradeAccepted'){applyAuthoritativeBuild(message);ui.levelModal.classList.add('hidden');document.getElementById('multiplayerWaiting').classList.remove('hidden')}
    if(message.type==='gameOver')showMultiplayerGameOver();
    if(message.type==='levelUp'&&!isDead&&message.round>lastLevelRound){lastLevelRound=message.round;paused=true;levelChoicesQueued=1;upgradeOfferKeys=Array.isArray(message.offer)?message.offer.slice(0,3):[];upgradeRerolled=[];showLevelUp(false)}
  }
  function applyAuthoritativeBuild(build){Object.keys(items).forEach(key=>delete items[key]);Object.assign(items,build.items||{});Object.keys(augments).forEach(key=>delete augments[key]);for(const id of build.augments||[])augments[id]=1;if(Number.isFinite(build.hp))player.hp=build.hp;if(Number.isFinite(build.stats?.maxHp))player.maxHp=build.stats.maxHp;if(Number.isFinite(build.stats?.speed))effectiveSpeed=build.stats.speed;renderSlots()}
  function hideDeathUi(){document.getElementById('multiplayerDeathOverlay')?.classList.add('hidden');document.getElementById('multiplayerSpectatorLabel')?.classList.add('hidden')}
  function showMultiplayerGameOver(){if(!running&&ui.endModal&&!ui.endModal.classList.contains('hidden'))return;running=false;paused=true;serverPaused=true;localMenuOpen=false;pendingInputs=[];spectatorTargetId=null;deathOverlayUntil=0;hideDeathUi();ui.levelModal.classList.add('hidden');ui.pauseModal.classList.add('hidden');document.getElementById('multiplayerWaiting').classList.add('hidden');ui.endTitle.textContent='KONIEC MECZU';ui.endStats.textContent='Cała drużyna została pokonana.';ui.restartBtn.textContent='WRÓĆ DO LOBBY';ui.restartBtn.onclick=()=>{socket().send('returnToLobby');state=null;previous=null;pendingInputs=[];isDead=false;isSpectator=false;serverPaused=false;renderTeamHud([]);ui.endModal.classList.add('hidden');document.getElementById('multiplayerModal').classList.remove('hidden')};ui.endModal.classList.remove('hidden')}
  function renderTeamHud(players){const hud=document.getElementById('multiplayerTeamHud');if(!hud)return;const rows=SwarmRemoteVisuals.teamHudData(players,authoritativePlayerId);hud.classList.toggle('hidden',!rows.length);hud.innerHTML=rows.map(row=>`<div class="team-member ${row.status==='DEAD'?'dead':''}"><header><b>${row.name}${row.local?' · YOU':''}</b><span>${row.status==='DEAD'?'DEAD':`${Math.ceil(row.hp)} / ${Math.ceil(row.maxHp)}`}</span></header><i><b style="width:${row.ratio*100}%"></b></i></div>`).join('')}
  function enterDeathSpectator(){pendingInputs=[];keys.w=keys.a=keys.s=keys.d=false;localMenuOpen=false;ui.levelModal.classList.add('hidden');ui.pauseModal.classList.add('hidden');document.getElementById('multiplayerWaiting').classList.add('hidden');deathOverlayUntil=performance.now()+3000;const overlay=document.getElementById('multiplayerDeathOverlay');overlay?.classList.remove('hidden');screenShake=Math.max(screenShake,5)}
  function applyState(){
    if(!state)return;
    elapsed=state.time;player.level=state.level;player.xp=state.xp;player.nextXp=state.nextXp;serverPaused=Boolean(state.paused);paused=serverPaused;if(Number.isFinite(state.serverTime)){const measured=state.serverTime-performance.now();serverOffset=serverOffset?serverOffset*.9+measured*.1:measured}if(state.ended){showMultiplayerGameOver();return}
    if(!serverPaused)document.getElementById('multiplayerWaiting').classList.add('hidden');renderTeamHud(state.players);
    if(state.wave&&state.wave.seq!==lastWaveSeq){lastWaveSeq=state.wave.seq;showWaveBanner(state.wave.title,`FAZA ${state.wave.phase+1}`)}
    for(const current of state.players){
      const old=previous?.players?.find(p=>p.id===current.id);
      if(old&&(current.abilitySeq||0)!==(old.abilitySeq||0))playMultiplayerAbilityVisual(current.character,current.lastAbility,current,old);
    }
    const classification=SwarmRemoteVisuals.classifyPlayers(state.players,authoritativePlayerId),mine=classification.local;
    if(mine){
      const wasDead=isDead;isDead=mine.alive===false;isSpectator=isDead&&state.players.some(other=>other.id!==authoritativePlayerId&&other.alive!==false);if(isDead&&!wasDead)enterDeathSpectator();if(isDead)pendingInputs=[];if(!isSpectator)spectatorTargetId=null;
      if(!isDead){pendingInputs=pendingInputs.filter(input=>input.seq>(mine.lastProcessedInputSeq||0));let targetX=mine.x,targetY=mine.y;
        for(const input of pendingInputs){const dx=(input.right?1:0)-(input.left?1:0),dy=(input.down?1:0)-(input.up?1:0),length=Math.hypot(dx,dy)||1,speed=mine.speed||effectiveSpeed||characterDefs[chosenCharacter].speed,nx=targetX+dx/length*speed/25,ny=targetY+dy/length*speed/25;if(!blocked(nx,targetY,player.r))targetX=nx;if(!blocked(targetX,ny,player.r))targetY=ny}
        const error=Math.hypot(player.x-targetX,player.y-targetY);if(error>90){player.x=targetX;player.y=targetY}else{player.x+=(targetX-player.x)*.2;player.y+=(targetY-player.y)*.2}}
      player.hp=mine.hp;player.maxHp=mine.maxHp;player.kills=mine.kills;effectiveSpeed=mine.speed||characterDefs[chosenCharacter].speed;
      if(mine.attackSeq!==localAttackSeq){localAttackSeq=mine.attackSeq;player.attackAnim=.28;player.attackAngle=mine.facing}
      if(mine.abilitySeq!==localAbilitySeq){localAbilitySeq=mine.abilitySeq;player.skillAnim=mine.lastAbility;player.skillAnimTime=mine.lastAbility==='r'?1.4:mine.lastAbility==='e'?1.1:.7}
      if(mine.cooldowns){player.serverCooldowns=mine.cooldowns}if(mine.items)applyAuthoritativeBuild(mine)
    }
    previousEnemies=new Map((previous?.enemies||[]).map(e=>[e.id,e]));
    remotePlayers=classification.remote;if(!classification.valid){authoritativePlayerId=null;pendingInputs=[];console.error('Multiplayer ownership invariant failed; input disabled.');return}SwarmRemoteVisuals.update(remoteVisuals,remotePlayers,receivedAt);
    SwarmRemoteVisuals.updateEntities(enemyVisuals,state.enemies,receivedAt);SwarmRemoteVisuals.updateEntities(bulletVisuals,state.bullets,receivedAt);
    enemies=state.enemies.map(e=>({...e,type:e.type||'melee',attackCd:1,chargeCd:1,phase:0,hit:SwarmRemoteVisuals.damageFlash(previousEnemies.get(e.id),e)}));
    bullets=state.bullets.map(b=>({...b,r:b.r||4,kind:b.kind||'scoutBullet'}));enemyBullets=(state.enemyBullets||[]).map(b=>({...b,r:b.r||6}));orbs=(state.orbs||[]).map(o=>({...o,r:5,vx:0,vy:0}));loot=state.loot||[];crates=state.crates||crates;
    const watched=isSpectator?SwarmRemoteVisuals.selectSpectatorTarget(state.players,authoritativePlayerId,mine||player,spectatorTargetId):null;if(watched)spectatorTargetId=watched.id;const cameraTarget=watched||player;camera.x=Math.max(0,Math.min(WORLD.w-W,cameraTarget.x-W/2));camera.y=Math.max(0,Math.min(WORLD.h-H,cameraTarget.y-H/2));updateUI();
  }
  function updateVisualEffects(dt){
    player.attackAnim=Math.max(0,(player.attackAnim||0)-dt);player.teleportAnim=Math.max(0,(player.teleportAnim||0)-dt);player.skillAnimTime=Math.max(0,(player.skillAnimTime||0)-dt);
    playerEchoes.forEach(e=>e.life-=dt);playerEchoes=playerEchoes.filter(e=>e.life>0);rings.forEach(r=>{r.r+=(r.max-r.r)*9*dt;r.life-=dt});rings=rings.filter(r=>r.life>0);
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.95;p.vy*=.95;p.life-=dt});particles=particles.filter(p=>p.life>0);
    screenShake*=Math.pow(.87,dt*60);if(screenShake<.05)screenShake=0;
    if(bannerTimer>0){bannerTimer-=dt;if(bannerTimer<=0)ui.waveBanner.classList.add('hidden')}
  }
  function updateCooldownUI(){for(const [key,skill]of Object.entries(skills)){const element=cooldownElements[key]||(cooldownElements[key]=document.querySelector(`[data-key="${key.toUpperCase()}"]`));if(!element)continue;element.classList.toggle('cooldown',skill.cd>0);const label=element.querySelector('.cd'),text=skill.cd>0?skill.cd.toFixed(skill.cd<10?1:0):'';if(label.textContent!==text)label.textContent=text}}
  function frame(dt){
    if(!isActive())return;updateVisualEffects(dt);sendClock-=dt;
    const gameplayEnabled=SwarmRemoteVisuals.gameplayEnabled({isDead,serverPaused,localMenuOpen}),estimatedServerNow=performance.now()+serverOffset,cooldowns=player.serverCooldowns;if(cooldowns){skills.q.cd=Math.max(0,(cooldowns.qReadyAt-estimatedServerNow)/1000);skills.e.cd=Math.max(0,(cooldowns.eReadyAt-estimatedServerNow)/1000);skills.r.cd=Math.max(0,(cooldowns.rReadyAt-estimatedServerNow)/1000);updateCooldownUI()}
    if(sendClock<=0){const aim=Math.atan2(mouse.y+camera.y-player.y,mouse.x+camera.x-player.x),neutral=!gameplayEnabled,input={up:neutral?false:!!keys.w,down:neutral?false:!!keys.s,left:neutral?false:!!keys.a,right:neutral?false:!!keys.d,aim,seq:++inputSeq};if(!isDead){pendingInputs.push(input);if(pendingInputs.length>32)pendingInputs.shift()}socket().send('playerInput',{...input,inputSeq:input.seq});sendClock=1/25}
    if(gameplayEnabled){const dx=(keys.d?1:0)-(keys.a?1:0),dy=(keys.s?1:0)-(keys.w?1:0),len=Math.hypot(dx,dy)||1,speed=effectiveSpeed||characterDefs[chosenCharacter].speed,nx=player.x+dx/len*speed*dt,ny=player.y+dy/len*speed*dt;if(!blocked(nx,player.y,player.r))player.x=nx;if(!blocked(player.x,ny,player.r))player.y=ny}
    if(state){const now=performance.now();remotePlayers=[...remoteVisuals.values()].map(visual=>SwarmRemoteVisuals.sample(visual,now,72));enemies=SwarmRemoteVisuals.sampleEntities(enemyVisuals,now).map(current=>({...current,type:current.type||'melee',attackCd:1,chargeCd:1,phase:0,hit:SwarmRemoteVisuals.damageFlash(previousEnemies.get(current.id),current)}));bullets=SwarmRemoteVisuals.sampleEntities(bulletVisuals,now).map(current=>({...current,r:current.r||4,kind:current.kind||'scoutBullet'}));if(isSpectator){const watched=SwarmRemoteVisuals.selectSpectatorTarget(remotePlayers,authoritativePlayerId,player,spectatorTargetId);if(watched){spectatorTargetId=watched.id;const targetX=Math.max(0,Math.min(WORLD.w-W,watched.x-W/2)),targetY=Math.max(0,Math.min(WORLD.h-H,watched.y-H/2));camera.x+=(targetX-camera.x)*Math.min(1,dt*8);camera.y+=(targetY-camera.y)*Math.min(1,dt*8);const label=document.getElementById('multiplayerSpectatorLabel');label.textContent=`SPECTATING: ${(watched.name||watched.character||'TEAMMATE').toUpperCase()}`;label.classList.toggle('hidden',now<deathOverlayUntil)}else spectatorTargetId=null;if(deathOverlayUntil&&now>=deathOverlayUntil){document.getElementById('multiplayerDeathOverlay')?.classList.add('hidden');deathOverlayUntil=0}}}
  }
  function levelShown(){}
  function pressAbility(ability){if(isActive()&&SwarmRemoteVisuals.gameplayEnabled({isDead,serverPaused,localMenuOpen})){const aim=Math.atan2(mouse.y+camera.y-player.y,mouse.x+camera.x-player.x);socket().send('abilityPress',{ability,aim,seq:++abilityInputSeq})}}
  function toggleLocalMenu(){localMenuOpen=!localMenuOpen;ui.pauseModal.classList.toggle('hidden',!localMenuOpen);keys.w=keys.a=keys.s=keys.d=false}
  function choiceMade(choice){if(!isActive()||isDead)return false;socket().send('upgradeChoice',{choice});return true}
  function requestReroll(index){if(isActive()&&!isDead)socket().send('rerollUpgrade',{index})}
  function drawPlayers(context){remotePlayers.filter(other=>other.alive!==false).forEach(other=>drawCharacterActor(context,{x:other.x,y:other.y,character:other.character,facing:other.facing,animation:other.animation,animationTime:other.animationTime,name:other.name||'GRACZ',hp:other.hp,maxHp:other.maxHp,attackAnim:other.attackAnim}))}
  window.SwarmMultiplayerSync={isActive,frame,pressAbility,toggleLocalMenu,levelShown,choiceMade,requestReroll,drawPlayers};
  const currentSocket=socket(),existingAck=currentSocket?.getLastHelloAck?.();if(existingAck)accept(existingAck);currentSocket?.on?.(accept);
})();
