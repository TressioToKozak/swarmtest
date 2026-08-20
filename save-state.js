(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwarmSaveState=api})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  function validNumber(value){return Number.isFinite(value)}
  function validateSingleplayerSave(value){return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&(value.mode===undefined||value.mode==='singleplayer')&&Number.isInteger(value.version)&&value.version>=3&&validNumber(value.elapsed)&&value.elapsed>=0&&value.player&&validNumber(value.player.x)&&validNumber(value.player.y)&&validNumber(value.player.hp)&&validNumber(value.player.maxHp)&&Array.isArray(value.enemies)&&Array.isArray(value.bullets)&&Array.isArray(value.orbs)&&['scout','warrior','druid'].includes(value.chosenCharacter)&&['ruins','toxic'].includes(value.chosenMap))}
  function startupFlow(multiplayerSession,save){if(multiplayerSession&&typeof multiplayerSession.code==='string'&&typeof multiplayerSession.playerId==='string')return'multiplayer-reconnect';return validateSingleplayerSave(save)?'singleplayer-continue':'fresh-menu'}
  return{validateSingleplayerSave,startupFlow}
});
