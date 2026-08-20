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
