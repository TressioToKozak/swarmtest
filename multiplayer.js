(() => {
  const STORAGE_KEY='swarmfall-multiplayer-lobbies',LOBBY_TTL=30000,MAX_PLAYERS=4,alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const byId=id=>document.getElementById(id),modal=byId('multiplayerModal'),actions=byId('multiplayerActions'),joinForm=byId('joinLobbyForm'),codeInput=byId('lobbyCodeInput'),message=byId('lobbyMessage'),room=byId('lobbyRoom'),readyBtn=byId('lobbyReadyBtn'),startBtn=byId('lobbyStartBtn');
  const sessionId=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,channel='BroadcastChannel'in window?new BroadcastChannel('swarmfall-lobbies'):null;
  let currentCode='',isHost=false,gameStarting=false;
  const readLobbies=()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{return{}}};
  function writeLobbies(lobbies){localStorage.setItem(STORAGE_KEY,JSON.stringify(lobbies));channel?.postMessage('update')}
  function removeExpired(lobbies){const now=Date.now();for(const[code,lobby]of Object.entries(lobbies))if(!lobby.updatedAt||now-lobby.updatedAt>LOBBY_TTL)delete lobbies[code];return lobbies}
  function randomCode(){let code='';for(let i=0;i<6;i++)code+=alphabet[Math.floor(Math.random()*alphabet.length)];return code}
  function unlockedCharacters(){try{return new Set(['scout',...JSON.parse(localStorage.getItem('swarmfall-unlocked')||'[]')])}catch{return new Set(['scout'])}}
  function characterName(id){return{scout:'Zwiadowca',warrior:'Wojownik',druid:'Druid'}[id]||id}
  function mapName(id){return id==='toxic'?'Toksyczne pustkowie':'Zalane ruiny'}
  function copyLobbyPreviews(){
    byId('lobbyMapPicker').querySelectorAll('canvas[data-map-preview]').forEach(canvas=>{const source=byId(canvas.dataset.mapPreview==='toxic'?'toxicMapPreview':'mapPreviewCanvas'),context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0,canvas.width,canvas.height)});
    byId('lobbyCharacterPicker').querySelectorAll('canvas[data-character-preview]').forEach(canvas=>{const source=byId(`${canvas.dataset.characterPreview}Preview`),context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0,canvas.width,canvas.height)})
  }
  function setView(view){actions.classList.toggle('hidden',view!=='actions');joinForm.classList.toggle('hidden',view!=='join');room.classList.toggle('hidden',view!=='room');message.textContent='';message.className='lobby-message'}
  function currentPlayer(lobby){return lobby?.players.find(player=>player.id===sessionId)}
  function updateLobby(change){if(!currentCode)return;const lobbies=readLobbies(),lobby=lobbies[currentCode];if(!lobby)return;change(lobby);lobby.updatedAt=Date.now();writeLobbies(lobbies);renderRoom()}
  function renderPickers(lobby,me){
    const mapIds=['ruins',...(window.Achievements?.isComplete('map_1')?['toxic']:[])];
    byId('lobbyMapPicker').classList.toggle('guest-picker',!isHost);
    byId('lobbyMapPicker').querySelector('div').innerHTML=(isHost?mapIds:[lobby.map]).map(id=>`<button type="button" data-lobby-map="${id}" class="visual-pick map-pick ${id} ${lobby.map===id?'selected':''}" ${isHost?'':'disabled'}><canvas class="pick-preview" data-map-preview="${id}" width="320" height="150"></canvas><b>${mapName(id)}</b><small>${id==='toxic'?'MGŁA · TRUCIZNA':'WODA · RUINY'}</small></button>`).join('');
    byId('lobbyMapPicker').querySelectorAll('[data-lobby-map]').forEach(button=>button.onclick=()=>updateLobby(value=>{value.map=button.dataset.lobbyMap;value.players.forEach(player=>{if(!player.host)player.ready=false})}));
    byId('lobbyCharacterPicker').querySelector('div').innerHTML=[...unlockedCharacters()].map(id=>`<button type="button" data-lobby-character="${id}" class="visual-pick character-pick ${id} ${me.character===id?'selected':''}"><canvas class="pick-preview" data-character-preview="${id}" width="320" height="150"></canvas><b>${characterName(id)}</b><small>${id==='warrior'?'WALKA WRĘCZ':id==='druid'?'WSPARCIE':'DYSTANS'}</small></button>`).join('');
    byId('lobbyCharacterPicker').querySelectorAll('[data-lobby-character]').forEach(button=>button.onclick=()=>updateLobby(value=>{const player=currentPlayer(value);player.character=button.dataset.lobbyCharacter;if(!player.host)player.ready=false}));copyLobbyPreviews();
  }
  function launchGame(lobby){if(gameStarting)return;gameStarting=true;sessionStorage.setItem('swarmfall-lobby-map',lobby.map);sessionStorage.setItem('swarmfall-multiplayer-session',JSON.stringify({code:currentCode,playerId:sessionId,host:isHost}));localStorage.setItem('swarmfall-map',lobby.map);localStorage.setItem('swarmfall-character',currentPlayer(lobby)?.character||'scout');currentCode='';modal.classList.add('hidden');byId('startBtn').click()}
  function renderRoom(){
    if(!currentCode)return;const lobby=readLobbies()[currentCode];
    if(!lobby){currentCode='';isHost=false;setView('join');message.textContent='Lobby zostało zamknięte.';message.classList.add('error');return}
    if(lobby.startedAt){launchGame(lobby);return}const me=currentPlayer(lobby);if(!me)return;
    byId('activeLobbyCode').textContent=currentCode;byId('lobbyRole').textContent=isHost?'TWOJE LOBBY':'DOŁĄCZONO DO LOBBY';byId('lobbyPlayerCount').textContent=`${lobby.players.length} / ${MAX_PLAYERS}`;
    byId('lobbyPlayerList').innerHTML=lobby.players.map(player=>`<li><i class="${player.ready||player.host?'ready':''}"></i><span>${player.name}<small>${characterName(player.character)}</small></span><b>${player.host?'GOSPODARZ':player.ready?'GOTOWY':'OCZEKUJE'}</b></li>`).join('');
    renderPickers(lobby,me);readyBtn.classList.toggle('hidden',isHost);readyBtn.classList.toggle('selected',me.ready);readyBtn.textContent=me.ready?'ANULUJ GOTOWOŚĆ':'GOTOWY';startBtn.classList.toggle('hidden',!isHost);startBtn.disabled=!lobby.players.filter(player=>!player.host).every(player=>player.ready)
  }
  function leaveLobby(notify=true){if(!currentCode)return;const lobbies=readLobbies(),lobby=lobbies[currentCode];if(lobby){if(isHost)delete lobbies[currentCode];else lobby.players=lobby.players.filter(player=>player.id!==sessionId);if(notify)writeLobbies(lobbies);else localStorage.setItem(STORAGE_KEY,JSON.stringify(lobbies))}currentCode='';isHost=false}
  function createLobby(){leaveLobby();const lobbies=removeExpired(readLobbies());let code=randomCode();while(lobbies[code])code=randomCode();const character=localStorage.getItem('swarmfall-character')||'scout';lobbies[code]={updatedAt:Date.now(),map:'ruins',players:[{id:sessionId,name:'Gospodarz',host:true,ready:true,character}]};currentCode=code;isHost=true;writeLobbies(lobbies);setView('room');renderRoom()}
  function joinLobby(code){if(currentCode)return'Jesteś już w lobby.';const lobbies=removeExpired(readLobbies()),lobby=lobbies[code];if(!lobby)return'Nie znaleziono aktywnego lobby o tym kodzie.';if(lobby.players.some(player=>player.id===sessionId))return'Jesteś już w tym lobby.';if(lobby.players.length>=MAX_PLAYERS)return'To lobby jest już pełne.';const selected=localStorage.getItem('swarmfall-character')||'scout',character=unlockedCharacters().has(selected)?selected:'scout';lobby.players.push({id:sessionId,name:`Gracz ${sessionId.slice(0,4).toUpperCase()}`,host:false,ready:false,character});lobby.updatedAt=Date.now();currentCode=code;writeLobbies(lobbies);setView('room');renderRoom();return''}
  byId('multiplayerBtn').onclick=()=>{byId('startModal').classList.add('hidden');modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');setView(currentCode?'room':'actions');renderRoom()};
  byId('showJoinLobbyBtn').onclick=()=>{setView('join');codeInput.focus()};byId('createLobbyBtn').onclick=createLobby;
  joinForm.onsubmit=event=>{event.preventDefault();const code=codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g,'');codeInput.value=code;const error=code.length===6?joinLobby(code):'Kod lobby musi mieć 6 znaków.';if(error){message.textContent=error;message.classList.add('error')}};
  codeInput.oninput=()=>{codeInput.value=codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g,'')};
  byId('copyLobbyCodeBtn').onclick=async event=>{await navigator.clipboard?.writeText(currentCode);event.currentTarget.textContent='SKOPIOWANO ✓';setTimeout(()=>event.currentTarget.textContent='KOPIUJ KOD',1400)};
  readyBtn.onclick=()=>updateLobby(lobby=>{const me=currentPlayer(lobby);if(!me.host)me.ready=!me.ready});
  startBtn.onclick=()=>updateLobby(lobby=>{if(lobby.players.filter(player=>!player.host).every(player=>player.ready))lobby.startedAt=Date.now()});
  byId('multiplayerBackBtn').onclick=()=>{leaveLobby();modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');byId('startModal').classList.remove('hidden');setView('actions')};
  channel?.addEventListener('message',renderRoom);addEventListener('storage',event=>{if(event.key===STORAGE_KEY)renderRoom()});addEventListener('beforeunload',()=>leaveLobby(false));
  setInterval(()=>{if(!currentCode)return;const lobbies=readLobbies();if(isHost&&lobbies[currentCode]){lobbies[currentCode].updatedAt=Date.now();writeLobbies(lobbies)}else renderRoom()},3000)
})();
