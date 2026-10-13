'use strict';
(() => {
  let mode='login';
  let busy=false;
  const form=document.getElementById('auth-form');
  const errorBox=document.getElementById('auth-error');
  const submit=document.getElementById('auth-submit');
  function error(message){errorBox.textContent=message;errorBox.hidden=!message;}
  function showMode(next){
    if(busy)return;
    mode=next==='signup'?'signup':'login';const signup=mode==='signup';
    ['name-field','confirm-field','password-hint'].forEach(id=>document.getElementById(id).hidden=!signup);
    document.getElementById('auth-name').required=signup;document.getElementById('auth-confirm').required=signup;
    document.getElementById('auth-password').autocomplete=signup?'new-password':'current-password';
    document.getElementById('auth-password').value='';document.getElementById('auth-confirm').value='';
    document.getElementById('auth-password').type='password';document.getElementById('toggle-password').textContent='Show';document.getElementById('toggle-password').setAttribute('aria-label','Show password');document.getElementById('toggle-password').setAttribute('aria-pressed','false');
    document.getElementById('auth-heading').textContent=signup?'Join the clubhouse.':'Welcome back.';
    document.getElementById('auth-kicker').textContent=signup?'YOUR NEXT CHAPTER STARTS HERE.':'BACK FOR ANOTHER GAME?';
    document.getElementById('auth-subtitle').textContent=signup?'Create your player. Find your style. Make it yours.':'Your player. Your progress. Right where you left them.';
    document.getElementById('auth-submit-label').textContent=signup?'Create my account':'Log in';
    document.querySelectorAll('.auth-tabs button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.authMode===mode)));
    const switcher=document.getElementById('auth-switch');switcher.replaceChildren(document.createTextNode(signup?'Already part of the crew? ':'New to the clubhouse? '));
    const button=document.createElement('button');button.type='button';button.textContent=signup?'Log in':'Create an account';button.addEventListener('click',()=>showMode(signup?'login':'signup'));switcher.append(button);
    error('');if(location.hash!=='#'+mode)history.replaceState(null,'','#'+mode);
  }
  async function request(url,options={}){
    let response;try{response=await fetch(url,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Sideout-Request':'1',...options.headers}});}catch{throw new Error('Could not connect. Start the website server and try again.');}
    let data;try{data=await response.json();}catch{throw new Error('The account server is unavailable. Run npm start in the website folder.');}
    if(!response.ok)throw new Error(data.error||'Please try again.');return data;
  }
  document.querySelectorAll('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>showMode(button.dataset.authMode)));
  document.getElementById('toggle-password').addEventListener('click',()=>{const input=document.getElementById('auth-password');const showing=input.type==='password';input.type=showing?'text':'password';const button=document.getElementById('toggle-password');button.textContent=showing?'Hide':'Show';button.setAttribute('aria-label',showing?'Hide password':'Show password');button.setAttribute('aria-pressed',String(showing));});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!form.reportValidity())return;error('');
    const password=document.getElementById('auth-password').value;
    if(mode==='signup'&&password!==document.getElementById('auth-confirm').value){error('Your passwords do not match.');document.getElementById('auth-confirm').focus();return;}
    if(mode==='signup'&&!document.getElementById('auth-name').value.trim()){error('Enter your player name.');return;}
    busy=true;submit.disabled=true;document.getElementById('auth-submit-label').textContent=mode==='signup'?'Creating your account…':'Logging in…';
    try{await request('/api/auth/'+mode,{method:'POST',body:JSON.stringify({email:document.getElementById('auth-email').value,password,name:document.getElementById('auth-name').value})});document.getElementById('auth-password').value='';document.getElementById('auth-confirm').value='';location.replace('/#profile');location.reload();}
    catch(e){error(e.message);busy=false;submit.disabled=false;document.getElementById('auth-submit-label').textContent=mode==='signup'?'Create my account':'Log in';}
  });
  document.getElementById('logout').addEventListener('click',async()=>{const button=document.getElementById('logout');button.disabled=true;try{if(window.sideoutFlush&&!(await window.sideoutFlush()))throw new Error('Your latest changes could not be saved. Try again before logging out.');await request('/api/auth/logout',{method:'POST',body:'{}'});location.replace('/#login');location.reload();}catch(e){button.disabled=false;const toast=document.getElementById('toast');toast.textContent=e.message;toast.classList.add('visible');setTimeout(()=>toast.classList.remove('visible'),5000);}});
  const ready=(async()=>{
    let account=null;let failure='';
    try{if(location.protocol==='file:')throw new Error('Accounts need the local server. Run npm start in C:\\dev\\outputs\\sideout, then open http://127.0.0.1:3000.');const session=await request('/api/auth/session');if(session.user){const profile=await request('/api/profile');account={user:session.user,profile:profile.profile};}}
    catch(e){failure=e.message;}
    document.getElementById('auth-loader').hidden=true;document.body.classList.remove('auth-loading');document.getElementById('player-app').hidden=!account;document.getElementById('auth-view').hidden=!!account;document.getElementById('logout').hidden=!account;
    if(!account){showMode(location.hash==='#signup'?'signup':'login');if(failure){error(failure);submit.disabled=true;}}
    return account;
  })();
  window.sideoutAuth={ready,saveProfile:profile=>request('/api/profile',{method:'PUT',body:JSON.stringify(profile)})};
  window.addEventListener('hashchange',()=>{if(!document.getElementById('auth-view').hidden&&['#signup','#login'].includes(location.hash))showMode(location.hash.slice(1));});
  // A preview character does not require an account.
  const canvas=document.getElementById('auth-avatar');const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  const pixels=[[6,57,38,3,'#b9cc70'],[16,36,8,14,'#30362d'],[27,36,8,14,'#30362d'],[18,42,4,10,'#cf986c'],[29,42,4,10,'#cf986c'],[12,53,12,4,'#30362d'],[27,53,13,4,'#30362d'],[14,49,10,5,'#f5f0d7'],[27,49,11,5,'#f5f0d7'],[14,32,22,11,'#30362d'],[16,34,8,8,'#59644c'],[27,34,7,8,'#59644c'],[12,18,26,18,'#30362d'],[14,20,22,14,'#ed795d'],[10,21,6,9,'#ed795d'],[36,21,6,9,'#ed795d'],[8,28,7,12,'#30362d'],[10,28,4,11,'#cf986c'],[37,28,7,11,'#30362d'],[38,28,5,9,'#cf986c'],[19,20,12,3,'#f1e9ce'],[25,26,4,4,'#f6edcf'],[21,15,8,6,'#30362d'],[22,16,6,5,'#cf986c'],[16,2,18,16,'#30362d'],[18,4,14,12,'#cf986c'],[14,8,4,5,'#cf986c'],[32,8,4,5,'#cf986c'],[19,4,12,3,'#574134'],[21,9,2,2,'#30362d'],[28,9,2,2,'#30362d'],[24,13,4,1,'#835b43'],[16,1,18,4,'#f1ecd5'],[18,-1,14,3,'#f1ecd5'],[28,4,12,2,'#f1ecd5'],[23,1,3,2,'#ed795d'],[42,35,3,13,'#755642'],[38,25,11,12,'#30362d'],[36,27,15,8,'#30362d'],[38,26,11,10,'#7286bb'],[37,28,13,6,'#7286bb'],[40,28,2,6,'#a6bce0']];
  ctx.save();ctx.translate(98,12);ctx.scale(5.4,5.4);for(const [x,y,w,h,color]of pixels){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}ctx.restore();
})();
