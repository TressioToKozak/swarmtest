(() => {
  const STORAGE_KEY = 'swarmfall-multiplayer-lobbies';
  const LOBBY_TTL = 30000;
  const MAX_PLAYERS = 4;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const modal = document.getElementById('multiplayerModal');
  const actions = document.getElementById('multiplayerActions');
  const joinForm = document.getElementById('joinLobbyForm');
  const codeInput = document.getElementById('lobbyCodeInput');
  const message = document.getElementById('lobbyMessage');
  const room = document.getElementById('lobbyRoom');
  const sessionId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('swarmfall-lobbies') : null;
  let currentCode = '';
  let isHost = false;

  function readLobbies() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function writeLobbies(lobbies) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lobbies));
    channel?.postMessage('update');
  }

  function removeExpired(lobbies) {
    const now = Date.now();
    for (const [code, lobby] of Object.entries(lobbies)) {
      if (!lobby.updatedAt || now - lobby.updatedAt > LOBBY_TTL) delete lobbies[code];
    }
    return lobbies;
  }

  function randomCode() {
    let code = '';
    for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    return code;
  }

  function setView(view) {
    actions.classList.toggle('hidden', view !== 'actions');
    joinForm.classList.toggle('hidden', view !== 'join');
    room.classList.toggle('hidden', view !== 'room');
    message.textContent = '';
    message.className = 'lobby-message';
  }

  function renderRoom() {
    if (!currentCode) return;
    const lobby = readLobbies()[currentCode];
    if (!lobby) {
      currentCode = '';
      isHost = false;
      setView('join');
      message.textContent = 'Lobby zostało zamknięte.';
      message.classList.add('error');
      return;
    }
    document.getElementById('activeLobbyCode').textContent = currentCode;
    document.getElementById('lobbyRole').textContent = isHost ? 'TWOJE LOBBY' : 'DOŁĄCZONO DO LOBBY';
    document.getElementById('lobbyPlayerCount').textContent = `${lobby.players.length} / ${MAX_PLAYERS}`;
    document.getElementById('lobbyPlayerList').innerHTML = lobby.players.map(player => `<li><i></i><span>${player.name}</span><b>${player.host ? 'GOSPODARZ' : 'GOTOWY'}</b></li>`).join('');
  }

  function leaveLobby(notify = true) {
    if (!currentCode) return;
    const lobbies = readLobbies();
    const lobby = lobbies[currentCode];
    if (lobby) {
      if (isHost) delete lobbies[currentCode];
      else lobby.players = lobby.players.filter(player => player.id !== sessionId);
      if (notify) writeLobbies(lobbies); else localStorage.setItem(STORAGE_KEY, JSON.stringify(lobbies));
    }
    currentCode = '';
    isHost = false;
  }

  function createLobby() {
    leaveLobby();
    const lobbies = removeExpired(readLobbies());
    let code = randomCode();
    while (lobbies[code]) code = randomCode();
    lobbies[code] = { updatedAt: Date.now(), players: [{ id: sessionId, name: 'Gospodarz', host: true }] };
    currentCode = code;
    isHost = true;
    writeLobbies(lobbies);
    setView('room');
    renderRoom();
  }

  function joinLobby(code) {
    const lobbies = removeExpired(readLobbies());
    const lobby = lobbies[code];
    if (!lobby) return 'Nie znaleziono aktywnego lobby o tym kodzie.';
    if (lobby.players.length >= MAX_PLAYERS) return 'To lobby jest już pełne.';
    leaveLobby();
    lobby.players.push({ id: sessionId, name: `Gracz ${sessionId.slice(0, 4).toUpperCase()}`, host: false });
    lobby.updatedAt = Date.now();
    currentCode = code;
    writeLobbies(lobbies);
    setView('room');
    renderRoom();
    return '';
  }

  document.getElementById('multiplayerBtn').addEventListener('click', () => {
    document.getElementById('startModal').classList.add('hidden');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    setView(currentCode ? 'room' : 'actions');
    renderRoom();
  });
  document.getElementById('showJoinLobbyBtn').addEventListener('click', () => { setView('join'); codeInput.focus(); });
  document.getElementById('createLobbyBtn').addEventListener('click', createLobby);
  joinForm.addEventListener('submit', event => {
    event.preventDefault();
    const code = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    codeInput.value = code;
    const error = code.length === 6 ? joinLobby(code) : 'Kod lobby musi mieć 6 znaków.';
    if (error) { message.textContent = error; message.classList.add('error'); }
  });
  codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  document.getElementById('copyLobbyCodeBtn').addEventListener('click', async event => {
    await navigator.clipboard?.writeText(currentCode);
    event.currentTarget.textContent = 'SKOPIOWANO ✓';
    setTimeout(() => { event.currentTarget.textContent = 'KOPIUJ KOD'; }, 1400);
  });
  document.getElementById('multiplayerBackBtn').addEventListener('click', () => {
    leaveLobby();
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.getElementById('startModal').classList.remove('hidden');
    setView('actions');
  });

  channel?.addEventListener('message', renderRoom);
  addEventListener('storage', event => { if (event.key === STORAGE_KEY) renderRoom(); });
  addEventListener('beforeunload', () => leaveLobby(false));
  setInterval(() => {
    if (!currentCode) return;
    const lobbies = readLobbies();
    if (isHost && lobbies[currentCode]) {
      lobbies[currentCode].updatedAt = Date.now();
      writeLobbies(lobbies);
    } else renderRoom();
  }, 5000);
})();
