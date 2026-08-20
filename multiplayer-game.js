(() => {
  let session=null,state=null,previous=null,receivedAt=0,sendClock=0,lastLevelRound=0,remotePlayers=[];
  try{session=JSON.parse(sessionStorage.getItem('swarmfall-multiplayer-session')||'null')}catch{}
  const socket=()=>window.SwarmSocket;
  function getSession(){if(session)return session;try{session=JSON.parse(sessionStorage.getItem('swarmfall-multiplayer-session')||'null')}catch{}return session}
  function isActive(){return Boolean(getSession()&&running&&socket()?.isOpen())}
  function accept(message){
    if(!getSession())return;
    if(message.type==='gameState'){previous=state;state=message.state;receivedAt=performance.now();applyState()}
    if(message.type==='gameOver'){running=false;paused=true;ui.endTitle.textContent='KONIEC MECZU';ui.endStats.textContent='Cała drużyna została pokonana.';ui.restartBtn.textContent='WRÓĆ DO LOBBY';ui.restartBtn.onclick=()=>{socket().send('returnToLobby');sessionStorage.removeItem('swarmfall-multiplayer-session');setTimeout(()=>location.reload(),150)};ui.endModal.classList.remove('hidden')}
    if(message.type==='levelUp'&&message.round>lastLevelRound){lastLevelRound=message.round;paused=true;levelChoicesQueued=1;upgradeOfferKeys=Array.isArray(message.offer)?message.offer.slice(0,3):[];upgradeRerolled=[];showLevelUp(false)}
  }
  function applyState(){if(!state)return;elapsed=state.time;player.level=state.level;player.xp=state.xp;player.nextXp=state.nextXp;paused=state.paused;const mine=state.players.find(p=>p.id===session.playerId);if(mine){player.x=mine.x;player.y=mine.y;player.hp=mine.hp;player.maxHp=mine.maxHp;player.kills=mine.kills;if(mine.cooldowns){skills.q.cd=mine.cooldowns.q;skills.e.cd=mine.cooldowns.e;skills.r.cd=mine.cooldowns.r}}remotePlayers=state.players.filter(p=>p.id!==session.playerId);enemies=state.enemies.map(e=>({...e,type:'melee',hit:0,attackCd:1,chargeCd:1,phase:0}));bullets=state.bullets.map(b=>({...b,r:4,kind:'scoutBullet'}));orbs=(state.orbs||[]).map(o=>({...o,r:5,vx:0,vy:0}));loot=state.loot||[];crates=state.crates||crates;camera.x=Math.max(0,Math.min(WORLD.w-W,player.x-W/2));camera.y=Math.max(0,Math.min(WORLD.h-H,player.y-H/2));updateUI()}
  function frame(dt){if(!isActive())return;sendClock-=dt;if(sendClock<=0){const aim=Math.atan2(mouse.y+camera.y-player.y,mouse.x+camera.x-player.x);socket().send('playerInput',{up:!!keys.w,down:!!keys.s,left:!!keys.a,right:!!keys.d,aim,q:!!keys.q,e:!!keys.e,r:!!keys.r});sendClock=1/25}if(state){const alpha=Math.min(1,(performance.now()-receivedAt)/80);remotePlayers=state.players.filter(p=>p.id!==session.playerId).map(current=>{const old=previous?.players.find(p=>p.id===current.id)||current;return{...current,x:old.x+(current.x-old.x)*alpha,y:old.y+(current.y-old.y)*alpha}})}}
  function levelShown(){}
  function choiceMade(choice){if(!isActive())return false;socket().send('upgradeChoice',{choice});return true}
  function drawPlayers(context){remotePlayers.forEach(other=>{context.save();context.globalAlpha=.9;context.translate(other.x,other.y);context.fillStyle=other.character==='warrior'?'#ffc36c':other.character==='druid'?'#70ff9a':'#51f6df';context.shadowBlur=15;context.shadowColor=context.fillStyle;context.beginPath();context.arc(0,0,15,0,Math.PI*2);context.fill();context.strokeStyle='#fff';context.lineWidth=2;context.stroke();context.fillStyle='#fff';context.font='700 8px Chakra Petch';context.textAlign='center';context.fillText(other.name||'GRACZ',0,-23);context.restore()})}
  window.SwarmMultiplayerSync={isActive,frame,levelShown,choiceMade,drawPlayers};
  const wait=setInterval(()=>{if(socket()?.on){socket().on(accept);clearInterval(wait)}},50)
})();
