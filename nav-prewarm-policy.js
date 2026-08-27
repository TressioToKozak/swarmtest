(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwarmNavPrewarm=api})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  function canBuild({running,paused,deadline,minBudget=12}){if(!running||paused)return true;if(deadline?.didTimeout)return false;return Number(deadline?.timeRemaining?.())>=minBudget}
  return{canBuild}
});
