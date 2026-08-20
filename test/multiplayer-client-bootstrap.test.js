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
