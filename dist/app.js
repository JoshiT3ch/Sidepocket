'use strict';
(async () => {
const account=await window.sideoutAuth.ready;
if(!account)return;
const {WARDROBE,DEFAULT_EQUIPMENT,CATEGORY_LABELS,getItem,outfitItems}=await import('./wardrobe.js');
const {drawAvatar,drawClothingThumbnail,drawHairThumbnail}=await import('./pixel-player.js');
const {STORY_TEMPLATES,drawStoryCard,storyFilename}=await import('./story-card.js');
const {createStoryShare}=await import('./story-share.js');
const {parseDuoInvite}=await import('./qr.js');
const {HAIRSTYLES,HAIR_COLORS,normalizeHair,hairstylesFor}=await import('./hairstyles.js');
const defaults = {name:account.user.name,skin:'#cf986c',shirt:'#ed795d',paddle:'#7286bb',hat:'cap',height:170,bodyType:'regular',characterType:'male',avatarCreated:false,rating:1200,games:0,wins:0,history:[]};
const colors = {skin:[['#f1c49b','Light'],['#cf986c','Tan'],['#a96c4b','Warm'],['#704630','Deep']],shirt:[['#ed795d','Coral'],['#a6bce0','Sky'],['#ede8cd','Cream'],['#8da65d','Moss'],['#b59fc6','Lilac']],paddle:[['#7286bb','Blue'],['#ed795d','Coral'],['#d2e48e','Lime'],['#8f709d','Purple']]};
const hats = [['none','No cap'],['headband','Headband']];
let state = {...defaults,...DEFAULT_EQUIPMENT,history:[]};
try {const saved=account.profile;if(saved && typeof saved==='object'){state.name=typeof saved.name==='string' ? saved.name.slice(0,24) : defaults.name;for(const key of Object.keys(colors))if(colors[key].some(([hex])=>hex===saved[key]))state[key]=saved[key];if(['none','cap','headband'].includes(saved.hat))state.hat=saved.hat;if(Number.isInteger(saved.rating)&&saved.rating>=100&&saved.rating<=5000&&Number.isInteger(saved.games)&&saved.games>=0&&Number.isInteger(saved.wins)&&saved.wins>=0&&saved.wins<=saved.games){state.rating=saved.rating;state.games=saved.games;state.wins=saved.wins;state.history=Array.isArray(saved.history)?saved.history.filter(x=>x&&typeof x.win==='boolean'&&Number.isInteger(x.opponent)&&Number.isInteger(x.delta)&&Number.isInteger(x.after)).slice(0,20):[];}}}catch(e){}
if(Number.isInteger(account.profile.height)&&account.profile.height>=120&&account.profile.height<=220)state.height=account.profile.height;
if(['lean','regular','broad'].includes(account.profile.bodyType))state.bodyType=account.profile.bodyType;
if(['male','female'].includes(account.profile.characterType))state.characterType=account.profile.characterType;
Object.assign(state,normalizeHair(account.profile));
if(WARDROBE.caps.some(item=>item.id===account.profile.capId))state.capId=account.profile.capId;
if(account.profile.shirtId==='custom'||WARDROBE.shirts.some(item=>item.id===account.profile.shirtId))state.shirtId=account.profile.shirtId;
if([...WARDROBE.shorts,...WARDROBE.pants].some(item=>item.id===account.profile.bottomId))state.bottomId=account.profile.bottomId;
if(WARDROBE.shirts.some(item=>item.color===account.profile.shirt))state.shirt=account.profile.shirt;
state.avatarCreated=account.profile.avatarCreated===true;
let matchStats=null;
let playController=null;
let playStarting=false;
let leaderboardController=null;
let leaderboardStarting=null;
async function startLeaderboard(){
  if(!state.avatarCreated)return;
  if(leaderboardController)return leaderboardController.refresh();
  if(leaderboardStarting)return leaderboardStarting;
  leaderboardStarting=(async()=>{
    try{const {initLeaderboard}=await import('./leaderboard.js');leaderboardController=initLeaderboard({onNavigate:navigate});await leaderboardController.refresh();}
    catch(error){toast(error.message||'Could not open the leaderboard. Please try again.');}
    finally{leaderboardStarting=null;}
  })();
  return leaderboardStarting;
}
async function startPlay(){
  if(!state.avatarCreated||playController||playStarting)return;
  playStarting=true;
  try{
    const {initPlay}=await import('./play.js');
    playController=await initPlay({onStats:stats=>{matchStats=stats;render();},onNavigate:navigate,getAvatarCreated:()=>state.avatarCreated});
    await playController.handleNavigation(document.querySelector('.page.active')?.id||'profile');
  }catch(error){toast(error.message||'Could not load player connections. Refresh and try again.');}
  finally{playStarting=false;}
}
const characterLabels={male:'Male',female:'Female'};
const bodyLabels={lean:'Lean',regular:'Regular',broad:'Broad'};
let toastTimer;
function toast(message){const element=document.getElementById('toast');element.textContent=message;element.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>element.classList.remove('visible'),2600);}
let saveQueue=Promise.resolve(true);
function persist(){const snapshot=structuredClone(state);snapshot.name=snapshot.name.trim()||defaults.name;saveQueue=saveQueue.then(()=>window.sideoutAuth.saveProfile(snapshot)).then(()=>true).catch(error=>{toast(error.message+' Your latest changes have not been saved.');return false;});return saveQueue;}
window.sideoutFlush=()=>saveQueue;
function rank(){return matchStats?matchStats.games<5?'Finding your level':'Rating established':'Loading your rating';}
function rect(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function drawScene(canvas){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);const w=canvas.width,h=canvas.height;ctx.fillStyle='#bbd074';ctx.beginPath();ctx.ellipse(w*.53,h*.81,w*.26,h*.05,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e5f1b4';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(w*.1,h*.87);ctx.lineTo(w*.85,h*.87);ctx.moveTo(w*.76,h*.62);ctx.lineTo(w*.91,h*.89);ctx.stroke();drawAvatar(ctx,w*.52,h*.80,Math.min(w/90,h/135),state);rect(ctx,w*.27,h*.78,12,12,'#f5f1cc');rect(ctx,w*.27+3,h*.78+3,2,2,'#9eae65');rect(ctx,w*.27+7,h*.78+7,2,2,'#9eae65');}
function renderOptions(){for(const key of ['skin','paddle']){const group=document.getElementById(key+'-options');group.replaceChildren();for(const [hex,label]of colors[key]){const button=document.createElement('button');button.className='swatch';button.style.backgroundColor=hex;button.setAttribute('aria-label',label+' '+(key==='skin'?'skin tone':key==='shirt'?'jersey':'paddle'));button.setAttribute('aria-pressed',String(state[key]===hex));button.title=label;button.addEventListener('click',()=>{state[key]=hex;persist();render();});group.append(button);}}const group=document.getElementById('hat-options');group.replaceChildren();for(const [value,label]of hats){const button=document.createElement('button');button.className='item-button';button.textContent=label;button.setAttribute('aria-pressed',String(state.hat===value));button.addEventListener('click',()=>{state.hat=value;persist();render();});group.append(button);}}
function renderHistory(){
  const root=document.getElementById('history');root.replaceChildren();
  const history=matchStats?.history||[];
  if(!history.length){const p=document.createElement('p');p.className='empty-state';p.textContent='Your completed doubles games will appear here. Connect with players in Play & QR to start.';root.append(p);return;}
  for(const item of history){
    const ownSide=item.teams.a.some(player=>player.id===account.user.id)?'a':'b';
    const opponents=item.teams[ownSide==='a'?'b':'a'];
    const win=item.winnerSide===ownSide;
    const result=item.deltas.find(delta=>delta.playerId===account.user.id);
    if(!result)continue;
    const row=document.createElement('div');row.className='history-row';
    const label=document.createElement('div');const strong=document.createElement('strong');strong.className=win?'win-label':'loss-label';strong.textContent=(win?'Win':'Loss')+' · '+opponents.map(player=>player.name).join(' + ');
    const small=document.createElement('small');small.textContent='Doubles · '+new Date(item.completedAt).toLocaleDateString()+' · Opponent average '+Math.round(opponents.reduce((sum,player)=>sum+player.rating,0)/2)+' MMR';label.append(strong,small);
    const delta=document.createElement('span');delta.className='history-delta '+(result.delta>=0?'win-label':'loss-label');delta.textContent=(result.delta>=0?'+':'')+result.delta;
    const after=document.createElement('span');after.textContent=result.after+' MMR';row.append(label,delta,after);root.append(row);
  }
}
function render(){document.querySelectorAll('.player-name').forEach(e=>e.textContent=state.name.trim()||defaults.name);document.querySelectorAll('[data-rating]').forEach(e=>e.textContent=matchStats?.rating??'—');document.querySelectorAll('[data-rank]').forEach(e=>e.textContent=rank());document.querySelectorAll('[data-games]').forEach(e=>e.textContent=matchStats?.games??0);document.querySelectorAll('[data-wins]').forEach(e=>e.textContent=matchStats?.wins??0);document.querySelectorAll('[data-winrate]').forEach(e=>e.textContent=matchStats?.games??0?Math.round(matchStats.wins/matchStats.games*100)+'%':'—');document.querySelector('.rating-track span').style.width=Math.min((matchStats?.games??0)/5*100,100)+'%';drawScene(document.getElementById('hero-avatar'));drawScene(document.getElementById('locker-avatar'));drawScene(document.getElementById('setup-avatar'));renderOptions();renderHistory();syncAvatarControls();renderWardrobe();if(document.getElementById('story-dialog').open){renderStoryChoices();story();}}
function navigate(page){if(!state.avatarCreated)page='avatar';else if(!['profile','locker','rating','play','leaderboard'].includes(page))page='profile';document.getElementById('player-app').classList.toggle('needs-avatar',!state.avatarCreated);document.querySelectorAll('.page').forEach(e=>{const active=e.id===page;e.classList.toggle('active',active);e.hidden=!active;});document.querySelectorAll('.nav-button').forEach(e=>{const active=e.dataset.page===page;e.classList.toggle('active',active);if(active)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});if(location.hash!=='#'+page)history.replaceState(null,'','#'+page);window.scrollTo({top:0,behavior:'instant'});if(playController)Promise.resolve(playController.handleNavigation(page)).catch(error=>toast(error.message));else if(page==='play')startPlay();if(page==='leaderboard')startLeaderboard();}
let storyTemplate=STORY_TEMPLATES[0].id;
function story(){const canvas=drawStoryCard(document.getElementById('story-canvas'),{profile:state,stats:matchStats,template:storyTemplate});const choice=STORY_TEMPLATES.find(item=>item.id===storyTemplate);canvas.setAttribute('aria-label',`${choice.name} story card for ${state.name.trim()||defaults.name}, with your pixel character and current doubles rating`);storyShare.prepare(canvas,storyFilename(storyTemplate));return canvas;}
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
    for(const [hex,label]of colors[key]){const button=document.createElement('button');button.type='button';button.className='swatch';button.style.backgroundColor=hex;button.setAttribute('aria-label',label+' '+(key==='skin'?'skin tone':'jersey'));button.setAttribute('aria-pressed',String(state[key]===hex));button.addEventListener('click',()=>{state[key]=hex;if(key==='shirt')state.shirtId='custom';render();});group.append(button);}
  }
  renderHairControls();
}
function renderHairControls(){
  const focused=document.activeElement;
  const focusId=focused?.dataset.hairChoice;
  const focusGroup=focused?.closest('[data-hair-group]')?.dataset.hairGroup;
  for(const scope of ['setup','locker']){
    const styles=document.getElementById(scope+'-hair-options');styles.dataset.characterType=state.characterType;styles.replaceChildren();
    for(const style of hairstylesFor(state.characterType)){
      const button=document.createElement('button');button.type='button';button.className='hair-option';button.dataset.hairChoice=style.id;button.setAttribute('aria-label',style.name+' hairstyle');button.setAttribute('aria-pressed',String(state.hairStyle===style.id));
      const art=document.createElement('canvas');art.width=100;art.height=104;art.setAttribute('aria-hidden','true');drawHairThumbnail(art,{...state,hairStyle:style.id});
      const label=document.createElement('span');label.textContent=style.name;button.append(art,label);
      button.addEventListener('click',()=>{state.hairStyle=style.id;render();if(state.avatarCreated)persist();});styles.append(button);
    }
    const tones=document.getElementById(scope+'-hair-colors');tones.replaceChildren();
    for(const tone of HAIR_COLORS){
      const button=document.createElement('button');button.type='button';button.className='swatch';button.style.backgroundColor=tone.color;button.dataset.hairChoice=tone.color;button.setAttribute('aria-label',tone.name+' hair');button.setAttribute('aria-pressed',String(state.hairColor===tone.color));button.title=tone.name;
      button.addEventListener('click',()=>{state.hairColor=tone.color;render();if(state.avatarCreated)persist();});tones.append(button);
    }
    document.getElementById(scope+'-hair-selected').textContent=HAIRSTYLES.find(style=>style.id===state.hairStyle).name+' · '+HAIR_COLORS.find(tone=>tone.color===state.hairColor).name;
    document.getElementById(scope+'-hair-hint').textContent=characterLabels[state.characterType]+' hairstyles only. Take your cap off to see the full look.';
  }
  document.querySelectorAll('[data-hair-headwear]').forEach(button=>{button.textContent=state.hat==='none'?'Wear cap ↗':state.hat==='headband'?'Take headband off ↗':'Take cap off ↗';});
  if(focusId&&focusGroup){const group=[...document.querySelectorAll('[data-hair-group]')].find(element=>element.dataset.hairGroup===focusGroup);[...group.querySelectorAll('[data-hair-choice]')].find(button=>button.dataset.hairChoice===focusId)?.focus({preventScroll:true});}
}
document.querySelectorAll('[data-hair-headwear]').forEach(button=>button.addEventListener('click',()=>{state.hat=state.hat==='none'?'cap':'none';render();if(state.avatarCreated)persist();}));
document.querySelectorAll('[data-character]').forEach(button=>button.addEventListener('click',()=>{state.characterType=button.dataset.character;Object.assign(state,normalizeHair(state));render();if(state.avatarCreated&&button.closest('#locker-character-options'))persist();}));
let wardrobeCategory='caps';
let wardrobeBrand='all';
function equip(item,category){
  if(category==='caps'){state.capId=item.id;state.hat='cap';}
  else if(category==='shirts'){state.shirtId=item.id;state.shirt=item.color;}
  else state.bottomId=item.id;
  persist();render();
}
function renderWardrobe(){
  const focused=document.activeElement?.dataset.itemId;
  document.querySelectorAll('[data-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===wardrobeCategory)));
  const items=WARDROBE[wardrobeCategory].filter(item=>wardrobeBrand==='all'||item.brand===wardrobeBrand);
  const grid=document.getElementById('wardrobe-grid');grid.replaceChildren();
  document.getElementById('wardrobe-count').textContent=items.length+' '+CATEGORY_LABELS[wardrobeCategory].toLowerCase();
  document.getElementById('wardrobe-extras').hidden=wardrobeCategory!=='caps';
  for(const item of items){
    const selected=wardrobeCategory==='caps'?state.hat==='cap'&&state.capId===item.id:wardrobeCategory==='shirts'?state.shirtId===item.id:state.bottomId===item.id;
    const button=document.createElement('button');button.type='button';button.className='wardrobe-item';button.dataset.itemId=item.id;button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-label',item.brand+' '+item.name);
    const art=document.createElement('canvas');art.width=144;art.height=120;art.setAttribute('aria-hidden','true');drawClothingThumbnail(art,item,wardrobeCategory);
    const brand=document.createElement('span');brand.className='item-brand';brand.textContent=item.brand;
    const name=document.createElement('strong');name.textContent=item.name;
    const status=document.createElement('span');status.className='item-state';status.textContent=selected?'Equipped ✓':'Try it on ↗';
    button.append(art,brand,name,status);button.addEventListener('click',()=>equip(item,wardrobeCategory));grid.append(button);
  }
  if(focused){const target=[...grid.querySelectorAll('[data-item-id]')].find(button=>button.dataset.itemId===focused);target?.focus({preventScroll:true});}
  const outfit=outfitItems(state);document.getElementById('locker-outfit').textContent=outfit.shirt.brand+' '+outfit.shirt.name+' · '+outfit.bottom.brand+' '+outfit.bottom.name;
}
document.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>{wardrobeCategory=button.dataset.category;renderWardrobe();}));
document.getElementById('wardrobe-brand').addEventListener('change',event=>{wardrobeBrand=event.target.value;renderWardrobe();});

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
  try{const destination=parseDuoInvite(location.href)||new URLSearchParams(location.search).has('player')?'play':'profile';await window.sideoutAuth.saveProfile(completed);state=completed;document.getElementById('nickname').value=state.name;document.getElementById('locker-height').value=state.height;document.getElementById('locker-body').value=state.bodyType;document.getElementById('player-app').classList.remove('needs-avatar');render();await startPlay();navigate(destination);toast('Your avatar is ready. Welcome to the clubhouse.');}
  catch(e){error.textContent=e.message;error.hidden=false;}
  finally{button.disabled=false;button.firstElementChild.textContent='Create my avatar';}
});
document.getElementById('locker-height').addEventListener('input',event=>{const input=event.target;if(!input.value||!input.checkValidity())return;state.height=Number(input.value);persist();render();});
document.getElementById('locker-body').addEventListener('change',event=>{state.bodyType=event.target.value;persist();render();});

document.querySelectorAll('[data-page]').forEach(e=>e.addEventListener('click',()=>navigate(e.dataset.page)));document.querySelectorAll('[data-goto]').forEach(e=>e.addEventListener('click',()=>navigate(e.dataset.goto)));window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));
document.getElementById('nickname').value=state.name;
document.getElementById('nickname').addEventListener('input',e=>{state.name=e.target.value;persist();document.querySelectorAll('.player-name').forEach(el=>el.textContent=state.name.trim()||defaults.name);});
document.getElementById('save-look').addEventListener('click',async()=>{const heightInput=document.getElementById('locker-height');if(!heightInput.checkValidity()){heightInput.closest('details').open=true;heightInput.reportValidity();return;}state.height=Number(heightInput.value);state.name=state.name.trim()||defaults.name;document.getElementById('nickname').value=state.name;const saved=await persist();render();if(saved)toast('Your look is saved. See you on the court.');navigate('profile');});
document.getElementById('random-look').addEventListener('click',()=>{const pick=items=>items[Math.floor(Math.random()*items.length)];state.capId=pick(WARDROBE.caps).id;const shirt=pick(WARDROBE.shirts);state.shirtId=shirt.id;state.shirt=shirt.color;state.bottomId=pick([...WARDROBE.shorts,...WARDROBE.pants]).id;state.hat='cap';persist();render();toast('A fresh court fit, just for you.');});
const dialog=document.getElementById('story-dialog');
const shareStoryButton=document.getElementById('share-story');
const shareStoryLabel=document.getElementById('share-story-label');
const shareStoryStatus=document.getElementById('story-share-status');
const storyShareFallback=document.getElementById('story-share-fallback');
let manualShareRequested=false;
const storyShare=createStoryShare({onState:({phase})=>{
  shareStoryButton.disabled=phase==='preparing'||phase==='sharing';
  shareStoryLabel.textContent=phase==='preparing'?'Preparing your card…':phase==='sharing'?'Sharing…':'Share story card';
  const messages={
    preparing:'Getting your selected card ready to share.',
    ready:'Ready. Choose Instagram or Stories in your phone’s share menu, if available.',
    unsupported:'This browser can’t share images directly. Save the PNG, then add it to your Instagram Story.',
    error:'Sharing couldn’t open. Try again, or save the PNG and add it in Instagram.',
    sharing:'Choose Instagram or Stories in the share menu, if available.',
    'handed-off':'Your card was handed to your device. Finish sharing in the app you chose.',
    canceled:'Sharing canceled. Your card is still here when you’re ready.'
  };
  shareStoryStatus.textContent=messages[phase]||'';
  if(phase==='ready')storyShareFallback.hidden=true;
  if(manualShareRequested&&(phase==='unsupported'||phase==='error'))storyShareFallback.hidden=false;
}});
shareStoryButton.addEventListener('click',()=>{
  manualShareRequested=true;
  // Call directly from the gesture: the PNG is already prepared before this tap.
  storyShare.share();
});
dialog.addEventListener('close',()=>{storyShare.invalidate();manualShareRequested=false;storyShareFallback.hidden=true;});
const templateChoices=document.getElementById('story-templates');
function renderStoryChoices(){
  const source=document.createElement('canvas');
  for(const choice of STORY_TEMPLATES){
    const button=templateChoices.querySelector(`[data-story-template="${choice.id}"]`);
    button.setAttribute('aria-pressed',String(storyTemplate===choice.id));
    const thumbnail=button.querySelector('canvas'),ctx=thumbnail.getContext('2d');
    drawStoryCard(source,{profile:state,stats:matchStats,template:choice.id});
    ctx.clearRect(0,0,thumbnail.width,thumbnail.height);ctx.drawImage(source,0,0,thumbnail.width,thumbnail.height);
  }
}
for(const choice of STORY_TEMPLATES){
  const button=document.createElement('button');button.type='button';button.className='story-template';button.dataset.storyTemplate=choice.id;
  button.setAttribute('aria-pressed',String(storyTemplate===choice.id));button.setAttribute('aria-controls','story-canvas');
  const thumbnail=document.createElement('canvas');thumbnail.width=108;thumbnail.height=192;thumbnail.setAttribute('aria-hidden','true');
  const copy=document.createElement('span');copy.className='story-template-copy';
  const name=document.createElement('strong');name.textContent=choice.name;const description=document.createElement('span');description.textContent=choice.description;copy.append(name,description);
  const check=document.createElement('span');check.className='story-template-check';check.textContent='✓';check.setAttribute('aria-hidden','true');
  button.append(thumbnail,copy,check);button.addEventListener('click',()=>{storyTemplate=choice.id;renderStoryChoices();story();document.getElementById('story-selection-status').textContent=choice.name+' selected.';});templateChoices.append(button);
}
document.getElementById('share-open').addEventListener('click',async()=>{
  const button=document.getElementById('share-open');button.disabled=true;
  try{if(document.fonts)await document.fonts.ready;renderStoryChoices();story();if(!dialog.open)dialog.showModal();}
  catch{toast('Could not open the story editor. Please try again.');}
  finally{button.disabled=false;}
});
document.getElementById('share-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
document.getElementById('download-story').addEventListener('click',async()=>{
  const button=document.getElementById('download-story');button.disabled=true;
  // Freeze the choice, look and server stats together so an in-flight export stays consistent.
  const selected=storyTemplate,profile=structuredClone(state),stats=matchStats?structuredClone(matchStats):null;
  try{
    if(document.fonts)await document.fonts.ready;
    const canvas=drawStoryCard(document.createElement('canvas'),{profile,stats,template:selected});
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('Could not create the card.');
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=storyFilename(selected);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Story card downloaded. Upload it to your story.');
  }catch{toast('Could not create the card. Please try again.');}
  finally{button.disabled=false;}
});
render();navigate(location.hash.slice(1));await startPlay();

})();
