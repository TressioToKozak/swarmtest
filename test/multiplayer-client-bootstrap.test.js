const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('multiplayer client binds menu controls without requiring crypto.randomUUID',()=>{
  const source=fs.readFileSync(require.resolve('../multiplayer.js'),'utf8');
  const elements=new Map();
  const element=id=>elements.get(id)||elements.set(id,{
    id,classList:{add(){},remove(){},toggle(){}},querySelector(){return{innerHTML:''}},querySelectorAll(){return[]},
    focus(){},click(){},textContent:'',className:'',value:'',disabled:false
  }).get(id);
  class FakeSocket{static OPEN=1;constructor(){this.readyState=0}}
  const context={
    window:{},document:{getElementById:element},localStorage:{getItem(){return null},setItem(){}},
    sessionStorage:{getItem(){return null},setItem(){},removeItem(){}},crypto:{getRandomValues(bytes){bytes.fill(7);return bytes}},Uint8Array,
    location:{protocol:'http:',host:'localhost'},WebSocket:FakeSocket,setTimeout(){},console,
    SwarmSocketState:{createControlChannel:()=>({on(){},beginConnection(){},publish(){},invalidate(){},getHandshakeState:()=> 'pending',getLastHelloAck:()=>null})}
  };
  vm.runInNewContext(source,context,{filename:'multiplayer.js'});
  assert.equal(typeof context.window.SwarmSocket.on,'function');
  assert.equal(typeof context.window.SwarmSocket.send,'function');
  assert.equal(typeof element('multiplayerBtn').onclick,'function');
  assert.equal(typeof element('createLobbyBtn').onclick,'function');
  element('multiplayerBtn').onclick();
});

test('late callbacks from a replaced browser socket cannot invalidate or publish control state',()=>{
  const source=fs.readFileSync(require.resolve('../multiplayer.js'),'utf8'),elements=new Map(),timers=[],sockets=[],published=[];
  const element=id=>elements.get(id)||elements.set(id,{id,classList:{add(){},remove(){},toggle(){}},querySelector(){return{innerHTML:''}},querySelectorAll(){return[]},focus(){},click(){},textContent:'',className:'',value:'',disabled:false}).get(id);
  class FakeSocket{static OPEN=1;constructor(){this.readyState=0;sockets.push(this)}send(payload){this.sent=JSON.parse(payload)}close(){this.readyState=3}}
  let handshake='idle',invalidations=0;
  const channel={on(){},beginConnection(){handshake='pending'},publish(message){published.push(message.type);if(message.type==='helloAck')handshake='authenticated'},invalidate(){invalidations++;handshake='closed'},getHandshakeState:()=>handshake,getLastHelloAck:()=>null};
  const context={window:{Achievements:{isComplete:()=>false}},document:{getElementById:element},localStorage:{getItem(){return null},setItem(){}},sessionStorage:{getItem(){return null},setItem(){},removeItem(){}},crypto:{getRandomValues(bytes){bytes.fill(3);return bytes}},Uint8Array,location:{protocol:'http:',host:'localhost'},WebSocket:FakeSocket,setTimeout(fn){timers.push(fn)},console,SwarmSocketState:{createControlChannel:()=>channel}};
  vm.runInNewContext(source,context,{filename:'multiplayer.js'});
  const a=sockets[0];a.readyState=1;a.onopen();a.onclose({code:1006});timers.shift()();
  const b=sockets[1];b.readyState=1;b.onopen();b.onmessage({data:JSON.stringify({type:'helloAck',playerId:'p',reconnectToken:'t',connectionId:'b',connectionGeneration:2})});
  const before=[...published];a.onmessage({data:JSON.stringify({type:'pauseState',paused:true,pauseReason:'manual'})});a.onclose({code:1006});
  assert.equal(context.window.SwarmSocket.isOpen(),true);assert.equal(handshake,'authenticated');assert.equal(invalidations,1);assert.deepEqual(published,before);
  b.onmessage({data:JSON.stringify({type:'leftLobby'})});b.onclose({code:1006});timers.shift()();const c=sockets[2];c.readyState=1;c.onopen();assert.equal(c.sent.resume,undefined);c.onmessage({data:JSON.stringify({type:'helloAck',playerId:'fresh',reconnectToken:'fresh-token',connectionId:'c',connectionGeneration:1})});element('createLobbyBtn').onclick();assert.equal(c.sent.type,'createLobby');
});

test('pending reconnect beyond twelve seconds never exposes the singleplayer menu while reconnect remains live',()=>{
  const source=fs.readFileSync(require.resolve('../multiplayer.js'),'utf8'),elements=new Map(),timers=[],published=[];
  const element=id=>elements.get(id)||elements.set(id,{id,classList:{added:[],removed:[],add(v){this.added.push(v)},remove(v){this.removed.push(v)},toggle(){}},querySelector(){return{innerHTML:''}},querySelectorAll(){return[]},focus(){},click(){},textContent:'',className:'',value:'',disabled:false}).get(id);
  class FakeSocket{static OPEN=1;constructor(){this.readyState=0}send(){}close(){}}
  const stored=JSON.stringify({lobbyCode:'ABC234',playerId:'p',reconnectToken:'token'}),channel={on(){},beginConnection(){},publish(m){published.push(m.type)},invalidate(){},getHandshakeState:()=>'pending',getLastHelloAck:()=>null};
  const context={window:{Achievements:{isComplete:()=>false}},document:{getElementById:element},localStorage:{getItem(){return null},setItem(){}},sessionStorage:{getItem(key){return key==='swarmfall-multiplayer-session'?stored:null},setItem(){},removeItem(){throw new Error('active reconnect session must not be discarded')}},crypto:{getRandomValues(b){return b.fill(1)}},Uint8Array,location:{protocol:'http:',host:'localhost'},WebSocket:FakeSocket,setTimeout(fn,delay){timers.push({fn,delay})},console,SwarmSocketState:{createControlChannel:()=>channel}};
  vm.runInNewContext(source,context,{filename:'multiplayer.js'});assert.equal(timers.some(timer=>timer.delay===12000),false);assert.deepEqual(element('startModal').classList.removed,[]);assert.equal(published.includes('gameStarted'),false);
});

test('multiplayer picker uses only server-published dynamic entitlements',()=>{const source=fs.readFileSync(require.resolve('../multiplayer.js'),'utf8');assert.doesNotMatch(source,/Achievements\.isComplete|swarmfall-unlocked/);assert.match(source,/data\.entitlements\)entitlements=data\.entitlements/);assert.match(source,/data\.type==='entitlementState'/);assert.match(source,/entitlements\.maps/);assert.match(source,/entitlements\.unlocked/);assert.match(source,/send\('refreshEntitlements'\)/)});

test('solo prepared launch exposes a visible retry state and logs the real bootstrap error',async()=>{
  const source=fs.readFileSync(require.resolve('../multiplayer.js'),'utf8'),elements=new Map(),sockets=[],errors=[];
  const element=id=>elements.get(id)||elements.set(id,{id,classList:{values:new Set(['hidden']),add(value){this.values.add(value)},remove(value){this.values.delete(value)},toggle(value,force){if(force===undefined?this.values.has(value):!force)this.values.delete(value);else this.values.add(value)}},setAttribute(name,value){this[name]=value},querySelector(){return{innerHTML:''}},querySelectorAll(){return[]},focus(){},textContent:'',className:'',value:'',disabled:false,style:{}}).get(id);
  class FakeSocket{static OPEN=1;constructor(){this.readyState=0;sockets.push(this)}send(payload){this.sent=JSON.parse(payload)}close(){}}
  const published=[],channel={on(){},beginConnection(){},publish(message){published.push(message.type)},invalidate(){},getHandshakeState:()=> 'authenticated',getLastHelloAck:()=>null},context={window:{SwarmGameStart:{multiplayerPrepared(){throw new ReferenceError('bootstrap failed')},multiplayer(){throw new ReferenceError('bootstrap failed')}}},document:{getElementById:element},localStorage:{getItem(){return null},setItem(){}},sessionStorage:{getItem(){return null},setItem(){},removeItem(){}},crypto:{getRandomValues(bytes){return bytes.fill(4)}},Uint8Array,location:{protocol:'http:',host:'localhost'},WebSocket:FakeSocket,setTimeout(){},setInterval(){},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail}},dispatchEvent(){},console:{error(...args){errors.push(args)},debug(){}},SwarmAssets:{waitForRequired:async(spec,options)=>{options.onProgress({progress:1});return spec},retryFailed:async()=>{}},SwarmSocketState:{createControlChannel:()=>channel},SwarmClientUtils:{createClockSync:()=>({observe(){},estimatedServerNow(){},getOffset(){}})}};
  context.globalThis=context;vm.runInNewContext(source,context,{filename:'multiplayer.js'});const socket=sockets[0];socket.readyState=1;socket.onopen();socket.onmessage({data:JSON.stringify({type:'helloAck',playerId:'p',reconnectToken:'token',connectionId:'c',connectionGeneration:1,lobbyCode:'ABC234'})});const lobby={code:'ABC234',map:'ruins',players:[{id:'p',host:true,ready:true,character:'scout'}]};socket.onmessage({data:JSON.stringify({type:'gamePreparing',lobby,matchId:'match-1'})});await new Promise(resolve=>setImmediate(resolve));assert.equal(socket.sent.type,'assetsReady');socket.onmessage({data:JSON.stringify({type:'assetsReadyState',matchId:'match-1',ready:1,required:1})});socket.onmessage({data:JSON.stringify({type:'gameStarted',lobby:{...lobby,started:true},matchId:'match-1'})});assert.equal(errors.length,1);assert.match(String(errors[0][0]),/Multiplayer launch failed/);assert.equal(element('assetLoading').classList.values.has('hidden'),false);assert.equal(element('assetLoading')['aria-busy'],'false');assert.equal(element('assetLoadingRetry').classList.values.has('hidden'),false);assert.equal(typeof element('assetLoadingRetry').onclick,'function');assert.ok(published.includes('gameStarted'));
});
