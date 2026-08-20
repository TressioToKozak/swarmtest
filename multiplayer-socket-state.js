(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwarmSocketState=api})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const CONTROL_TYPES=new Set(['lobbyState','gameStarted','gameOver','levelUp','pauseState']);
  function createControlChannel(){
    const listeners=new Set(),control=new Map();let handshakeState='idle',lastHelloAck=null;
    function beginConnection(){handshakeState='pending';lastHelloAck=null;control.clear()}
    function publish(message){
      if(message?.type==='helloAck'){lastHelloAck={...message};handshakeState='authenticated'}
      else if(message?.type==='resumeRejected'){lastHelloAck=null;handshakeState='rejected';control.clear()}
      else if(CONTROL_TYPES.has(message?.type)){if(message.type==='gameStarted'){control.delete('gameOver');control.delete('levelUp');control.delete('pauseState')}if(message.type==='gameOver')control.delete('levelUp');if(message.type==='lobbyState'&&!message.lobby?.started){control.delete('gameStarted');control.delete('gameOver');control.delete('levelUp');control.delete('pauseState')}control.set(message.type,message)}
      listeners.forEach(listener=>listener(message));
    }
    function on(listener){listeners.add(listener);if(lastHelloAck)listener(lastHelloAck);control.forEach(message=>listener(message));return()=>listeners.delete(listener)}
    function invalidate(state='closed'){lastHelloAck=null;handshakeState=state;control.clear()}
    return{beginConnection,publish,on,invalidate,getHandshakeState:()=>handshakeState,getLastHelloAck:()=>lastHelloAck};
  }
  function shouldApplyHelloAck(previous,next){if(!next?.playerId||!next?.connectionId||!Number.isSafeInteger(next.connectionGeneration))return false;if(!previous)return true;if(next.connectionId===previous.connectionId&&next.connectionGeneration===previous.connectionGeneration)return false;return next.connectionGeneration>previous.connectionGeneration}
  const MATCH_SCOPED=new Set(['gameState','gameOver','pauseState','levelUp','levelResume','upgradeWaiting','upgradeOffer','upgradeAccepted']);
  function shouldAcceptMatchMessage(currentMatchId,message){if(!MATCH_SCOPED.has(message?.type))return true;const matchId=message.type==='gameState'?message.state?.matchId:message.matchId;return Boolean(currentMatchId&&matchId===currentMatchId)}
  return{createControlChannel,shouldApplyHelloAck,shouldAcceptMatchMessage};
});
