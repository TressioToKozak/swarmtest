(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwarmEnemyLos=api})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  function stablePhase(id,interval=10){const value=String(id??'');let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}return 1+(hash>>>0)%interval}
  function shouldRefresh(enemy,interval=10){if(!Number.isFinite(enemy.losClock))enemy.losClock=stablePhase(enemy.id,interval);enemy.losClock--;if(enemy.losClock>0)return false;enemy.losClock=interval;return true}
  return{stablePhase,shouldRefresh};
});
