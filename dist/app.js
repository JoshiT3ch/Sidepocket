'use strict';
(async () => {
const account=await window.sideoutAuth.ready;
if(!account)return;
const [
  {WARDROBE,DEFAULT_EQUIPMENT,CATEGORY_LABELS,outfitItems},
  {drawAvatar,drawClothingThumbnail,drawHairThumbnail},
  {parseDuoInvite},
  {HAIRSTYLES,HAIR_COLORS,normalizeHair,hairstylesFor},
  {createRenderCache,avatarAppearance},
  {createProfileSaver}
]=await Promise.all([
  import('./wardrobe.js'),import('./pixel-player.js'),import('./player-links.js'),
  import('./hairstyles.js'),import('./render-cache.js'),import('./profile-saver.js')
]);
const renderChanged=createRenderCache();
let effectsPromise,effectVersion=0;
function loadEffects(){
  return effectsPromise??=(Promise.all([import('./duo-celebration.js'),import('./matchup-preview.js')])
    .then(([{createDuoCelebration},{createMatchupPreview}])=>({duo:createDuoCelebration(),matchup:createMatchupPreview()}))
    .catch(error=>{effectsPromise=null;throw error;}));
}
async function showEffect(kind,...players){
  const version=++effectVersion,effects=await loadEffects();
  if(version!==effectVersion)return;
  effects.duo.hide();effects.matchup.hide();effects[kind].show(...players);
  if(kind==='matchup')await effects.matchup.whenHidden();
}
window.addEventListener('pagehide',()=>{effectVersion++;effectsPromise?.then(effects=>{effects.duo.hide();effects.matchup.hide();}).catch(()=>{});});
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
let friendsController=null;
let friendsStarting=null;
let friendsVersion=0;
let hostingController=null,hostingStarting=null,hostingVersion=0;
async function startHosting(){
  if(!state.avatarCreated)return;
  if(hostingController)return hostingController.handleNavigation('hosting');
  if(hostingStarting)return hostingStarting;
  const version=hostingVersion;
  hostingStarting=(async()=>{
    try{const {initHosting}=await import('./hosting.js');if(version!==hostingVersion)return;hostingController=initHosting();await hostingController.handleNavigation(document.querySelector('.page.active')?.id||'profile');}
    catch(error){if(version===hostingVersion)toast(error.message||'Could not open Hosting. Please try again.');}
    finally{if(version===hostingVersion)hostingStarting=null;}
  })();return hostingStarting;
}
window.addEventListener('pagehide',()=>{hostingVersion++;hostingController?.destroy();hostingController=null;hostingStarting=null;});
window.addEventListener('pageshow',event=>{if(event.persisted&&document.querySelector('.page.active')?.id==='hosting')startHosting();});
async function startFriends(){
  if(!state.avatarCreated)return;
  if(friendsController)return friendsController.handleNavigation('friends');
  if(friendsStarting)return friendsStarting;
  const version=friendsVersion;
  friendsStarting=(async()=>{
    try{const {initFriends}=await import('./friends.js');if(version!==friendsVersion)return;friendsController=initFriends({onNavigate:navigate});await friendsController.handleNavigation(document.querySelector('.page.active')?.id||'profile');}
    catch(error){if(version===friendsVersion)toast(error.message||'Could not open friends. Please try again.');}
    finally{if(version===friendsVersion)friendsStarting=null;}
  })();
  return friendsStarting;
}
window.addEventListener('pagehide',()=>{friendsVersion++;friendsController?.destroy();friendsController=null;friendsStarting=null;});
window.addEventListener('pageshow',event=>{if(event.persisted&&document.querySelector('.page.active')?.id==='friends')startFriends();});
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
    playController=await initPlay({onStats:stats=>{matchStats=stats;render();},onNavigate:navigate,getAvatarCreated:()=>state.avatarCreated,onDuoFormed:(player,duo)=>showEffect('duo',player,duo),onOpponentFound:(player,duo,opponents)=>showEffect('matchup',player,duo,opponents)});
    await playController.handleNavigation(document.querySelector('.page.active')?.id||'profile');
  }catch(error){toast(error.message||'Could not load player connections. Refresh and try again.');}
  finally{playStarting=false;}
}
const characterLabels={male:'Male',female:'Female'};
const bodyLabels={lean:'Lean',regular:'Regular',broad:'Broad'};
let toastTimer;
function toast(message){const element=document.getElementById('toast');element.textContent=message;element.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>element.classList.remove('visible'),2600);}
const profileSaver=createProfileSaver({saveProfile:snapshot=>window.sideoutAuth.saveProfile(snapshot),onError:error=>toast(error.message+' Your latest changes have not been saved.')});
function persist(options){const snapshot={...state,name:state.name.trim()||defaults.name};return profileSaver.save(snapshot,options);}
window.sideoutFlush=()=>profileSaver.flush();
window.addEventListener('pagehide',()=>{profileSaver.flush();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)profileSaver.flush();});
function rank(){return matchStats?matchStats.games<5?'Finding your level':'Rating established':'Loading your rating';}
function rect(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function drawScene(canvas){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);const w=canvas.width,h=canvas.height;ctx.fillStyle='#bbd074';ctx.beginPath();ctx.ellipse(w*.53,h*.81,w*.26,h*.05,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e5f1b4';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(w*.1,h*.87);ctx.lineTo(w*.85,h*.87);ctx.moveTo(w*.76,h*.62);ctx.lineTo(w*.91,h*.89);ctx.stroke();drawAvatar(ctx,w*.52,h*.80,Math.min(w/90,h/135),state);rect(ctx,w*.27,h*.78,12,12,'#f5f1cc');rect(ctx,w*.27+3,h*.78+3,2,2,'#9eae65');rect(ctx,w*.27+7,h*.78+7,2,2,'#9eae65');}
function renderSwatches(id,key,save=false){
  const group=document.getElementById(id);
  renderChanged(id+'-buttons',true,()=>{
    for(const [hex,label]of colors[key]){
      const button=document.createElement('button');button.type='button';button.className='swatch';button.style.backgroundColor=hex;button.dataset.color=hex;
      button.setAttribute('aria-label',label+' '+(key==='skin'?'skin tone':key==='shirt'?'jersey':'paddle'));button.title=label;
      button.addEventListener('click',()=>{state[key]=hex;if(key==='shirt')state.shirtId='custom';if(save)persist();render();});group.append(button);
    }
  });
  for(const button of group.children)button.setAttribute('aria-pressed',String(state[key]===button.dataset.color));
}
function renderOptions(){
  for(const key of ['skin','paddle'])renderSwatches(key+'-options',key,true);
  const group=document.getElementById('hat-options');
  renderChanged('hat-buttons',true,()=>{
    for(const [value,label]of hats){const button=document.createElement('button');button.type='button';button.className='item-button';button.textContent=label;button.dataset.hat=value;button.addEventListener('click',()=>{state.hat=value;persist();render();});group.append(button);}
  });
  for(const button of group.children)button.setAttribute('aria-pressed',String(state.hat===button.dataset.hat));
}
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
    if(item.scores?.length){const scores=document.createElement('small');scores.className='history-set-scores';scores.textContent='Sets (your duo first): '+item.scores.map(score=>`${score[ownSide]}–${score[ownSide==='a'?'b':'a']}`).join(', ');label.append(scores);}
    const delta=document.createElement('span');delta.className='history-delta '+(result.delta>=0?'win-label':'loss-label');delta.textContent=(result.delta>=0?'+':'')+result.delta;
    const after=document.createElement('span');after.textContent=result.after+' MMR';row.append(label,delta,after);root.append(row);
  }
}
function render(){
  const verified=account.profile.isVerified===true&&Date.parse(account.profile.verifiedUntil)>Date.now();
  const badge=document.getElementById('profile-verified');if(badge)badge.hidden=!verified;
  renderChanged('player-name',state.name,()=>document.querySelectorAll('.player-name').forEach(e=>e.textContent=state.name.trim()||defaults.name));
  renderChanged('stats',[matchStats?.rating,matchStats?.games,matchStats?.wins],()=>{
    document.querySelectorAll('[data-rating]').forEach(e=>e.textContent=matchStats?.rating??'—');document.querySelectorAll('[data-rank]').forEach(e=>e.textContent=rank());
    document.querySelectorAll('[data-games]').forEach(e=>e.textContent=matchStats?.games??0);document.querySelectorAll('[data-wins]').forEach(e=>e.textContent=matchStats?.wins??0);
    document.querySelectorAll('[data-winrate]').forEach(e=>e.textContent=matchStats?.games??0?Math.round(matchStats.wins/matchStats.games*100)+'%':'—');
    document.querySelector('.rating-track span').style.width=Math.min((matchStats?.games??0)/5*100,100)+'%';
  });
  const page=document.querySelector('.page.active')?.id;
  const canvasId={profile:'hero-avatar',locker:'locker-avatar',avatar:'setup-avatar'}[page];
  if(canvasId)renderChanged(canvasId,avatarAppearance(state),()=>drawScene(document.getElementById(canvasId)));
  if(page==='avatar'||page==='locker')syncAvatarControls(page);
  if(page==='locker'){renderOptions();renderWardrobe();}
  if(page==='rating')renderChanged('history',matchStats?.history||[],renderHistory);
  storyEditor?.refresh();
}
function navigate(page){if(page==='courts')page='hosting';if(!state.avatarCreated)page='avatar';else if(!['profile','locker','rating','play','leaderboard','friends','hosting'].includes(page))page='profile';document.getElementById('player-app').classList.toggle('needs-avatar',!state.avatarCreated);document.querySelectorAll('.page').forEach(e=>{const active=e.id===page;e.classList.toggle('active',active);e.hidden=!active;});document.querySelectorAll('.nav-button').forEach(e=>{const active=e.dataset.page===page;e.classList.toggle('active',active);if(active)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});if(location.hash!=='#'+page)history.replaceState(null,'','#'+page);window.scrollTo({top:0,behavior:'instant'});render();if(playController)Promise.resolve(playController.handleNavigation(page)).catch(error=>toast(error.message));else if(page==='play')startPlay();if(page==='leaderboard')startLeaderboard();if(friendsController)Promise.resolve(friendsController.handleNavigation(page)).catch(error=>toast(error.message));else if(page==='friends')startFriends();if(hostingController)Promise.resolve(hostingController.handleNavigation(page)).catch(error=>toast(error.message));else if(page==='hosting')startHosting();}
let storyEditor=null,storyStarting=null;
let chosenBody=state.avatarCreated?state.bodyType:null;
const setupHeight=document.getElementById('setup-height');
const setupRange=document.getElementById('setup-height-range');
document.getElementById('setup-name').value=state.name;
setupHeight.value=state.avatarCreated?state.height:'';
setupRange.value=state.height;
document.getElementById('locker-height').value=state.height;
document.getElementById('locker-body').value=state.bodyType;
function syncAvatarControls(page){
  document.querySelectorAll('[data-character]').forEach(button=>button.setAttribute('aria-pressed',String(state.characterType===button.dataset.character)));
  document.querySelectorAll('#setup-body-options [data-body]').forEach(button=>button.setAttribute('aria-pressed',String(chosenBody===button.dataset.body)));
  if(page==='avatar'){
    document.getElementById('avatar-summary').textContent=setupHeight.value&&chosenBody?characterLabels[state.characterType]+' · '+state.height+' cm · '+bodyLabels[state.bodyType]+' build':'Choose your height and build';
    for(const key of ['skin','shirt'])renderSwatches('setup-'+key+'-options',key);
  }
  renderHairControls(page==='avatar'?'setup':'locker');
}
function renderHairControls(scope){
  const styles=document.getElementById(scope+'-hair-options');
  renderChanged(scope+'-hair-buttons',state.characterType,()=>{
    styles.dataset.characterType=state.characterType;styles.replaceChildren();
    for(const style of hairstylesFor(state.characterType)){
      const button=document.createElement('button');button.type='button';button.className='hair-option';button.dataset.hairChoice=style.id;button.setAttribute('aria-label',style.name+' hairstyle');
      const art=document.createElement('canvas');art.width=100;art.height=104;art.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.textContent=style.name;button.append(art,label);
      button.addEventListener('click',()=>{state.hairStyle=style.id;render();if(state.avatarCreated)persist();});styles.append(button);
    }
  });
  // Each preview supplies its own hairstyle and removes headwear. Selecting a
  // hairstyle only changes its pressed state; the existing thumbnails stay put.
  const hairAppearance=avatarAppearance({...state,hairStyle:null,hat:'none'});
  renderChanged(scope+'-hair-art',hairAppearance,()=>{
    for(const button of styles.children)drawHairThumbnail(button.querySelector('canvas'),{...state,hairStyle:button.dataset.hairChoice});
  });
  for(const button of styles.children)button.setAttribute('aria-pressed',String(state.hairStyle===button.dataset.hairChoice));
  const tones=document.getElementById(scope+'-hair-colors');
  renderChanged(scope+'-hair-colors',true,()=>{
    for(const tone of HAIR_COLORS){
      const button=document.createElement('button');button.type='button';button.className='swatch';button.style.backgroundColor=tone.color;button.dataset.hairChoice=tone.color;button.setAttribute('aria-label',tone.name+' hair');button.title=tone.name;
      button.addEventListener('click',()=>{state.hairColor=tone.color;render();if(state.avatarCreated)persist();});tones.append(button);
    }
  });
  for(const button of tones.children)button.setAttribute('aria-pressed',String(state.hairColor===button.dataset.hairChoice));
  document.getElementById(scope+'-hair-selected').textContent=HAIRSTYLES.find(style=>style.id===state.hairStyle).name+' · '+HAIR_COLORS.find(tone=>tone.color===state.hairColor).name;
  document.getElementById(scope+'-hair-hint').textContent=characterLabels[state.characterType]+' hairstyles only. Take your cap off to see the full look.';
  document.querySelectorAll('[data-hair-headwear]').forEach(button=>{button.textContent=state.hat==='none'?'Wear cap ↗':state.hat==='headband'?'Take headband off ↗':'Take cap off ↗';});
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
  document.querySelectorAll('[data-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===wardrobeCategory)));
  const items=WARDROBE[wardrobeCategory].filter(item=>wardrobeBrand==='all'||item.brand===wardrobeBrand);
  const grid=document.getElementById('wardrobe-grid');
  document.getElementById('wardrobe-count').textContent=items.length+' '+CATEGORY_LABELS[wardrobeCategory].toLowerCase();
  document.getElementById('wardrobe-extras').hidden=wardrobeCategory!=='caps';
  renderChanged('wardrobe-items',[wardrobeCategory,wardrobeBrand],()=>{
    grid.replaceChildren();
    const category=wardrobeCategory;
    for(const item of items){
      const button=document.createElement('button');button.type='button';button.className='wardrobe-item';button.dataset.itemId=item.id;button.setAttribute('aria-label',item.brand+' '+item.name);
      const art=document.createElement('canvas');art.width=144;art.height=120;art.setAttribute('aria-hidden','true');drawClothingThumbnail(art,item,category);
      const brand=document.createElement('span');brand.className='item-brand';brand.textContent=item.brand;
      const name=document.createElement('strong');name.textContent=item.name;
      const status=document.createElement('span');status.className='item-state';
      button.append(art,brand,name,status);button.addEventListener('click',()=>equip(item,category));grid.append(button);
    }
  });
  const selectedId=wardrobeCategory==='caps'?(state.hat==='cap'?state.capId:null):wardrobeCategory==='shirts'?state.shirtId:state.bottomId;
  for(const button of grid.children){const selected=button.dataset.itemId===selectedId;button.setAttribute('aria-pressed',String(selected));button.querySelector('.item-state').textContent=selected?'Equipped ✓':'Try it on ↗';}
  const outfit=outfitItems(state);document.getElementById('locker-outfit').textContent=outfit.shirt.brand+' '+outfit.shirt.name+' · '+outfit.bottom.brand+' '+outfit.bottom.name;
}
document.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>{wardrobeCategory=button.dataset.category;renderWardrobe();}));
document.getElementById('wardrobe-brand').addEventListener('change',event=>{wardrobeBrand=event.target.value;renderWardrobe();});

let renderFrame=null;
function scheduleRender(){if(renderFrame!==null)return;renderFrame=requestAnimationFrame(()=>{renderFrame=null;render();});}
function updateHeight(value){const height=Number(value);if(!Number.isInteger(height)||height<120||height>220)return false;state.height=height;setupHeight.value=height;setupRange.value=height;scheduleRender();return true;}
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
  try{const destination=parseDuoInvite(location.href)||new URLSearchParams(location.search).has('room')||new URLSearchParams(location.search).has('player')?'play':'profile';await window.sideoutAuth.saveProfile(completed);state=completed;document.getElementById('nickname').value=state.name;document.getElementById('locker-height').value=state.height;document.getElementById('locker-body').value=state.bodyType;document.getElementById('player-app').classList.remove('needs-avatar');render();await startPlay();navigate(destination);toast('Your avatar is ready. Welcome to the clubhouse.');}
  catch(e){error.textContent=e.message;error.hidden=false;}
  finally{button.disabled=false;button.firstElementChild.textContent='Create my avatar';}
});
document.getElementById('locker-height').addEventListener('input',event=>{const input=event.target;if(!input.value||!input.checkValidity())return;state.height=Number(input.value);persist();render();});
document.getElementById('locker-body').addEventListener('change',event=>{state.bodyType=event.target.value;persist();render();});

document.querySelectorAll('[data-page]').forEach(e=>e.addEventListener('click',()=>navigate(e.dataset.page)));document.querySelectorAll('[data-goto]').forEach(e=>e.addEventListener('click',()=>navigate(e.dataset.goto)));window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));
document.getElementById('nickname').value=state.name;
document.getElementById('nickname').addEventListener('input',e=>{state.name=e.target.value;persist();document.querySelectorAll('.player-name').forEach(el=>el.textContent=state.name.trim()||defaults.name);});
document.getElementById('save-look').addEventListener('click',async()=>{const heightInput=document.getElementById('locker-height');if(!heightInput.checkValidity()){heightInput.closest('details').open=true;heightInput.reportValidity();return;}state.height=Number(heightInput.value);state.name=state.name.trim()||defaults.name;document.getElementById('nickname').value=state.name;const saved=await persist({immediate:true});render();if(saved)toast('Your look is saved. See you on the court.');navigate('profile');});
document.getElementById('random-look').addEventListener('click',()=>{const pick=items=>items[Math.floor(Math.random()*items.length)];state.capId=pick(WARDROBE.caps).id;const shirt=pick(WARDROBE.shirts);state.shirtId=shirt.id;state.shirt=shirt.color;state.bottomId=pick([...WARDROBE.shorts,...WARDROBE.pants]).id;state.hat='cap';persist();render();toast('A fresh court fit, just for you.');});
document.getElementById('share-open').addEventListener('click',async()=>{
  const button=document.getElementById('share-open');button.disabled=true;
  try{
    if(!storyEditor){
      storyStarting??=import('./story-editor.js').then(({createStoryEditor})=>createStoryEditor({getProfile:()=>state,getStats:()=>matchStats,defaultName:defaults.name,toast})).catch(error=>{storyStarting=null;throw error;});
      storyEditor=await storyStarting;
    }
    await storyEditor.open();
  }
  catch{toast('Could not open the story editor. Please try again.');}
  finally{button.disabled=false;}
});
navigate(location.hash.slice(1));await startPlay();

})();
