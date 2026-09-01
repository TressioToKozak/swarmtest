(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwarmMultiplayerStartup=api})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  function create(){let currentMatchId=null,readyMatchId=null,pending=null;return{preparing(){currentMatchId=null;readyMatchId=null;pending=null},started(matchId){if(currentMatchId!==matchId)pending=null;currentMatchId=matchId;return matchId},runtimeReady(matchId,apply){if(!matchId||matchId!==currentMatchId)return false;readyMatchId=matchId;if(pending){const latest=pending;pending=null;apply(latest)}return true},authoritative(matchId,value,apply){if(!matchId||matchId!==currentMatchId)return false;if(readyMatchId!==currentMatchId){pending=value;return true}apply(value);return true},state(){return{currentMatchId,readyMatchId,pending}}}}
  return{create};
});
