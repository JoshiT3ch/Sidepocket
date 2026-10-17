import {drawAvatar} from './pixel-player.js';
import {renderPlayerQr,renderDuoQr,parsePlayerCode,playerLink,duoLink,parseDuoInvite} from './qr.js';

const el=(tag,className='',content='')=>{const node=document.createElement(tag);if(className)node.className=className;if(content!==''&&content!=null)node.textContent=String(content);return node;};
const signed=value=>`${Number(value)>=0?'+':''}${value}`;
const average=players=>Math.round(players.reduce((sum,player)=>sum+Number(player.rating||0),0)/Math.max(1,players.length));
const sideName=players=>players.map(player=>player.name).join(' & ');
const shortDate=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleDateString(undefined,{month:'short',day:'numeric'}):'';};

export async function initPlay({onStats=()=>{},onNavigate=()=>{},getAvatarCreated=()=>true,onDuoFormed=()=>{},onOpponentFound=()=>{},now=Date.now,loadQrDecoder=()=>import('./qr-decoder.js').then(module=>module.decodePlayerQr)}={}){
 const root=document.getElementById('play');
 if(!root)return{refresh:async()=>{},handleNavigation:async()=>{},closeScanner:()=>{}};
 const byId=id=>document.getElementById(id);
 const dialog=byId('player-scan-dialog'),video=byId('player-scan-video'),scanMessage=byId('scanner-message');
 let data=null,connected=null,busy=false,refreshing=null,stream=null,scanTimer=null,scanGeneration=0,lookingUp=false,deepLinkHandled=false;
 let duoInvite=null,showDuoQr=false,qrLink='',joining=false;
 let lastReceived=null,statsSignature='',renderSignature='',connectedVersion=0,decoderPromise=null,decodeQr=null,poll=null;
 const pollInterval=20000;
 const winnerChoices=new Map();
 const scannerCanvas=document.createElement('canvas');
 const status=message=>{byId('play-status').textContent=message||'';};
 const error=message=>{byId('play-error').textContent=message||'';byId('play-error').hidden=!message;};
 const scanError=message=>{byId('scan-error').textContent=message||'';byId('scan-error').hidden=!message;};
 const isMine=player=>Boolean(data&&player&&(player.id===data.player.id||player.code===data.player.code));
 const samePlayer=(first,second)=>Boolean(first&&second&&(first.id&&first.id===second.id||first.code&&first.code===second.code));
 const fullDuo=duo=>Boolean(duo?.id&&Array.isArray(duo.players)&&duo.players.length===2&&duo.players.every(player=>player&&(player.id||player.code))&&!samePlayer(...duo.players));
 const opposingDuoFound=()=>Boolean(fullDuo(data?.duo)&&fullDuo(connected?.duo)&&data.duo.id!==connected.duo.id&&data.duo.players.some(isMine)&&connected.duo.players.some(player=>samePlayer(player,connected.player))&&!data.duo.players.some(player=>connected.duo.players.some(opponent=>samePlayer(player,opponent))));
 const includesMe=players=>players.some(isMine);
 const ownedSide=match=>includesMe(match.teams.a)?'a':'b';
 const mutableButton=(label,callback,className='play-small-button')=>{const button=el('button',className,label);button.type='button';button.disabled=busy;button.addEventListener('click',callback);return button;};
 const api=async(path,body)=>window.sideoutService.request(path,body!==undefined?{method:'POST',body:JSON.stringify(body)}:{});
 const person=(player,delta=null)=>{
  const row=el('div','play-person'),canvas=el('canvas');canvas.width=120;canvas.height=144;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${player.name}'s pixel character`);
  const copy=el('div','play-person-copy');copy.append(el('strong','',`${player.name}${isMine(player)?' · You':''}`),el('span','play-rating',`${player.rating} MMR`));
  if(delta){copy.append(el('small',`play-rating-change${delta.delta<0?' negative':''}`,`${signed(delta.delta)} · ${delta.before} → ${delta.after}`));}
  row.append(canvas,copy);
  try{drawAvatar(canvas.getContext('2d'),52,133,1.25,{...(player.avatar||{}),name:player.name});}catch{canvas.setAttribute('aria-label',player.name);}
  return row;
 };
 const readConnected=()=>{
  if(!connected)return null;
  const code=connected.player.code,version=connectedVersion;
  // Read both players in parallel, but keep opponent latency off the stats display.
  return{code,version,promise:api(`/api/players/${encodeURIComponent(code)}`).then(value=>({value}),()=>({value:null}))};
 };
 const applyConnected=async read=>{
  if(!read)return;
  const {value}=await read.promise;
  // An explicit scan may have selected a different player while this read ran.
  if(read.version!==connectedVersion||connected?.player.code!==read.code)return;
  connected=value;render();
 };
 const applyData=async(next,connectedRead)=>{
  const hadSnapshot=data!==null,previousDuoId=data?.duo?.id;
  data=next;lastReceived=now();
  const stats={rating:next.player.rating,games:next.player.games,wins:next.player.wins,history:next.history||[]},signature=JSON.stringify(stats);
  if(signature!==statsSignature){statsSignature=signature;await onStats(stats);}
  render();
  if(hadSnapshot&&next.duo?.id&&next.duo.id!==previousDuoId){
   // A visual effect must never turn a successful pairing into an action error.
   try{Promise.resolve(onDuoFormed(next.player,next.duo)).catch(()=>{});}catch{}
  }
  await applyConnected(connectedRead===undefined?readConnected():connectedRead);
 };
 const setBusy=value=>{busy=value;renderSignature='';root.querySelectorAll('button').forEach(button=>button.disabled=value);root.setAttribute('aria-busy',String(value));};
 const runAction=async(path,body,message)=>{
  if(busy)return;
  error('');status('Saving your game…');setBusy(true);
  try{if(refreshing)await refreshing;await applyData(await api(path,body));status(message);}catch(problem){error(problem.message);status('');}
  finally{setBusy(false);render();}
 };
 function renderIdentity(){
  byId('play-identity-player').replaceChildren(person(data.player));
  byId('player-code').textContent=data.player.code;
  if(data.duo){duoInvite=null;showDuoQr=false;}
  const invite=showDuoQr&&duoInvite&&new Date(duoInvite.expiresAt).getTime()>now();
  qrLink=invite?duoLink(duoInvite.token):playerLink(data.player.code);
  if(invite)renderDuoQr(byId('player-qr'),duoInvite.token);else renderPlayerQr(byId('player-qr'),data.player.code);
  byId('player-qr').setAttribute('aria-label',invite?'Duo invitation QR. Scan to open Sideout and join this player.':'Player QR. Scan to open this player on the Sideout website.');
  byId('player-qr-label').textContent=invite?'YOUR DUO INVITE QR':'YOUR PLAYER QR';
  byId('player-qr-badge').textContent=invite?'ONE TEAMMATE':'OPEN SIDEOUT';
  byId('qr-link-output').value=qrLink;
  byId('create-duo-qr').disabled=busy||Boolean(data.duo);
  byId('create-duo-qr').title=data.duo?'Leave your current duo before inviting another teammate.':'';
  byId('create-duo-qr').textContent=duoInvite?'Create new duo invite QR ↗':'Create duo invite QR ↗';
  byId('show-player-qr').hidden=!invite;
  byId('player-qr-help').textContent=invite?`Your teammate scans this, signs in or signs up, and creates an avatar. You’ll become a duo automatically. One use · expires ${new Date(duoInvite.expiresAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}. Creating a new invite replaces this one.`:data.duo?'Scan this with a phone camera to open Sideout and find your team.':'Scan this to open Sideout. To pair automatically after signup, create a duo invite QR below.';
 }
 async function createDuoQr(){
  if(busy||!data||data.duo)return;
  error('');status('Creating your duo invite…');setBusy(true);
  try{
   if(refreshing)await refreshing;
   const link=await api('/api/duos/link',{});
   duoLink(link.token);if(!Number.isFinite(new Date(link.expiresAt).getTime()))throw new Error('The invite could not be created. Try again.');
   duoInvite=link;showDuoQr=true;status('Duo invite ready. The first eligible player who scans and signs in will join you.');
  }catch(problem){error(problem.message);status('');}
  finally{setBusy(false);render();}
 }
 async function joinDuo(token){
  if(joining||busy||!getAvatarCreated())return;
  joining=true;error('');status('Joining your teammate…');setBusy(true);
  try{
   if(refreshing)await refreshing;
   const next=await api('/api/duos/join',{token});await applyData(next);
   const url=new URL(window.location.href);url.searchParams.delete('duo');url.searchParams.delete('player');url.hash='play';window.history.replaceState(null,'',url);
   deepLinkHandled=true;status('You’re a duo! Your teammate is ready below. Scan another duo to find a game.');
  }catch(problem){error(problem.message);status('');}
  finally{joining=false;setBusy(false);render();}
 }
 function renderConnected(){
  const target=byId('connected-player');target.replaceChildren();target.hidden=!connected;
  if(!connected||!data)return;
  const player=connected.player;target.append(el('div','eyebrow','PLAYER FOUND'),person(player));
  if(isMine(player)){target.append(el('p','play-helper','This is your player QR. Scan another player to connect.'));return;}
  const actions=el('div','play-actions');
  const alreadyPartner=data.duo?.players.some(partner=>partner.id===player.id);
  const invite=mutableButton('Invite as my duo ↗',()=>runAction('/api/duos',{playerCode:player.code},`Duo invite sent to ${player.name}. They can accept it in Connect & play.`),'button play-accent');
  if(data.duo||connected.duo){invite.disabled=true;invite.title=alreadyPartner?'This player is already your duo.':'Both players must be free to form a duo.';}
  actions.append(invite);
  const challenge=mutableButton('Challenge their duo ↗',()=>runAction('/api/matches',{playerCode:player.code},'Challenge sent. A player on the other duo can accept it.'),'button button-black');
  if(!data.duo||!connected.duo||alreadyPartner){challenge.disabled=true;challenge.title='Both sides need a duo to play a doubles match.';}
  actions.append(challenge);target.append(actions);
  if(alreadyPartner)target.append(el('p','play-helper',`${player.name} is already your teammate.`));
  else if(data.duo&&connected.duo)target.append(el('p','play-duo-meta',`Your duo: ${average(data.duo.players)} MMR · Their duo: ${average(connected.duo.players)} MMR`));
  else if(!data.duo)target.append(el('p','play-helper','Form your duo first, then scan a player from another duo to challenge them.'));
  else target.append(el('p','play-helper','This player needs a teammate before you can challenge their duo.'));
 }
 function renderDuo(){
  const target=byId('my-duo');target.replaceChildren();
  if(data.duo){
   const roster=el('div','play-duo-roster');data.duo.players.forEach(player=>roster.append(person(player)));target.append(roster);
   const rating=el('div','play-team-average');rating.append(el('span','','TEAM AVERAGE'),el('strong','',`${average(data.duo.players)} MMR`));target.append(rating);
   const actions=el('div','play-actions');actions.append(mutableButton('Leave this duo',()=>runAction('/api/duos/leave',{},'You left the duo. Scan a player to find your next teammate.')));target.append(actions);
  }else{const empty=el('p','play-empty');empty.append(el('strong','','Two is a team.'),document.createTextNode(' Create a duo invite QR for a teammate to scan and join automatically. Player-code invitations still need the other player to accept.'));target.append(empty);}
  const invitations=byId('duo-invitations');invitations.replaceChildren();
  for(const invitation of data.invitations||[]){
   const card=el('div','duo-invite');card.append(el('div','eyebrow','DUO INVITATION'),person(invitation.from));
   const actions=el('div','play-actions');actions.append(mutableButton('Accept duo ↗',()=>runAction(`/api/duos/${encodeURIComponent(invitation.id)}/respond`,{accept:true},`You and ${invitation.from.name} are a duo. Scan another team to play.`),'button play-accent'),mutableButton('Decline',()=>runAction(`/api/duos/${encodeURIComponent(invitation.id)}/respond`,{accept:false},'Duo invitation declined.')));card.append(actions);invitations.append(card);
  }
 }
 function renderMatch(match){
  const card=el('article','play-match'),top=el('div','play-match-top');
  const labels={pending:'CHALLENGE SENT',active:'READY TO PLAY',completed:'RESULT RECORDED',cancelled:'CANCELLED'};
  top.append(el('span',`play-match-status ${match.status}`,labels[match.status]||match.status),el('span','',shortDate(match.completedAt||match.createdAt)));card.append(top);
  const teams=el('div','play-match-teams');
  for(const side of ['a','b']){
   if(side==='b')teams.append(el('div','play-versus','VS'));
   const team=el('div','play-match-team'),label=el('div','play-team-label'),players=match.teams[side];
   label.append(el('span','',includesMe(players)?'YOUR DUO':'OTHER DUO'),el('span','',`${average(players)} avg. MMR`));team.append(label);
   for(const player of players)team.append(person(player,(match.deltas||[]).find(delta=>delta.playerId===player.id)));
   if(match.status==='completed')team.append(el('p','play-gain',match.winnerSide===side?'WINNERS ↗':'GOOD GAME. NEXT ONE.'));
   else if(match.preview?.[side]!=null)team.append(el('p','play-gain',`${signed(match.preview[side])} MMR each if this duo wins`));
   teams.append(team);
  }
  card.append(teams);
  const actions=el('div','play-match-actions');
  if(match.status==='pending'){
   const sentByMySide=match.teams[ownedSide(match)].some(player=>player.id===match.createdBy);
   actions.append(el('p','',sentByMySide?'Waiting for a player on the other duo to accept your challenge.':'Your duo has been challenged. Accept when all four players are ready.'));
   const buttons=el('div','play-actions');
   if(sentByMySide)buttons.append(mutableButton('Cancel challenge',()=>runAction(`/api/matches/${encodeURIComponent(match.id)}/cancel`,{},'Challenge cancelled.')));
   else buttons.append(mutableButton('Accept match ↗',()=>runAction(`/api/matches/${encodeURIComponent(match.id)}/respond`,{accept:true},'Match accepted. Play your game, then record the winner.'),'button play-accent'),mutableButton('Decline',()=>runAction(`/api/matches/${encodeURIComponent(match.id)}/respond`,{accept:false},'Challenge declined.')));
   actions.append(buttons);
  }else if(match.status==='active'){
   const form=el('form','play-result-form'),label=el('label','', 'Who won this match?'),select=el('select');select.id=`winner-${match.id}`;select.required=true;select.disabled=busy;label.htmlFor=select.id;
   const empty=el('option','','Choose the winning duo');empty.value='';select.append(empty);
   for(const side of ['a','b']){const option=el('option','',`${includesMe(match.teams[side])?'Your duo':'Other duo'} · ${sideName(match.teams[side])}`);option.value=side;select.append(option);}
   select.value=winnerChoices.get(match.id)||'';select.addEventListener('change',()=>winnerChoices.set(match.id,select.value));
   const row=el('div'),button=el('button','button button-black','Record result ↗');button.type='submit';button.disabled=busy;row.append(select,button);form.append(label,row,el('p','play-result-note','One submission updates all four players immediately. Check the winner before recording.'));
   form.addEventListener('submit',event=>{event.preventDefault();if(!select.value||busy)return;runAction(`/api/matches/${encodeURIComponent(match.id)}/result`,{winnerSide:select.value},'Result recorded. All four player ratings have been updated.');});actions.append(form);
   const cancellation=el('div','play-actions');cancellation.append(mutableButton('Cancel game',()=>runAction(`/api/matches/${encodeURIComponent(match.id)}/cancel`,{},'Game cancelled. All four ratings stay the same.')));actions.append(cancellation,el('p','play-result-note','Game not played? Cancel it without changing ratings.'));
  }else if(match.status==='completed'){
   const reporter=[...match.teams.a,...match.teams.b].find(player=>player.id===match.reportedBy);
   actions.append(el('p','',`Recorded by ${reporter?.name||'a player'}${shortDate(match.completedAt)?` · ${shortDate(match.completedAt)}`:''}.`));
  }else actions.append(el('p','','This match was cancelled. Scan a duo to start another.'));
  card.append(actions);return card;
 }
 function renderMatches(){
  const target=byId('play-matches');target.replaceChildren();
  const matches=[...new Map([...(data.matches||[]),...(data.history||[])].map(match=>[match.id,match])).values()];
  const order={active:0,pending:1,completed:2,cancelled:3};matches.sort((a,b)=>(order[a.status]??4)-(order[b.status]??4)||new Date(b.completedAt||b.createdAt)-new Date(a.completedAt||a.createdAt));
  const waiting=matches.filter(match=>['active','pending'].includes(match.status)).length;byId('play-match-count').textContent=waiting?`${waiting} open ${waiting===1?'match':'matches'}`:'';
  if(!matches.length)target.append(el('p','play-empty','Your next game starts with a scan. Form a duo, then challenge another duo here.'));
  else matches.slice(0,24).forEach(match=>target.append(renderMatch(match)));
 }
 function render(){
  if(!data)return;
  if(data.duo){duoInvite=null;showDuoQr=false;}
  const signature=JSON.stringify([data,connected,duoInvite,showDuoQr,busy,duoInvite?new Date(duoInvite.expiresAt).getTime()>now():false]);
  if(signature===renderSignature)return;
  renderSignature=signature;renderIdentity();renderConnected();renderDuo();renderMatches();
 }
 async function refresh({quiet=false,maxAge=0}={}){
  if(!getAvatarCreated()||busy&&data)return;
  if(refreshing)return refreshing;
  if(maxAge>0&&lastReceived!==null&&now()-lastReceived<maxAge)return;
  if(!quiet){error('');status('Checking your court connections…');}
  byId('refresh-play').disabled=true;
  const connectedRead=readConnected();
  refreshing=(async()=>{try{await applyData(await api('/api/play'),connectedRead);if(!quiet)status('Connections up to date.');}catch(problem){if(!quiet){error(problem.message);status('');}}finally{refreshing=null;byId('refresh-play').disabled=busy;}})();
  return refreshing;
 }
 async function lookup(input){
  if(lookingUp||busy)return;
  const code=parsePlayerCode(input);if(!code){error('Use a player code or a Sideout player QR link.');return;}
  error('');status('Finding your player…');lookingUp=true;++connectedVersion;byId('find-player').disabled=true;
  try{
   if(!data)await refresh();if(!data)throw new Error('Your player could not load. Refresh your connections and try again.');
   connected=await api(`/api/players/${encodeURIComponent(code)}`);render();status(isMine(connected.player)?'That QR belongs to you.':`${connected.player.name} found. Choose teammate or opponent.`);
   if(opposingDuoFound()){
    // Only an explicit lookup shows the matchup; refreshes keep the normal challenge flow.
    try{Promise.resolve(onOpponentFound(data.player,data.duo,connected.duo)).catch(()=>{});}catch{}
   }
  }
  catch(problem){connected=null;render();error(problem.message);status('');}
  finally{lookingUp=false;byId('find-player').disabled=busy;}
 }
 async function handleDeepLink(){
  if(deepLinkHandled||!getAvatarCreated())return;
  const url=new URL(window.location.href),token=parseDuoInvite(url.href);
  if(url.searchParams.has('duo')){
   deepLinkHandled=true;onNavigate('play');
   if(!token){error('This duo invite link is invalid. Ask your teammate to create a new duo QR.');return;}
   await joinDuo(token);return;
  }
  const hashInput=url.hash.startsWith('#connect/')?url.hash.slice(9):null,input=url.searchParams.get('player')||hashInput;
  if(!input)return;
  deepLinkHandled=true;url.searchParams.delete('player');url.hash='#play';window.history.replaceState(null,'',url);onNavigate('play');
  if(!data)await refresh({quiet:true});await lookup(input);
 }
 function stopCamera(){scanGeneration++;if(scanTimer)clearTimeout(scanTimer);scanTimer=null;if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;}
 function closeScanner(){stopCamera();if(dialog.open)dialog.close();}
 function getQrDecoder(){
  if(!decoderPromise)decoderPromise=Promise.resolve().then(loadQrDecoder).catch(problem=>{decoderPromise=null;throw problem;});
  return decoderPromise;
 }
 async function foundCode(text){const token=parseDuoInvite(text);if(token){closeScanner();onNavigate('play');await joinDuo(token);return true;}const code=parsePlayerCode(text);if(!code){scanError('This QR is not a Sideout player or duo invite link. Try their Sideout QR.');return false;}closeScanner();byId('connect-player-code').value=code;onNavigate('play');await lookup(code);return true;}
 async function scanFrame(generation){
  if(generation!==scanGeneration||!dialog.open)return;
  try{if(video.readyState>=2&&video.videoWidth){const ratio=Math.min(1,640/video.videoWidth);scannerCanvas.width=Math.round(video.videoWidth*ratio);scannerCanvas.height=Math.round(video.videoHeight*ratio);const ctx=scannerCanvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,scannerCanvas.width,scannerCanvas.height);const result=decodeQr(ctx.getImageData(0,0,scannerCanvas.width,scannerCanvas.height));if(result&&await foundCode(result))return;}}
  catch{scanMessage.textContent='Keep the QR centered, or choose a QR photo below.';}
  if(generation===scanGeneration&&dialog.open)scanTimer=setTimeout(()=>scanFrame(generation),200);
 }
 async function openScanner(){
  if(busy)return;scanError('');byId('scan-help').textContent='Point your camera at the other player’s QR code.';scanMessage.textContent='Starting your camera…';byId('scan-file').value='';dialog.showModal();const generation=++scanGeneration;
  if(!navigator.mediaDevices?.getUserMedia){scanMessage.textContent='Camera scanning needs a secure website. Choose a QR photo or paste their player code.';return;}
  try{const camera=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});if(generation!==scanGeneration||!dialog.open){camera.getTracks().forEach(track=>track.stop());return;}stream=camera;video.srcObject=camera;const [,decoder]=await Promise.all([video.play(),getQrDecoder()]);if(generation!==scanGeneration||!dialog.open)return;decodeQr=decoder;scanMessage.textContent='Hold their player QR inside the frame.';scanFrame(generation);}
  catch(problem){if(generation!==scanGeneration||!dialog.open)return;stopCamera();scanMessage.textContent=problem.name==='NotAllowedError'?'Camera access was not allowed. Choose a QR photo or paste their player code.':'Your camera could not open. Choose a QR photo or paste their player code.';}
 }
 function openPhoto(){if(busy)return;stopCamera();scanError('');byId('scan-help').textContent='Choose a photo of the other player’s QR code.';scanMessage.textContent='Choose a clear QR photo using the button below.';byId('scan-file').value='';dialog.showModal();}
 async function scanFile(file){
  if(!file)return;scanError('');scanMessage.textContent='Reading your QR photo…';stopCamera();const generation=scanGeneration;
  if(file.size>12*1024*1024){scanError('Choose a QR photo smaller than 12 MB.');return;}
  let image;
  try{const decoder=await getQrDecoder();if(generation!==scanGeneration||!dialog.open)return;image=await createImageBitmap(file);if(generation!==scanGeneration||!dialog.open)return;const ratio=Math.min(1,1200/Math.max(image.width,image.height));scannerCanvas.width=Math.max(1,Math.round(image.width*ratio));scannerCanvas.height=Math.max(1,Math.round(image.height*ratio));const ctx=scannerCanvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,scannerCanvas.width,scannerCanvas.height);const text=decoder(ctx.getImageData(0,0,scannerCanvas.width,scannerCanvas.height));if(!text||!await foundCode(text)){if(generation!==scanGeneration||!dialog.open)return;scanError(text?'This QR is not a Sideout player code.':'No player QR found. Try a clear photo with the whole QR visible.');scanMessage.textContent='Choose another QR photo, or paste their player code.';}}
  catch{if(generation!==scanGeneration||!dialog.open)return;scanError('This photo could not be read. Try another image or paste their player code.');scanMessage.textContent='Choose another QR photo, or paste their player code.';}
  finally{image?.close();}
 }
 byId('connect-player-form').addEventListener('submit',event=>{event.preventDefault();const input=byId('connect-player-code').value,token=parseDuoInvite(input);if(token)joinDuo(token);else lookup(input);});
 byId('refresh-play').addEventListener('click',async()=>{await refresh();if(new URL(window.location.href).searchParams.has('duo')){deepLinkHandled=false;await handleDeepLink();}});
 byId('create-duo-qr').addEventListener('click',createDuoQr);
 byId('show-player-qr').addEventListener('click',()=>{showDuoQr=false;render();});
 byId('copy-qr-link').addEventListener('click',async()=>{if(!qrLink)return;try{await navigator.clipboard.writeText(qrLink);status(parseDuoInvite(qrLink)?'Duo invite link copied. Send it to your teammate.':'Player link copied. It opens the Sideout website.');}catch{const input=byId('qr-link-output');input.hidden=false;input.focus();input.select();status('Select and copy the website link below your QR.');}});
 byId('copy-player-code').addEventListener('click',async()=>{if(!data)return;try{await navigator.clipboard.writeText(data.player.code);status('Player code copied. Share it with your court crew.');}catch{status(`Your player code is ${data.player.code}. Select and copy it above.`);}});
 byId('scan-player').addEventListener('click',openScanner);byId('use-player-photo').addEventListener('click',openPhoto);byId('scan-close').addEventListener('click',closeScanner);
 dialog.addEventListener('close',stopCamera);dialog.addEventListener('cancel',stopCamera);
 byId('scan-file').addEventListener('change',event=>scanFile(event.target.files?.[0]));
 const activePage=()=>document.querySelector('.page.active')?.id;
 const visible=()=>['profile','rating','play'].includes(activePage())&&getAvatarCreated()&&!document.hidden;
 const stopPolling=()=>{if(poll!==null){clearInterval(poll);poll=null;}};
 const startPolling=()=>{if(visible()&&poll===null)poll=setInterval(()=>{if(visible()&&!busy&&!lookingUp&&!dialog.open)refresh({quiet:true});},pollInterval);};
 window.addEventListener('pagehide',()=>{closeScanner();stopPolling();});
 window.addEventListener('pageshow',event=>{if(event.persisted){startPolling();if(visible())refresh({quiet:true,maxAge:pollInterval});}});
 document.addEventListener('visibilitychange',()=>{stopPolling();if(document.hidden)closeScanner();else{startPolling();if(visible())refresh({quiet:true,maxAge:pollInterval});}});
 async function handleNavigation(page){
  if(page!=='play')closeScanner();
  if(!['profile','rating','play'].includes(page)){stopPolling();return;}
  startPolling();await refresh({quiet:Boolean(data),maxAge:pollInterval});
  if(page==='play')await handleDeepLink();
 }
 startPolling();
 await refresh();await handleDeepLink();
 return{refresh,handleNavigation,closeScanner};
}
