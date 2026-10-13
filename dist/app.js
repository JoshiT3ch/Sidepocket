'use strict';
(async () => {
const account=await window.sideoutAuth.ready;
if(!account)return;
const defaults = {name:account.user.name,skin:'#cf986c',shirt:'#ed795d',paddle:'#7286bb',hat:'cap',height:170,bodyType:'regular',characterType:'male',avatarCreated:false,rating:1200,games:0,wins:0,history:[]};
const colors = {skin:[['#f1c49b','Light'],['#cf986c','Tan'],['#a96c4b','Warm'],['#704630','Deep']],shirt:[['#ed795d','Coral'],['#a6bce0','Sky'],['#ede8cd','Cream'],['#8da65d','Moss'],['#b59fc6','Lilac']],paddle:[['#7286bb','Blue'],['#ed795d','Coral'],['#d2e48e','Lime'],['#8f709d','Purple']]};
const hats = [['none','No hat'],['cap','Cap'],['headband','Headband']];
let state = {...defaults,history:[]};
try {const saved=account.profile;if(saved && typeof saved==='object'){state.name=typeof saved.name==='string' ? saved.name.slice(0,24) : defaults.name;for(const key of Object.keys(colors))if(colors[key].some(([hex])=>hex===saved[key]))state[key]=saved[key];if(hats.some(([value])=>value===saved.hat))state.hat=saved.hat;if(Number.isInteger(saved.rating)&&saved.rating>=100&&saved.rating<=5000&&Number.isInteger(saved.games)&&saved.games>=0&&Number.isInteger(saved.wins)&&saved.wins>=0&&saved.wins<=saved.games){state.rating=saved.rating;state.games=saved.games;state.wins=saved.wins;state.history=Array.isArray(saved.history)?saved.history.filter(x=>x&&typeof x.win==='boolean'&&Number.isInteger(x.opponent)&&Number.isInteger(x.delta)&&Number.isInteger(x.after)).slice(0,20):[];}}}catch(e){}
if(Number.isInteger(account.profile.height)&&account.profile.height>=120&&account.profile.height<=220)state.height=account.profile.height;
if(['lean','regular','broad'].includes(account.profile.bodyType))state.bodyType=account.profile.bodyType;
if(['male','female'].includes(account.profile.characterType))state.characterType=account.profile.characterType;
state.avatarCreated=account.profile.avatarCreated===true;
const characterLabels={male:'Male',female:'Female'};
const bodyLabels={lean:'Lean',regular:'Regular',broad:'Broad'};
let toastTimer;
function toast(message){const element=document.getElementById('toast');element.textContent=message;element.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>element.classList.remove('visible'),2600);}
let saveQueue=Promise.resolve(true);
function persist(){const snapshot=structuredClone(state);snapshot.name=snapshot.name.trim()||defaults.name;saveQueue=saveQueue.then(()=>window.sideoutAuth.saveProfile(snapshot)).then(()=>true).catch(error=>{toast(error.message+' Your latest changes have not been saved.');return false;});return saveQueue;}
window.sideoutFlush=()=>saveQueue;
function rank(){return state.games<5?'Finding your level':'Placement complete';}
function rect(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function drawPlayer(ctx,cx,cy,scale){
  const heightFactor=0.78+(state.height-120)*0.0044;
  const widthFactor={lean:0.82,regular:1,broad:1.2}[state.bodyType];
  ctx.save();ctx.translate(cx-24*scale*widthFactor,cy-58*scale*heightFactor);ctx.scale(scale*widthFactor,scale*heightFactor);ctx.imageSmoothingEnabled=false;
  const outline='#30362d',skin=state.skin,shirt=state.shirt;
  const female=state.characterType==='female';
  const hair='#574134';
  // Each rectangle is a pixel block. One reusable character powers the profile and export.
  rect(ctx,6,57,38,3,'#9aaf62');rect(ctx,11,59,29,2,'#a9bf6b');
  if(female){
    // Ponytail sits behind the head and shoulders, including under a cap.
    rect(ctx,33,6,7,7,hair);rect(ctx,36,11,7,9,hair);rect(ctx,38,20,4,5,hair);rect(ctx,35,9,4,3,shirt);
  }
  rect(ctx,16,36,8,14,outline);rect(ctx,27,36,8,14,outline);
  rect(ctx,18,42,4,10,skin);rect(ctx,29,42,4,10,skin);
  rect(ctx,14,49,10,7,'#f5f0d7');rect(ctx,27,49,11,7,'#f5f0d7');
  rect(ctx,12,53,12,4,outline);rect(ctx,27,53,13,4,outline);
  rect(ctx,16,51,6,2,'#8da65d');rect(ctx,29,51,6,2,'#8da65d');
  rect(ctx,14,32,22,11,outline);rect(ctx,16,34,8,8,'#59644c');rect(ctx,27,34,7,8,'#59644c');
  if(female){rect(ctx,13,18,24,10,outline);rect(ctx,15,27,20,9,outline);rect(ctx,15,20,20,8,shirt);rect(ctx,17,27,16,8,shirt);}
  else{rect(ctx,12,18,26,18,outline);rect(ctx,14,20,22,14,shirt);}
  rect(ctx,10,21,6,9,shirt);rect(ctx,36,21,6,9,shirt);
  rect(ctx,8,28,7,12,outline);rect(ctx,10,28,4,11,skin);
  rect(ctx,37,28,7,11,outline);rect(ctx,38,28,5,9,skin);
  if(female){rect(ctx,19,20,12,1,'#f1e9ce');rect(ctx,21,21,8,1,'#f1e9ce');rect(ctx,23,22,4,1,'#f1e9ce');}
  else{rect(ctx,19,20,12,3,'#f1e9ce');rect(ctx,22,23,6,2,shirt);}
  rect(ctx,25,26,4,4,'#f6edcf');rect(ctx,female?17:14,33,female?16:22,2,'#e7e5c9');
  rect(ctx,21,15,8,6,outline);rect(ctx,22,16,6,5,skin);
  rect(ctx,16,2,18,16,outline);rect(ctx,18,4,14,12,skin);
  rect(ctx,14,8,4,5,skin);rect(ctx,32,8,4,5,skin);
  rect(ctx,19,4,12,3,hair);rect(ctx,17,5,3,female?10:5,hair);rect(ctx,30,5,3,female?10:5,hair);
  if(female){rect(ctx,16,11,2,7,hair);rect(ctx,32,11,2,7,hair);}
  rect(ctx,21,9,2,2,outline);rect(ctx,28,9,2,2,outline);rect(ctx,24,13,4,1,'#835b43');
  if(state.hat==='cap'){rect(ctx,16,1,18,4,'#f1ecd5');rect(ctx,18,-1,14,3,'#f1ecd5');rect(ctx,28,4,12,2,'#f1ecd5');rect(ctx,17,4,15,1,'#bebba2');rect(ctx,23,1,3,2,shirt);}
  if(state.hat==='headband'){rect(ctx,16,6,18,3,'#eee9d2');rect(ctx,33,7,4,2,'#eee9d2');rect(ctx,35,9,2,4,'#eee9d2');}
  rect(ctx,42,35,3,13,outline);rect(ctx,42,36,3,11,'#755642');
  rect(ctx,38,25,11,12,outline);rect(ctx,36,27,15,8,outline);rect(ctx,38,26,11,10,state.paddle);rect(ctx,37,28,13,6,state.paddle);
  rect(ctx,40,28,2,6,'#ffffff45');rect(ctx,44,28,2,2,'#ffffff45');
  ctx.restore();
}
function drawScene(canvas){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);const w=canvas.width,h=canvas.height;ctx.fillStyle='#bbd074';ctx.beginPath();ctx.ellipse(w*.53,h*.81,w*.26,h*.05,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e5f1b4';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(w*.1,h*.87);ctx.lineTo(w*.85,h*.87);ctx.moveTo(w*.76,h*.62);ctx.lineTo(w*.91,h*.89);ctx.stroke();drawPlayer(ctx,w*.52,h*.80,Math.min(w/85,h/96));rect(ctx,w*.27,h*.78,12,12,'#f5f1cc');rect(ctx,w*.27+3,h*.78+3,2,2,'#9eae65');rect(ctx,w*.27+7,h*.78+7,2,2,'#9eae65');}
function renderOptions(){for(const key of Object.keys(colors)){const group=document.getElementById(key+'-options');group.replaceChildren();for(const [hex,label]of colors[key]){const button=document.createElement('button');button.className='swatch';button.style.backgroundColor=hex;button.setAttribute('aria-label',label+' '+(key==='skin'?'skin tone':key==='shirt'?'jersey':'paddle'));button.setAttribute('aria-pressed',String(state[key]===hex));button.title=label;button.addEventListener('click',()=>{state[key]=hex;persist();render();});group.append(button);}}const group=document.getElementById('hat-options');group.replaceChildren();for(const [value,label]of hats){const button=document.createElement('button');button.className='item-button';button.textContent=label;button.setAttribute('aria-pressed',String(state.hat===value));button.addEventListener('click',()=>{state.hat=value;persist();render();});group.append(button);}}
function renderHistory(){const root=document.getElementById('history');root.replaceChildren();if(!state.history.length){const p=document.createElement('p');p.className='empty-state';p.textContent='Your first demo game will appear here. Try a win or a loss above.';root.append(p);return;}state.history.forEach((item,index)=>{const row=document.createElement('div');row.className='history-row';const label=document.createElement('div');const strong=document.createElement('strong');strong.className=item.win?'win-label':'loss-label';strong.textContent=item.win?'Demo win':'Demo loss';const small=document.createElement('small');small.textContent='Game '+(state.games-index)+' · Opponent '+item.opponent+' MMR';label.append(strong,small);const delta=document.createElement('span');delta.className='history-delta '+(item.delta>=0?'win-label':'loss-label');delta.textContent=(item.delta>=0?'+':'')+item.delta;const after=document.createElement('span');after.textContent=item.after+' MMR';row.append(label,delta,after);root.append(row);});}
function render(){document.querySelectorAll('.player-name').forEach(e=>e.textContent=state.name.trim()||defaults.name);document.querySelectorAll('[data-rating]').forEach(e=>e.textContent=state.rating);document.querySelectorAll('[data-rank]').forEach(e=>e.textContent=rank());document.querySelectorAll('[data-games]').forEach(e=>e.textContent=state.games);document.querySelectorAll('[data-wins]').forEach(e=>e.textContent=state.wins);document.querySelectorAll('[data-winrate]').forEach(e=>e.textContent=state.games?Math.round(state.wins/state.games*100)+'%':'—');document.querySelector('.rating-track span').style.width=Math.min(state.games/5*100,100)+'%';drawScene(document.getElementById('hero-avatar'));drawScene(document.getElementById('locker-avatar'));drawScene(document.getElementById('setup-avatar'));renderOptions();renderHistory();syncAvatarControls();}
function navigate(page){if(!state.avatarCreated)page='avatar';else if(!['profile','locker','rating'].includes(page))page='profile';document.getElementById('player-app').classList.toggle('needs-avatar',!state.avatarCreated);document.querySelectorAll('.page').forEach(e=>{const active=e.id===page;e.classList.toggle('active',active);e.hidden=!active;});document.querySelectorAll('.nav-button').forEach(e=>{const active=e.dataset.page===page;e.classList.toggle('active',active);if(active)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});if(location.hash!=='#'+page)history.replaceState(null,'','#'+page);window.scrollTo({top:0,behavior:'instant'});}
function simulate(win){const input=document.getElementById('opponent');if(!input.checkValidity()){input.reportValidity();return;}const opponent=Number(input.value);if(!Number.isInteger(opponent)||opponent<100||opponent>3000){toast('Choose a whole-number rating from 100 to 3000.');return;}const expected=1/(1+Math.pow(10,(opponent-state.rating)/400));const change=Math.round(32*((win?1:0)-expected));const before=state.rating;state.rating=Math.max(100,Math.min(5000,state.rating+change));const delta=state.rating-before;state.games++;if(win)state.wins++;state.history.unshift({win,opponent,delta,after:state.rating});state.history=state.history.slice(0,20);persist();render();document.getElementById('rating-feedback').textContent=(win?'Demo win! ':'Demo loss. ')+(delta>=0?'+':'')+delta+' MMR · Your rating is now '+state.rating+'.';}
function fittedText(ctx,text,maxWidth,start,min){let size=start;do{ctx.font='600 '+size+'px "Space Grotesk", Arial, sans-serif';if(ctx.measureText(text).width<=maxWidth)break;size-=2;}while(size>min);return size;}
function story(){const canvas=document.getElementById('story-canvas');const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;rect(ctx,0,0,1080,1920,'#f5f4ed');rect(ctx,60,60,960,1800,'#d5ed8b');rect(ctx,60,1370,960,490,'#ed9275');ctx.textAlign='left';ctx.fillStyle='#232922';ctx.font='700 52px "Space Grotesk", Arial, sans-serif';ctx.fillText('sideout.',125,160);ctx.font='600 21px "DM Sans", Arial, sans-serif';ctx.fillText('VALENCIA CITY, BUKIDNON',125,218);ctx.fillStyle='#bfd56f';ctx.font='700 190px "Space Grotesk", Arial, sans-serif';ctx.fillText('LET’S',115,478);ctx.fillText('PLAY.',115,655);ctx.fillStyle='#b8cd72';ctx.beginPath();ctx.ellipse(540,1102,295,42,0,0,Math.PI*2);ctx.fill();drawPlayer(ctx,515,1125,11);ctx.textAlign='center';ctx.fillStyle='#232922';const name=state.name.trim()||defaults.name;fittedText(ctx,name,790,63,28);ctx.fillText(name,540,1260);ctx.font='600 21px "DM Sans", Arial, sans-serif';ctx.fillText('YOUR GAME. YOUR CHARACTER.',540,1320);ctx.font='600 21px "DM Sans", Arial, sans-serif';ctx.fillText('SIDEOUT RATING • DEMO',540,1455);ctx.font='500 148px "Space Grotesk", Arial, sans-serif';ctx.fillText(state.rating,540,1620);ctx.font='500 26px "DM Sans", Arial, sans-serif';ctx.fillText(rank(),540,1685);ctx.font='600 20px "DM Sans", Arial, sans-serif';ctx.fillText('PLAY LOCAL. SHOW YOUR STYLE.',540,1800);return canvas;}
let chosenBody=state.avatarCreated?state.bodyType:null;
const setupHeight=document.getElementById('setup-height');
const setupRange=document.getElementById('setup-height-range');
document.getElementById('setup-name').value=state.name;
setupHeight.value=state.avatarCreated?state.height:'';
setupRange.value=state.height;
document.getElementById('locker-height').value=state.height;
document.getElementById('locker-body').value=state.bodyType;
function syncAvatarControls(){
  document.querySelectorAll('[data-character]').forEach(button=>button.setAttribute('aria-pressed',String(state.characterType===button.dataset.character)));
  document.querySelectorAll('#setup-body-options [data-body]').forEach(button=>button.setAttribute('aria-pressed',String(chosenBody===button.dataset.body)));
  const summary=document.getElementById('avatar-summary');
  summary.textContent=setupHeight.value&&chosenBody?characterLabels[state.characterType]+' · '+state.height+' cm · '+bodyLabels[state.bodyType]+' build':'Choose your height and build';
  for(const key of ['skin','shirt']){
    const group=document.getElementById('setup-'+key+'-options');group.replaceChildren();
    for(const [hex,label]of colors[key]){const button=document.createElement('button');button.type='button';button.className='swatch';button.style.backgroundColor=hex;button.setAttribute('aria-label',label+' '+(key==='skin'?'skin tone':'jersey'));button.setAttribute('aria-pressed',String(state[key]===hex));button.addEventListener('click',()=>{state[key]=hex;render();});group.append(button);}
  }
}
document.querySelectorAll('[data-character]').forEach(button=>button.addEventListener('click',()=>{state.characterType=button.dataset.character;render();if(state.avatarCreated&&button.closest('#locker-character-options'))persist();}));
function updateHeight(value){const height=Number(value);if(!Number.isInteger(height)||height<120||height>220)return false;state.height=height;setupHeight.value=height;setupRange.value=height;render();return true;}
setupHeight.addEventListener('input',()=>updateHeight(setupHeight.value));
setupRange.addEventListener('input',()=>updateHeight(setupRange.value));
document.getElementById('setup-name').addEventListener('input',event=>{state.name=event.target.value;document.querySelectorAll('.player-name').forEach(element=>element.textContent=state.name.trim()||defaults.name);});
document.querySelectorAll('#setup-body-options [data-body]').forEach(button=>button.addEventListener('click',()=>{chosenBody=button.dataset.body;state.bodyType=chosenBody;document.getElementById('avatar-error').hidden=true;render();}));
document.getElementById('avatar-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;const error=document.getElementById('avatar-error');error.hidden=true;
  if(!form.reportValidity())return;
  if(!chosenBody){error.textContent='Choose a body type to create your avatar.';error.hidden=false;document.querySelector('#setup-body-options button').focus();return;}
  if(!document.getElementById('setup-name').value.trim()){error.textContent='Enter your player name.';error.hidden=false;return;}
  const button=document.getElementById('finish-avatar');button.disabled=true;button.firstElementChild.textContent='Saving your avatar…';
  const completed={...state,name:document.getElementById('setup-name').value.trim(),height:Number(setupHeight.value),bodyType:chosenBody,avatarCreated:true};
  try{await window.sideoutAuth.saveProfile(completed);state=completed;document.getElementById('nickname').value=state.name;document.getElementById('locker-height').value=state.height;document.getElementById('locker-body').value=state.bodyType;document.getElementById('player-app').classList.remove('needs-avatar');render();navigate('profile');toast('Your avatar is ready. Welcome to the clubhouse.');}
  catch(e){error.textContent=e.message;error.hidden=false;}
  finally{button.disabled=false;button.firstElementChild.textContent='Create my avatar';}
});
document.getElementById('locker-height').addEventListener('input',event=>{const input=event.target;if(!input.value||!input.checkValidity())return;state.height=Number(input.value);persist();render();});
document.getElementById('locker-body').addEventListener('change',event=>{state.bodyType=event.target.value;persist();render();});

document.querySelectorAll('[data-page]').forEach(e=>e.addEventListener('click',()=>navigate(e.dataset.page)));document.querySelectorAll('[data-goto]').forEach(e=>e.addEventListener('click',()=>navigate(e.dataset.goto)));window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));
document.getElementById('nickname').value=state.name;
document.getElementById('nickname').addEventListener('input',e=>{state.name=e.target.value;persist();document.querySelectorAll('.player-name').forEach(el=>el.textContent=state.name.trim()||defaults.name);});
document.getElementById('save-look').addEventListener('click',async()=>{const heightInput=document.getElementById('locker-height');if(!heightInput.reportValidity())return;state.height=Number(heightInput.value);state.name=state.name.trim()||defaults.name;document.getElementById('nickname').value=state.name;const saved=await persist();render();if(saved)toast('Your look is saved. See you on the court.');navigate('profile');});
document.getElementById('random-look').addEventListener('click',()=>{for(const key of Object.keys(colors))state[key]=colors[key][Math.floor(Math.random()*colors[key].length)][0];state.hat=hats[Math.floor(Math.random()*hats.length)][0];persist();render();toast('Fresh fit unlocked.');});
document.getElementById('demo-win').addEventListener('click',()=>simulate(true));document.getElementById('demo-loss').addEventListener('click',()=>simulate(false));
document.getElementById('reset-demo').addEventListener('click',()=>{state.rating=1200;state.games=0;state.wins=0;state.history=[];persist();render();document.getElementById('rating-feedback').textContent='Demo rating reset. Your character stays yours.';toast('Demo rating reset to 1200.');});
const dialog=document.getElementById('story-dialog');document.getElementById('share-open').addEventListener('click',async()=>{if(document.fonts)await document.fonts.ready;story();dialog.showModal();});document.getElementById('share-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
document.getElementById('download-story').addEventListener('click',()=>{story().toBlob(blob=>{if(!blob){toast('Could not create the card. Try again.');return;}const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='sideout-story.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Story card downloaded. Upload it to your story.');},'image/png');});
render();navigate(location.hash.slice(1));

})();
