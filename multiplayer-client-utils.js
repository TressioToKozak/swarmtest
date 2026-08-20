(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwarmClientUtils=api})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  function smoothRtt(previous,sample,weight=.2){return Number.isFinite(previous)?previous*(1-weight)+sample*weight:sample}
  function pingQuality(ms){return ms<60?'good':ms<=120?'medium':'bad'}
  function reconcilePosition(current,authoritative,snapDistance=120,alpha=.22){const error=Math.hypot(current.x-authoritative.x,current.y-authoritative.y);return error>snapDistance?{...authoritative,snapped:true}:{x:current.x+(authoritative.x-current.x)*alpha,y:current.y+(authoritative.y-current.y)*alpha,snapped:false}}
  async function copyLobbyCode(code,{clipboard,document,setTimeout=globalThis.setTimeout}={}){let copied=false;try{if(!clipboard?.writeText)throw new Error('clipboard unavailable');await clipboard.writeText(code);copied=true}catch{const area=document?.createElement?.('textarea');if(area){area.value=code;area.setAttribute?.('readonly','');area.style.position='fixed';area.style.opacity='0';document.body?.appendChild(area);area.select?.();try{copied=document.execCommand?.('copy')===true}catch{}area.remove?.()}}return copied}
  return{smoothRtt,pingQuality,reconcilePosition,copyLobbyCode}
});
