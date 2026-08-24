(function(){
  'use strict';
  const overlay=document.getElementById('accountModal'),forms=[...overlay.querySelectorAll('.account-form')],message=document.getElementById('accountMessage'),identity=document.getElementById('accountIdentity');
  let user=null,syncTimer=0,applying=false;
  function snapshot(){const progress={};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith('swarmfall-'))progress[key]=localStorage.getItem(key)}return progress}
  function showMessage(text,type='error'){message.textContent=text;message.dataset.type=type}
  function applyProgress(progress){applying=true;for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith('swarmfall-'))localStorage.removeItem(key)}for(const[key,value]of Object.entries(progress||{}))if(key.startsWith('swarmfall-')&&typeof value==='string')localStorage.setItem(key,value);applying=false}
  async function api(path,options={}){const response=await fetch(`/api/account/${path}`,{credentials:'same-origin',headers:{'content-type':'application/json'},...options});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Nie udało się połączyć z serwerem.');return data}
  async function sync(){if(!user||applying)return;try{await api('progress',{method:'PUT',body:JSON.stringify({progress:snapshot()})});identity.classList.remove('sync-error')}catch{identity.classList.add('sync-error')}}
  function scheduleSync(){if(!user||applying)return;clearTimeout(syncTimer);syncTimer=setTimeout(sync,500)}
  const nativeSet=Storage.prototype.setItem,nativeRemove=Storage.prototype.removeItem;
  Storage.prototype.setItem=function(key,value){nativeSet.call(this,key,value);if(this===localStorage&&String(key).startsWith('swarmfall-'))scheduleSync()};
  Storage.prototype.removeItem=function(key){nativeRemove.call(this,key);if(this===localStorage&&String(key).startsWith('swarmfall-'))scheduleSync()};
  function enter(data,reload=false){user=data.user;identity.querySelector('b').textContent=user.login;overlay.classList.add('hidden');document.body.classList.remove('account-locked');identity.classList.remove('hidden');const marker=`cloud:${user.login}`;if(reload||sessionStorage.getItem('swarmfall-cloud-loaded')!==marker){applyProgress(data.progress);sessionStorage.setItem('swarmfall-cloud-loaded',marker);location.reload()}}
  function switchForm(name){forms.forEach(form=>form.classList.toggle('hidden',form.dataset.form!==name));overlay.querySelectorAll('[data-account-tab]').forEach(button=>button.classList.toggle('active',button.dataset.accountTab===name));showMessage('')}
  overlay.querySelectorAll('[data-account-tab]').forEach(button=>button.onclick=()=>switchForm(button.dataset.accountTab));
  forms.forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const submit=form.querySelector('[type=submit]'),values=Object.fromEntries(new FormData(form));if(values.password.length<8)return showMessage('Hasło musi mieć minimum 8 znaków.');submit.disabled=true;showMessage('Łączenie z kontem…','info');try{const data=await api(form.dataset.form==='register'?'register':'login',{method:'POST',body:JSON.stringify(values)});enter(data,true)}catch(error){showMessage(error.message)}finally{submit.disabled=false}}));
  document.getElementById('accountLogoutBtn').onclick=async()=>{await sync();await api('logout',{method:'POST',body:'{}'}).catch(()=>{});user=null;sessionStorage.removeItem('swarmfall-cloud-loaded');location.reload()};
  window.SwarmAccount={sync,dialog(text,title='INFORMACJA'){document.getElementById('customDialogTitle').textContent=title;document.getElementById('customDialogText').textContent=text;document.getElementById('customDialog').classList.remove('hidden')}};
  document.getElementById('customDialogClose').onclick=()=>document.getElementById('customDialog').classList.add('hidden');
  addEventListener('pagehide',()=>{if(user)fetch('/api/account/progress',{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({progress:snapshot()}),keepalive:true})});
  api('me').then(data=>enter(data)).catch(()=>{document.body.classList.add('account-locked');overlay.classList.remove('hidden')});
})();
