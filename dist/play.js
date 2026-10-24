import {drawAvatar} from './pixel-player.js';
import {renderPlayerQr,renderDuoQr,parsePlayerCode,playerLink,duoLink,parseDuoInvite} from './qr.js';
import {normalizeMatchFormat,validateMatchScores} from './match-format.js';
import {parseRoomLink} from './player-links.js';
import {initRooms} from './rooms.js';

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
 const invitationDialog=byId('duo-invitation-dialog'),invitationError=byId('duo-invitation-error');
 const settingsDialog=byId('match-settings-dialog');
 const playerDialog=byId('found-player-dialog');
 let data=null,connected=null,busy=false,refreshing=null,stream=null,scanTimer=null,scanGeneration=0,lookingUp=false,deepLinkHandled=false;
 let duoInvite=null,showDuoQr=false,qrLink='',joining=false;
 let lastReceived=null,statsSignature='',renderSignature='',connectedVersion=0,decoderPromise=null,decodeQr=null,poll=null;
 const pollInterval=20000;
 const winnerChoices=new Map();
 const scoreDrafts=new Map(),scoreErrors=new Map();
 let challengeTarget=null,openingSettings=false;
 let lastScoreFocusId=null,scoreRetryFocusId=null;
 const dismissedInvitations=new Set();
 let invitationSignature='',presentedInvitations=[];
 const scannerCanvas=document.createElement('canvas');
 const status=message=>{byId('play-status').textContent=message||'';byId('found-player-status').textContent=message||'';};
 const error=message=>{byId('play-error').textContent=message||'';byId('play-error').hidden=!message;if(invitationDialog.open||!message){invitationError.textContent=message||'';invitationError.hidden=!message;}const popupError=byId('found-player-error');popupError.textContent=message||'';popupError.hidden=!message;};
 const scanError=message=>{byId('scan-error').textContent=message||'';byId('scan-error').hidden=!message;};
 const isMine=player=>Boolean(data&&player&&(player.id===data.player.id||player.code===data.player.code));
 const samePlayer=(first,second)=>Boolean(first&&second&&(first.id&&first.id===second.id||first.code&&first.code===second.code));
 const fullDuo=duo=>Boolean(duo?.id&&Array.isArray(duo.players)&&duo.players.length===2&&duo.players.every(player=>player&&(player.id||player.code))&&!samePlayer(...duo.players));
 const opposingDuoFound=()=>Boolean(fullDuo(data?.duo)&&fullDuo(connected?.duo)&&data.duo.id!==connected.duo.id&&data.duo.players.some(isMine)&&connected.duo.players.some(player=>samePlayer(player,connected.player))&&!data.duo.players.some(player=>connected.duo.players.some(opponent=>samePlayer(player,opponent))));
 const includesMe=players=>players.some(isMine);
 const ownedSide=match=>includesMe(match.teams.a)?'a':'b';
 const mutableButton=(label,callback,className='play-small-button')=>{const button=el('button',className,label);button.type='button';button.disabled=busy;button.addEventListener('click',callback);return button;};
 const api=async(path,body)=>window.sideoutService.request(path,body!==undefined?{method:'POST',body:JSON.stringify(body)}:{});
 const rooms=initRooms({onMatch:()=>refresh(),onStatus:status});
 const person=(player,delta=null)=>{
  const row=el('div','play-person'),canvas=el('canvas');canvas.width=120;canvas.height=144;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${player.name}'s pixel character`);
  const copy=el('div','play-person-copy');copy.append(el('strong','',`${player.name}${isMine(player)?' · You':''}`),el('span','play-rating',`${player.rating} MMR`));if(player.isVerified===true)copy.append(el('span','player-verified','✓ Verified'));
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
 const setBusy=value=>{busy=value;renderSignature='';for(const container of [root,invitationDialog,settingsDialog,playerDialog]){for(const tag of ['button','input','select'])container.querySelectorAll(tag).forEach(control=>{if(!control.closest?.('#match-room'))control.disabled=value;});container.setAttribute('aria-busy',String(value));}};
 const runAction=async(path,body,message,onProblem=()=>{})=>{
  if(busy)return;
  error('');status('Saving your game…');setBusy(true);
  try{if(refreshing)await refreshing;await applyData(await api(path,body));await rooms?.refresh();status(message);if(path==='/api/duos')closeFoundPlayer(true);}catch(problem){error(problem.message);onProblem(problem.message);status('');}
  finally{setBusy(false);render();if(invitationDialog.open)byId('duo-invitations').querySelectorAll('button')[0]?.focus();}
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
   deepLinkHandled=true;status('You’re a duo! Your teammate is ready below. Open a match room to choose your team.');
  }catch(problem){error(problem.message);status('');}
  finally{joining=false;setBusy(false);render();}
 }
 async function requestFriend(player){
  if(busy||!player||isMine(player))return;
  error('');status('Sending your friend request…');setBusy(true);
  try{
   if(refreshing)await refreshing;
   const friends=await api('/api/friends/request',{playerCode:player.code});
   status(friends.friends?.some(item=>item.player.code===player.code)?"You're already friends. View your crew in Friends.":'Friend request sent. They can accept it in Friends.');closeFoundPlayer(true);if(document.querySelector('.page.active')?.id==='play')onNavigate('friends');
  }catch(problem){error(problem.message||'Could not send your friend request. Try again.');status('');}
  finally{setBusy(false);render();}
 }
 function renderConnected(){
  const target=byId('connected-player'),reopen=byId('show-found-player');
  const focusedIndex=playerDialog.open?[...target.querySelectorAll('button')].indexOf(document.activeElement):-1;
  target.replaceChildren();target.hidden=!connected;reopen.hidden=!connected;
  if(!connected||!data){closeFoundPlayer(true);return;}
  reopen.textContent=`View ${connected.player.name}`;
  const player=connected.player;target.append(el('div','eyebrow','PLAYER FOUND'),person(player));
  if(player.code)target.append(el('p','play-helper',player.code));
  if(Number.isInteger(player.games)&&Number.isInteger(player.wins))target.append(el('p','play-helper',`${player.games} games played · ${player.wins} wins`));
  if(isMine(player)){target.append(el('p','play-helper','This is your player QR. Share a room QR to play.'));return;}
  const actions=el('div','play-actions');
  actions.append(mutableButton('Add friend ↗',()=>requestFriend(player),'button button-outline'));
  const alreadyPartner=data.duo?.players.some(partner=>partner.id===player.id);
  const invite=mutableButton('Invite as my duo ↗',()=>runAction('/api/duos',{playerCode:player.code},`Duo invite sent to ${player.name}. It will pop up on their screen while they’re in Sideout.`),'button play-accent');
  if(data.duo||connected.duo){invite.disabled=true;invite.title=alreadyPartner?'This player is already your duo.':'Both players must be free to form a duo.';}
  actions.append(invite);
  const challenge=mutableButton('Challenge their duo ↗',()=>openMatchSettings(player),'button button-black');
  if(!data.duo||!connected.duo||alreadyPartner){challenge.disabled=true;challenge.title='Both sides need a duo to play a doubles match.';}
  if(!rooms)actions.append(challenge);target.append(actions);
  if(alreadyPartner)target.append(el('p','play-helper',`${player.name} is already your teammate.`));
  else if(data.duo&&connected.duo)target.append(el('p','play-duo-meta',`Your duo: ${average(data.duo.players)} MMR · Their duo: ${average(connected.duo.players)} MMR`));
  else if(connected.duo)target.append(el('p','play-helper','This player is already in a duo. Find an available player to team up.'));
  else if(data.duo)target.append(el('p','play-helper','You already have a duo. Leave it before inviting another teammate.'));
  else target.append(el('p','play-helper','Both players are available. Invite this player as your duo.'));
  if(focusedIndex>=0)target.querySelectorAll('button')[focusedIndex]?.focus();
 }
 function closeFoundPlayer(force=false){if(force||!busy)playerDialog.close();}
 function showFoundPlayer(){
  if(!connected||busy||document.hidden||!getAvatarCreated()||activePage()!=='play'||playerDialog.open||document.querySelector('dialog[open]'))return;
  playerDialog.showModal();
 }
 function closeMatchSettings(){if(!busy){challengeTarget=null;settingsDialog.close();}}
 function settingsError(message){byId('match-settings-error').textContent=message||'';byId('match-settings-error').hidden=!message;}
 function openMatchSettings(player){
  if(busy||!opposingDuoFound()||settingsDialog.open)return;
  challengeTarget={code:player.code,ownDuoId:data.duo.id,opponentDuoId:connected.duo.id};settingsError('');
  byId('match-settings-best-of').value=byId('match-settings-best-of').value||'3';
  byId('match-settings-points').value=byId('match-settings-points').value||'11';
  byId('match-settings-win-by').value=byId('match-settings-win-by').value||'2';
  openingSettings=true;
  try{closeFoundPlayer(true);settingsDialog.showModal();}finally{openingSettings=false;}
 }
 async function sendChallenge(event){
  event.preventDefault();if(busy||!challengeTarget)return;
  const target=challengeTarget;settingsError('');error('');
  let format;
  try{format=normalizeMatchFormat({bestOf:Number(byId('match-settings-best-of').value),pointsToWin:Number(byId('match-settings-points').value),winBy:Number(byId('match-settings-win-by').value)});}catch(problem){settingsError(problem.message);return;}
  setBusy(true);
  try{
   if(refreshing)await refreshing;
   if(!opposingDuoFound()||connected.player.code!==target.code||data.duo.id!==target.ownDuoId||connected.duo.id!==target.opponentDuoId)throw new Error('The duos changed. Close this window and find the other duo again.');
   await applyData(await api('/api/matches',{playerCode:target.code,format}));
   challengeTarget=null;settingsDialog.close();status('Challenge sent with your match settings. The other duo can accept it in the popup.');
  }catch(problem){settingsError(problem.message);}
  finally{setBusy(false);render();}
 }
 function renderDuo(){
  const target=byId('my-duo')||byId('duo-actions');if(!target)return;target.replaceChildren();
  const compact=target.id==='duo-actions';
  if(data.duo){
   if(!compact){
   const roster=el('div','play-duo-roster');data.duo.players.forEach(player=>roster.append(person(player)));target.append(roster);
   const rating=el('div','play-team-average');rating.append(el('span','','TEAM AVERAGE'),el('strong','',`${average(data.duo.players)} MMR`));target.append(rating);
   }
   const actions=el('div','play-actions');actions.append(mutableButton('Leave this duo',()=>runAction('/api/duos/leave',{},'You left the duo. Scan a player to find your next teammate.')));target.append(actions);
  }else if(!compact){const empty=el('p','play-empty');empty.append(el('strong','','Two is a team.'),document.createTextNode(' Create a duo invite QR for a teammate to scan and join automatically. Player-code invitations still need the other player to accept.'));target.append(empty);}
  const pending=pendingInvitations();
  if(pending.length){const actions=el('div','play-actions');actions.append(mutableButton('View duo invitation',()=>showInvitations(true)));target.append(el('p','play-helper',`${pending.length} pending duo invitation${pending.length===1?'':'s'}.`),actions);}
 }
 function pendingInvitations(){return data&&!data.duo?(data.invitations||[]).filter(invitation=>invitation.id&&invitation.from&&(!invitation.expiresAt||new Date(invitation.expiresAt).getTime()>now())):[];}
 function pendingChallenges(){
  return(data?.matches||[]).filter(match=>{
   if(!match?.id||match.status!=='pending'||!fullDuo({id:match.id,players:match.teams?.a})||!fullDuo({id:match.id,players:match.teams?.b}))return false;
   if(!includesMe(match.teams.a)&&!includesMe(match.teams.b))return false;
   const ownSide=ownedSide(match),otherSide=ownSide==='a'?'b':'a';
   if(match.teams[ownSide].some(player=>player.id===match.createdBy)||!match.teams[otherSide].some(player=>player.id===match.createdBy))return false;
   const expiresAt=match.expiresAt??(match.createdAt!=null?new Date(match.createdAt).getTime()+86400000:null);
   return expiresAt==null||new Date(expiresAt).getTime()>now();
  });
 }
 function pendingRequests(){return[...pendingInvitations().map(invitation=>({id:`duo:${invitation.id}`,invitation})),...pendingChallenges().map(match=>({id:`match:${match.id}`,match}))];}
 function dismissInvitations(){
  if(busy)return;
  presentedInvitations.forEach(id=>dismissedInvitations.add(id));invitationDialog.close();
 }
 function showInvitations(force=false){
  if(openingSettings)return;
  const pending=pendingRequests();
  if(!pending.length){if(invitationDialog.open)invitationDialog.close();return;}
  if(document.hidden||!getAvatarCreated())return;
  if(!invitationDialog.open){
   if(busy||!force&&pending.every(invitation=>dismissedInvitations.has(invitation.id)))return;
   const otherDialog=document.querySelector('dialog[open]');if(otherDialog&&otherDialog!==invitationDialog)return;
   invitationError.textContent='';invitationError.hidden=true;
   invitationDialog.showModal();
  }
  presentedInvitations=pending.map(invitation=>invitation.id);
 }
 function renderInvitations(){
  const pending=pendingRequests(),signature=JSON.stringify(pending);
  if(signature!==invitationSignature){
   const invitations=byId('duo-invitations');
   const focusedIndex=invitationDialog.open?[...invitations.querySelectorAll('button')].indexOf(document.activeElement):-1,focusedId=presentedInvitations[Math.floor(focusedIndex/2)];
   invitationSignature=signature;
   invitations.replaceChildren();
   const challengesOnly=pending.length>0&&pending.every(request=>request.match),hasChallenges=pending.some(request=>request.match);
   byId('duo-invitation-heading').textContent=challengesOnly?'You’ve been challenged.':hasChallenges?'Ready to play?':'Team up?';
   byId('duo-invitation-description').textContent=challengesOnly?'Another duo is ready for a game. Accept when all four players are ready.':hasChallenges?'Your next teammate or next game is waiting. Respond below.':'You’ve been invited to a duo. Pick your teammate and get ready for your next game.';
   for(const request of pending){
    if(request.match){invitations.append(renderMatch(request.match,{popup:true}));continue;}
    const invitation=request.invitation;
    const card=el('div','duo-invite');card.append(el('div','eyebrow','DUO INVITATION'),person(invitation.from));
    const actions=el('div','play-actions');actions.append(mutableButton('Accept duo ↗',()=>runAction(`/api/duos/${encodeURIComponent(invitation.id)}/respond`,{accept:true},`You and ${invitation.from.name} are a duo. Open a match room to play.`),'button play-accent'),mutableButton('Decline',()=>runAction(`/api/duos/${encodeURIComponent(invitation.id)}/respond`,{accept:false},'Duo invitation declined.')));card.append(actions);invitations.append(card);
   }
   if(focusedIndex>=0&&!busy){const index=pending.findIndex(invitation=>invitation.id===focusedId);invitations.querySelectorAll('button')[index<0?0:index*2+focusedIndex%2]?.focus();}
  }
  invitationDialog.querySelectorAll('button').forEach(button=>button.disabled=busy);
  showInvitations();
 }
 function renderMatch(match,{popup=false}={}){
  const card=el('article','play-match'),top=el('div','play-match-top');
  const labels={pending:popup?'DUO CHALLENGE':'CHALLENGE SENT',active:'READY TO PLAY',completed:'RESULT RECORDED',cancelled:'CANCELLED'};
  top.append(el('span',`play-match-status ${match.status}`,labels[match.status]||match.status),el('span','',shortDate(match.completedAt||match.createdAt)));card.append(top);
  if(match.format)card.append(el('p','play-match-format',`${match.format.bestOf===1?'1 set':`Best of ${match.format.bestOf}`} · ${match.format.pointsToWin} points · Win by ${match.format.winBy}`));
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
  if(match.scores?.length){
   const scores=el('div','play-set-results');scores.append(el('p','',`${match.format?.bestOf===1?'Final score':'Set scores'} · ${includesMe(match.teams.a)?'Your duo':'Other duo'} / ${includesMe(match.teams.b)?'Your duo':'Other duo'}`));
   match.scores.forEach((score,index)=>scores.append(el('span','',`${match.format?.bestOf===1?'Score':`Set ${index+1}`} · ${score.a}–${score.b}`)));card.append(scores);
  }
  const actions=el('div','play-match-actions');
  if(match.status==='pending'){
   const sentByMySide=match.teams[ownedSide(match)].some(player=>player.id===match.createdBy);
   actions.append(el('p','',sentByMySide?'Waiting for a player on the other duo to accept your challenge.':'Your duo has been challenged. Accept when all four players are ready.'));
   const buttons=el('div','play-actions');
   if(sentByMySide)buttons.append(mutableButton('Cancel challenge',()=>runAction(`/api/matches/${encodeURIComponent(match.id)}/cancel`,{},'Challenge cancelled.')));
   else if(popup)buttons.append(mutableButton('Accept match ↗',()=>runAction(`/api/matches/${encodeURIComponent(match.id)}/respond`,{accept:true},'Match accepted. Play your game, then record the winner.'),'button play-accent'),mutableButton('Decline',()=>runAction(`/api/matches/${encodeURIComponent(match.id)}/respond`,{accept:false},'Challenge declined.')));
   else if(pendingChallenges().some(challenge=>challenge.id===match.id))buttons.append(mutableButton('View challenge',()=>showInvitations(true),'button play-accent'));
   actions.append(buttons);
  }else if(match.status==='active'){
   if(match.format)actions.append(renderScoreForm(match));
   else{
   const form=el('form','play-result-form'),label=el('label','', 'Who won this match?'),select=el('select');select.id=`winner-${match.id}`;select.required=true;select.disabled=busy;label.htmlFor=select.id;
   const empty=el('option','','Choose the winning duo');empty.value='';select.append(empty);
   for(const side of ['a','b']){const option=el('option','',`${includesMe(match.teams[side])?'Your duo':'Other duo'} · ${sideName(match.teams[side])}`);option.value=side;select.append(option);}
   select.value=winnerChoices.get(match.id)||'';select.addEventListener('change',()=>winnerChoices.set(match.id,select.value));
   const row=el('div'),button=el('button','button button-black','Record result ↗');button.type='submit';button.disabled=busy;row.append(select,button);form.append(label,row,el('p','play-result-note','One submission updates all four players immediately. Check the winner before recording.'));
   form.addEventListener('submit',event=>{event.preventDefault();if(!select.value||busy)return;runAction(`/api/matches/${encodeURIComponent(match.id)}/result`,{winnerSide:select.value},'Result recorded. All four player ratings have been updated.');});actions.append(form);
   }
   const cancellation=el('div','play-actions');cancellation.append(mutableButton('Cancel game',()=>runAction(`/api/matches/${encodeURIComponent(match.id)}/cancel`,{},'Game cancelled. All four ratings stay the same.')));actions.append(cancellation,el('p','play-result-note','Game not played? Cancel it without changing ratings.'));
  }else if(match.status==='completed'){
   const reporter=[...match.teams.a,...match.teams.b].find(player=>player.id===match.reportedBy);
   actions.append(el('p','',`Recorded by ${reporter?.name||'a player'}${shortDate(match.completedAt)?` · ${shortDate(match.completedAt)}`:''}.`));
  }else actions.append(el('p','','This match was cancelled. Scan a duo to start another.'));
  card.append(actions);return card;
 }
 function renderScoreForm(match){
  const format=normalizeMatchFormat(match.format),form=el('form','play-result-form play-score-form');form.id=`result-${match.id}`;form.noValidate=true;
  let draft=scoreDrafts.get(match.id);
  if(!draft){draft=Array.from({length:format.bestOf},()=>({a:'',b:''}));scoreDrafts.set(match.id,draft);}
  const problem=el('p','play-error play-score-error',scoreErrors.get(match.id)||'');problem.id=`score-error-${match.id}`;problem.hidden=!scoreErrors.has(match.id);problem.setAttribute('role','alert');
  const summary=el('p','play-score-summary');summary.setAttribute('role','status');summary.setAttribute('aria-live','polite');
  const readScores=()=>{
   const scores=[];let blank=false;
   for(const [index,score]of draft.entries()){
    const a=score.a.trim(),b=score.b.trim();
    if(a===''&&b===''){blank=true;continue;}
    if(a===''||b==='')throw new TypeError(`Enter both scores for set ${index+1}.`);
    if(blank)throw new TypeError('Enter the set scores in order. Leave only unplayed sets blank.');
    scores.push({a:Number(a),b:Number(b)});
   }
   return scores;
  };
  const updateSummary=()=>{try{const winner=validateMatchScores(format,readScores());summary.textContent=`${includesMe(match.teams[winner])?'Your duo wins':'The other duo wins'} this match.`;}catch{summary.textContent=format.bestOf===1?`Play to ${format.pointsToWin}, win by ${format.winBy}. Enter both final scores.`:`First duo to win ${Math.floor(format.bestOf/2)+1} sets. Leave unplayed sets blank.`;}};
  form.append(el('h3','',format.bestOf===1?'Enter the final score.':'Enter the set scores.'));
  for(let index=0;index<format.bestOf;index++){
   const set=el('fieldset','play-score-set'),row=el('div','play-score-inputs');set.append(el('legend','',format.bestOf===1?'Final score':`Set ${index+1}`));
   for(const side of ['a','b']){
    const label=el('label','',includesMe(match.teams[side])?'Your duo':'Other duo'),input=el('input','play-set-score');input.type='number';input.min='0';input.max='99';input.step='1';input.inputMode='numeric';input.placeholder='—';input.id=`score-${match.id}-${index}-${side}`;input.name=`scores[${index}][${side}]`;input.value=draft[index][side];input.disabled=busy;label.htmlFor=input.id;
    input.addEventListener('focus',()=>{lastScoreFocusId=input.id;});
    input.addEventListener('input',()=>{lastScoreFocusId=input.id;draft[index][side]=input.value;scoreErrors.delete(match.id);problem.hidden=true;problem.textContent='';updateSummary();});label.append(input);row.append(label);
   }
   set.append(row);form.append(set);
  }
  const button=el('button','button button-black','Record result ↗');button.type='submit';button.disabled=busy;
  form.append(summary,problem,button,el('p','play-result-note',`${format.bestOf===1?'Check both scores':'Check every set'} before recording. The winner is calculated from the scores. MMR updates once for the whole match.`));updateSummary();
  form.addEventListener('submit',event=>{
   event.preventDefault();if(busy)return;
   let scores;
   try{scores=readScores();validateMatchScores(format,scores);}catch(issue){scoreErrors.set(match.id,issue.message);problem.textContent=issue.message;problem.hidden=false;return;}
   scoreErrors.delete(match.id);
   const retryFocus=lastScoreFocusId?.startsWith(`score-${match.id}-`)?lastScoreFocusId:`score-${match.id}-0-a`;
   return runAction(`/api/matches/${encodeURIComponent(match.id)}/result`,{scores},'Set scores recorded. All four ratings have been updated once for this match.',message=>{scoreErrors.set(match.id,message);scoreRetryFocusId=retryFocus;});
  });
  return form;
 }
 function renderMatches(){
  const target=byId('play-matches');target.replaceChildren();
  const matches=[...new Map([...(data.matches||[]),...(data.history||[])].map(match=>[match.id,match])).values()];
  const order={active:0,pending:1,completed:2,cancelled:3};matches.sort((a,b)=>(order[a.status]??4)-(order[b.status]??4)||new Date(b.completedAt||b.createdAt)-new Date(a.completedAt||a.createdAt));
  const waiting=matches.filter(match=>['active','pending'].includes(match.status)).length;byId('play-match-count').textContent=waiting?`${waiting} open ${waiting===1?'match':'matches'}`:'';
  if(!matches.length)target.append(el('p','play-empty','Make or scan a room, then choose a + slot. The room leader starts the match when both teams are ready.'));
  else matches.slice(0,24).forEach(match=>target.append(renderMatch(match)));
 }
 function render(){
  if(!data)return;
  const focusedScoreId=document.activeElement?.tagName==='INPUT'&&document.activeElement.id?.startsWith('score-')?document.activeElement.id:scoreRetryFocusId;
  renderInvitations();
  if(data.duo){duoInvite=null;showDuoQr=false;}
  const signature=JSON.stringify([data,connected,duoInvite,showDuoQr,busy,invitationSignature,duoInvite?new Date(duoInvite.expiresAt).getTime()>now():false]);
  if(signature===renderSignature)return;
  renderSignature=signature;renderIdentity();renderConnected();renderDuo();renderMatches();
  scoreRetryFocusId=null;if(focusedScoreId&&!document.querySelector('dialog[open]'))byId(focusedScoreId)?.focus();
 }
 async function refresh({quiet=false,maxAge=0}={}){
  if(!getAvatarCreated()||busy&&data)return;
  if(refreshing)return refreshing;
  if(maxAge>0&&lastReceived!==null&&now()-lastReceived<maxAge)return;
  if(!quiet){error('');status('Checking your court connections…');}
  byId('refresh-play').disabled=true;
  const connectedRead=readConnected();
  refreshing=(async()=>{try{await Promise.all([rooms?.refresh(),applyData(await api('/api/play'),connectedRead)]);if(!quiet)status('Connections up to date.');}catch(problem){if(!quiet){error(problem.message);status('');}}finally{refreshing=null;byId('refresh-play').disabled=busy;render();}})();
  return refreshing;
 }
 async function lookup(input,{openSettings=false}={}){
  if(lookingUp||busy)return;
  const code=parsePlayerCode(input);if(!code){error('Use a player code or a Sideout player QR link.');return;}
  const lookupGeneration=scanGeneration;
  error('');status('Finding your player…');lookingUp=true;++connectedVersion;byId('find-player').disabled=true;
  try{
   if(!data)await refresh();if(!data)throw new Error('Your player could not load. Refresh your connections and try again.');
   connected=await api(`/api/players/${encodeURIComponent(code)}`);render();status(isMine(connected.player)?'That QR belongs to you.':`${connected.player.name} found. Choose a teammate or add a friend.`);
   if(lookupGeneration!==scanGeneration||document.hidden||activePage()!=='play')return;
   if(!rooms&&opposingDuoFound()){
    // Only an explicit lookup shows the matchup; refreshes keep the normal challenge flow.
    const version=connectedVersion,generation=scanGeneration,found=connected.player,ownDuoId=data.duo.id,opponentDuoId=connected.duo.id;
    const afterPreview=()=>{
     if(version!==connectedVersion||generation!==scanGeneration||data.duo?.id!==ownDuoId||connected?.duo?.id!==opponentDuoId||document.hidden||activePage()!=='play'||document.querySelector('dialog[open]'))return;
     if(openSettings)openMatchSettings(found);else showFoundPlayer();
    };
    try{Promise.resolve(onOpponentFound(data.player,data.duo,connected.duo)).then(afterPreview,afterPreview);}catch{afterPreview();}
   }else showFoundPlayer();
  }
  catch(problem){connected=null;render();error(problem.message);status('');}
  finally{lookingUp=false;byId('find-player').disabled=busy;}
 }
 async function handleDeepLink(){
  if(deepLinkHandled||!getAvatarCreated())return;
  const url=new URL(window.location.href),token=parseDuoInvite(url.href);
  if(rooms&&url.searchParams.has('room')){
   deepLinkHandled=true;onNavigate('play');
   if(!parseRoomLink(url.href)){error('This room link is invalid. Ask the room leader for a new QR.');return;}
   await rooms.open(url.href);return;
  }
  if(url.searchParams.has('duo')){
   deepLinkHandled=true;onNavigate('play');
   if(!token){error('This duo invite link is invalid. Ask your teammate to create a new duo QR.');return;}
   await joinDuo(token);return;
  }
  const hashInput=url.hash.startsWith('#connect/')?url.hash.slice(9):null,input=url.searchParams.get('player')||hashInput;
  if(!input)return;
  deepLinkHandled=true;url.searchParams.delete('player');url.hash='#play';window.history.replaceState(null,'',url);onNavigate('play');
  if(!data)await refresh({quiet:true});await lookup(input,{openSettings:true});
 }
 function stopCamera(){scanGeneration++;if(scanTimer)clearTimeout(scanTimer);scanTimer=null;if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;}
 function closeScanner(){stopCamera();if(dialog.open)dialog.close();}
 function getQrDecoder(){
  if(!decoderPromise)decoderPromise=Promise.resolve().then(loadQrDecoder).catch(problem=>{decoderPromise=null;throw problem;});
  return decoderPromise;
 }
 async function foundCode(text){if(rooms&&parseRoomLink(text)){closeScanner();onNavigate('play');await rooms.open(text);return true;}const token=parseDuoInvite(text);if(token){closeScanner();onNavigate('play');await joinDuo(token);return true;}const code=parsePlayerCode(text);if(!code){scanError('This QR is not a Sideout room, player or duo invite link. Try their Sideout QR.');return false;}closeScanner();byId('connect-player-code').value=code;onNavigate('play');await lookup(code,{openSettings:true});return true;}
 async function scanFrame(generation){
  if(generation!==scanGeneration||!dialog.open)return;
  try{if(video.readyState>=2&&video.videoWidth){const ratio=Math.min(1,640/video.videoWidth);scannerCanvas.width=Math.round(video.videoWidth*ratio);scannerCanvas.height=Math.round(video.videoHeight*ratio);const ctx=scannerCanvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,scannerCanvas.width,scannerCanvas.height);const result=decodeQr(ctx.getImageData(0,0,scannerCanvas.width,scannerCanvas.height));if(result&&await foundCode(result))return;}}
  catch{scanMessage.textContent='Keep the QR centered, or choose a QR photo below.';}
  if(generation===scanGeneration&&dialog.open)scanTimer=setTimeout(()=>scanFrame(generation),200);
 }
 async function openScanner(){
  if(busy)return;scanError('');byId('scan-help').textContent='Point your camera at the room QR code.';scanMessage.textContent='Starting your camera…';byId('scan-file').value='';dialog.showModal();const generation=++scanGeneration;
  if(!navigator.mediaDevices?.getUserMedia){scanMessage.textContent='Camera scanning needs a secure website. Choose a QR photo or paste the room link or a player code.';return;}
  try{const camera=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});if(generation!==scanGeneration||!dialog.open){camera.getTracks().forEach(track=>track.stop());return;}stream=camera;video.srcObject=camera;const [,decoder]=await Promise.all([video.play(),getQrDecoder()]);if(generation!==scanGeneration||!dialog.open)return;decodeQr=decoder;scanMessage.textContent='Hold the room QR inside the frame.';scanFrame(generation);}
  catch(problem){if(generation!==scanGeneration||!dialog.open)return;stopCamera();scanMessage.textContent=problem.name==='NotAllowedError'?'Camera access was not allowed. Choose a QR photo or paste the room link or a player code.':'Your camera could not open. Choose a QR photo or paste the room link or a player code.';}
 }
 function openPhoto(){if(busy)return;stopCamera();scanError('');byId('scan-help').textContent='Choose a photo of the room QR code.';scanMessage.textContent='Choose a clear QR photo using the button below.';byId('scan-file').value='';dialog.showModal();}
 async function scanFile(file){
  if(!file)return;scanError('');scanMessage.textContent='Reading your QR photo…';stopCamera();const generation=scanGeneration;
  if(file.size>12*1024*1024){scanError('Choose a QR photo smaller than 12 MB.');return;}
  let image;
  try{const decoder=await getQrDecoder();if(generation!==scanGeneration||!dialog.open)return;image=await createImageBitmap(file);if(generation!==scanGeneration||!dialog.open)return;const ratio=Math.min(1,1200/Math.max(image.width,image.height));scannerCanvas.width=Math.max(1,Math.round(image.width*ratio));scannerCanvas.height=Math.max(1,Math.round(image.height*ratio));const ctx=scannerCanvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,scannerCanvas.width,scannerCanvas.height);const text=decoder(ctx.getImageData(0,0,scannerCanvas.width,scannerCanvas.height));if(!text||!await foundCode(text)){if(generation!==scanGeneration||!dialog.open)return;scanError(text?'This QR is not a Sideout room or player code.':'No Sideout QR found. Try a clear photo with the whole QR visible.');scanMessage.textContent='Choose another QR photo, or paste the room link or a player code.';}}
  catch{if(generation!==scanGeneration||!dialog.open)return;scanError('This photo could not be read. Try another image or paste the room link or a player code.');scanMessage.textContent='Choose another QR photo, or paste the room link or a player code.';}
  finally{image?.close();}
 }
 byId('connect-player-form').addEventListener('submit',event=>{event.preventDefault();const input=byId('connect-player-code').value,token=parseDuoInvite(input);if(rooms&&parseRoomLink(input))rooms.open(input);else if(token)joinDuo(token);else lookup(input);});
 byId('refresh-play').addEventListener('click',async()=>{await refresh();if(new URL(window.location.href).searchParams.has('duo')){deepLinkHandled=false;await handleDeepLink();}});
 byId('create-duo-qr').addEventListener('click',createDuoQr);
 byId('show-player-qr').addEventListener('click',()=>{showDuoQr=false;render();});
 byId('copy-qr-link').addEventListener('click',async()=>{if(!qrLink)return;try{await navigator.clipboard.writeText(qrLink);status(parseDuoInvite(qrLink)?'Duo invite link copied. Send it to your teammate.':'Player link copied. It opens the Sideout website.');}catch{const input=byId('qr-link-output');input.hidden=false;input.focus();input.select();status('Select and copy the website link below your QR.');}});
 byId('copy-player-code').addEventListener('click',async()=>{if(!data)return;try{await navigator.clipboard.writeText(data.player.code);status('Player code copied. Share it with your court crew.');}catch{status(`Your player code is ${data.player.code}. Select and copy it above.`);}});
 byId('scan-player').addEventListener('click',openScanner);byId('use-player-photo').addEventListener('click',openPhoto);byId('scan-close').addEventListener('click',closeScanner);
 byId('scan-room')?.addEventListener('click',openScanner);
 dialog.addEventListener('close',stopCamera);dialog.addEventListener('cancel',stopCamera);
 byId('duo-invitation-close').addEventListener('click',dismissInvitations);
 invitationDialog.addEventListener('cancel',event=>{event.preventDefault();dismissInvitations();});
 byId('match-settings-close').addEventListener('click',closeMatchSettings);
 settingsDialog.addEventListener('cancel',event=>{event.preventDefault();closeMatchSettings();});
 byId('match-settings-form').addEventListener('submit',sendChallenge);
 byId('show-found-player').addEventListener('click',showFoundPlayer);
 byId('found-player-close').addEventListener('click',()=>closeFoundPlayer());
 playerDialog.addEventListener('cancel',event=>{event.preventDefault();closeFoundPlayer();});
 document.addEventListener('close',()=>showInvitations(),true);
 byId('scan-file').addEventListener('change',event=>scanFile(event.target.files?.[0]));
 const activePage=()=>document.querySelector('.page.active')?.id;
 const visible=()=>['profile','rating','play','locker','friends','courts','leaderboard'].includes(activePage())&&getAvatarCreated()&&!document.hidden;
 const stopPolling=()=>{if(poll!==null){clearInterval(poll);poll=null;}};
 const startPolling=()=>{if(visible()&&poll===null)poll=setInterval(()=>{if(visible()&&!busy&&!lookingUp&&!dialog.open)refresh({quiet:true});},pollInterval);};
 window.addEventListener('pagehide',()=>{closeScanner();closeFoundPlayer(true);stopPolling();});
 window.addEventListener('pageshow',event=>{if(event.persisted){startPolling();if(visible()){showInvitations();refresh({quiet:true,maxAge:pollInterval});}}});
 document.addEventListener('visibilitychange',()=>{stopPolling();if(document.hidden)closeScanner();else{startPolling();if(visible()){showInvitations();refresh({quiet:true,maxAge:pollInterval});}}});
 async function handleNavigation(page){
  if(page!=='play'){closeScanner();closeFoundPlayer(true);}
  if(!['profile','rating','play','locker','friends','courts','leaderboard'].includes(page)){stopPolling();return;}
  startPolling();await refresh({quiet:Boolean(data),maxAge:pollInterval});showInvitations();
  if(page==='play')await handleDeepLink();
 }
 startPolling();
 await refresh();await handleDeepLink();
 return{refresh,handleNavigation,closeScanner};
}
