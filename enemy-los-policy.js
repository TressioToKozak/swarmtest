(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwarmEnemyLos=api})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  let fallbackOrdinal=0;
  function stablePhase(id,interval=10){const value=String(id);let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}return 1+(hash>>>0)%interval}
  function assignedPhase(enemy,interval=10){if(Number.isFinite(enemy.losPhase))return 1+(Math.max(0,Math.trunc(enemy.losPhase)-1)%interval);const phase=enemy.id===undefined||enemy.id===null?1+(fallbackOrdinal++%interval):stablePhase(enemy.id,interval);enemy.losPhase=phase;return phase}
  function shouldRefresh(enemy,interval=10){if(!Number.isFinite(enemy.losClock))enemy.losClock=assignedPhase(enemy,interval);enemy.losClock--;if(enemy.losClock>0)return false;enemy.losClock=interval;return true}
  function resetFallback(value=0){fallbackOrdinal=Math.max(0,Math.trunc(value)||0)}
  return{stablePhase,assignedPhase,shouldRefresh,resetFallback};
});
