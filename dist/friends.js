import {parsePlayerCode} from './player-links.js';
import {drawAvatar} from './pixel-player.js';

const relationshipId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses={available:'Up for a game',playing:'Playing',practice:'Practicing',away:'Away'};

export function initFriends({request=(path,options)=>window.sideoutService.request(path,options),document:doc=globalThis.document,setInterval:interval=globalThis.setInterval,clearInterval:cancelInterval=globalThis.clearInterval,now:clock=Date.now,onNavigate=()=>{}}={}){
  const byId=id=>doc.getElementById(id),root=byId('friends');
  if(!root)return{refresh:async()=>{},handleNavigation:async()=>{},destroy(){}};
  const form=byId('friend-request-form'),input=byId('friend-player-code'),notice=byId('friends-status'),errorBox=byId('friends-error'),errorMessage=byId('friends-error-message');
  const presenceForm=byId('friend-presence-form'),statusInput=byId('friend-presence-status'),courtInput=byId('friend-presence-court'),statusToggle=byId('friend-share-status'),locationToggle=byId('friend-share-location');
  let data=null,active=false,destroyed=false,mutating=false,loading=false,pending=null,readVersion=0,timer=null,expiryTimer=null,nextExpiryRender=Infinity,signature='',confirmRemoval=null,lastReceived=0,courtSignature='',draft=null;
  const cleanups=[],controls=new Set();
  const visible=()=>active&&!doc.hidden&&!destroyed;
  const serverNow=()=>data?Number(data.serverTime??lastReceived)+Math.max(0,clock()-lastReceived):clock();
  const activePresence=presence=>presence&&Number(presence.expiresAt)>serverNow()?presence:null;
  const make=(tag,className='',text='')=>{const node=doc.createElement(tag);node.className=className;if(text!=='')node.textContent=String(text);return node;};
  const listen=(node,event,callback)=>{node.addEventListener(event,callback);cleanups.push(()=>node.removeEventListener(event,callback));};
  const clearError=()=>{errorBox.hidden=true;errorMessage.textContent='';};
  const showError=error=>{errorMessage.textContent=(error?.message||'Could not connect to Sideout.')+' Please try again.';errorBox.hidden=false;};
  const validate=next=>{
    for(const key of ['friends','incoming','outgoing']){
      if(!Array.isArray(next?.[key])||next[key].some(item=>!item||!relationshipId.test(item.id)||typeof item.player?.id!=='string'||typeof item.player?.name!=='string'||parsePlayerCode(item.player.code)!==item.player.code||!Number.isFinite(item.player.rating)))throw new Error('Your friends could not be loaded. Refresh to try again.');
    }
    for(const {presence}of next.friends){if(presence!=null&&(!Number.isFinite(presence.expiresAt)||(presence.status!==null&&!Object.hasOwn(statuses,presence.status))||(presence.court!==null&&(typeof presence.court?.id!=='string'||typeof presence.court?.name!=='string'))))throw new Error('Your friends’ shared details could not be loaded. Refresh to try again.');}
    if(next.courts!==undefined&&(!Array.isArray(next.courts)||next.courts.some(court=>typeof court?.id!=='string'||typeof court?.name!=='string')))throw new Error('The court choices could not be loaded. Refresh to try again.');
    if(next.serverTime!==undefined&&!Number.isFinite(next.serverTime))throw new Error('Your friends could not be loaded. Refresh to try again.');
    const own=next.me?.presence;if(own&&(!Object.hasOwn(statuses,own.status)||typeof own.shareStatus!=='boolean'||typeof own.shareLocation!=='boolean'||(own.courtId!==null&&typeof own.courtId!=='string')||(own.expiresAt!==null&&!Number.isFinite(own.expiresAt))))throw new Error('Your sharing settings could not be loaded. Refresh to try again.');
    return next;
  };
  function syncBusy(){
    input.disabled=mutating||destroyed;byId('friend-request-submit').disabled=mutating||destroyed;
    byId('friends-refresh').disabled=mutating||loading||destroyed;byId('friends-retry').disabled=mutating||loading||destroyed;
    for(const button of controls)button.disabled=mutating;
    for(const field of [statusInput,courtInput,statusToggle,locationToggle,byId('friend-presence-save')])field.disabled=mutating||!data||destroyed;
    byId('friend-presence-hide').disabled=mutating||destroyed;
    root.setAttribute('aria-busy',String(mutating||loading));
  }
  const button=(label,callback,className='friend-button')=>{const node=make('button',className,label);node.type='button';node.disabled=mutating;node.addEventListener('click',callback);controls.add(node);return node;};
  function person(player){
    const row=make('div','friend-person'),canvas=make('canvas','friend-avatar');canvas.width=100;canvas.height=140;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${player.name}’s pixel character`);
    const copy=make('div','friend-person-copy');copy.append(make('strong','',player.name),make('span','',`${Number(player.rating).toLocaleString()} MMR`),make('small','friend-code',player.code));row.append(canvas,copy);
    try{drawAvatar(canvas.getContext('2d'),47,131,1.2,{...(player.avatar||{}),name:player.name});}catch{canvas.setAttribute('aria-label',player.name);}
    return row;
  }
  function renderSharing(){
    const own=data.me?.presence,current=activePresence(own),shareStatus=Boolean(current?.shareStatus),shareLocation=Boolean(current?.shareLocation);
    const summary=byId('friend-presence-summary');
    summary.className=`friend-sharing-summary${shareStatus||shareLocation?' is-sharing':''}`;
    const summaryText=shareStatus||shareLocation?`Sharing ${shareStatus&&shareLocation?'status and court':shareStatus?'status':'court'} with friends · expires in ${Math.max(1,Math.ceil((current.expiresAt-serverNow())/60000))}m`:'Status and whereabouts are private with friends.';if(summary.textContent!==summaryText)summary.textContent=summaryText;
    const courts=data.courts||[],nextCourtSignature=JSON.stringify(courts);
    if(courtSignature!==nextCourtSignature){courtSignature=nextCourtSignature;courtInput.replaceChildren();const empty=make('option','','Choose a court');empty.value='';courtInput.append(empty);for(const court of courts){const option=make('option','',court.name);option.value=court.id;courtInput.append(option);}}
    if(!draft?.dirty)draft={status:own?.status||'available',courtId:own?.courtId||'',shareStatus,shareLocation,dirty:false};
    const selectedCourt=courts.some(court=>court.id===draft.courtId)?draft.courtId:'';if(statusInput.value!==draft.status)statusInput.value=draft.status;if(courtInput.value!==selectedCourt)courtInput.value=selectedCourt;statusToggle.checked=draft.shareStatus;locationToggle.checked=draft.shareLocation;
  }
  function renderPresence(card,presence){
    const shared=activePresence(presence),row=make('div','friend-presence');
    if(!shared){row.append(make('span','friend-presence-private','Status & whereabouts private'));}
    else{
      row.append(make('span',shared.status?'friend-presence-status':'friend-presence-private',shared.status?statuses[shared.status]:'Status private'));
      row.append(make('span',shared.court?'friend-presence-court':'friend-presence-private',shared.court?`At ${shared.court.name}`:'Court private'));
    }
    card.append(row);
  }
  function render(){
    if(!data)return;
    renderSharing();
    nextExpiryRender=Infinity;for(const {presence}of data.friends){if(activePresence(presence))nextExpiryRender=Math.min(nextExpiryRender,presence.expiresAt);}
    const own=activePresence(data.me?.presence);if(own&&(own.shareStatus||own.shareLocation))nextExpiryRender=Math.min(nextExpiryRender,own.expiresAt-(Math.ceil((own.expiresAt-serverNow())/60000)-1)*60000);
    const nextSignature=JSON.stringify([data.friends.map(item=>({...item,presence:activePresence(item.presence)})),data.incoming,data.outgoing,confirmRemoval]);if(signature===nextSignature){syncBusy();return;}signature=nextSignature;controls.clear();
    byId('friends-count').textContent=String(data.friends.length);
    byId('friends-summary').textContent=`${data.friends.length} ${data.friends.length===1?'friend':'friends'} · ${data.incoming.length} incoming · ${data.outgoing.length} sent`;
    for(const kind of ['incoming','outgoing','friends']){
      const list=byId(kind==='friends'?'friend-list':`friend-${kind}`);list.replaceChildren();
      byId(`friend-${kind}-count`).textContent=String(data[kind].length);
      if(!data[kind].length){
        const message={incoming:'No requests waiting. Your next court friend can add you with your player code.',outgoing:'No requests sent. Ask a player for their Sideout code to connect.',friends:'Your crew starts here. Add a player using their code, or find their player QR in Play & QR.'};
        list.append(make('p','friend-empty',message[kind]));continue;
      }
      for(const item of data[kind]){
        const card=make('article','friend-card');card.append(person(item.player));
        if(kind==='friends')renderPresence(card,item.presence);
        const actions=make('div','friend-actions'),id=encodeURIComponent(item.id);
        if(kind==='incoming')actions.append(button('Accept friend ↗',()=>mutate(`/api/friends/${id}/respond`,{accept:true},`You and ${item.player.name} are now friends.`),'button button-lime friend-accept'),button('Decline',()=>mutate(`/api/friends/${id}/respond`,{accept:false},'Friend request declined.')));
        else if(kind==='outgoing'){card.append(make('p','friend-waiting','Waiting for them to accept.'));actions.append(button('Cancel request',()=>mutate(`/api/friends/${id}/cancel`,{},'Friend request cancelled.')));}
        else if(confirmRemoval===item.id){
          const confirmation=make('p','friend-confirm',`Remove ${item.player.name} from your friends?`);confirmation.setAttribute('role','status');card.append(confirmation);
          actions.append(button('Yes, remove',()=>mutate(`/api/friends/${id}/remove`,{},'Friend removed.'),'friend-button friend-remove-confirm'),button('Keep friend',()=>{confirmRemoval=null;render();}));
        }else actions.append(button('Remove friend',()=>{if(mutating)return;confirmRemoval=item.id;render();}));
        card.append(actions);list.append(card);
      }
    }
    syncBusy();
  }
  function apply(next){data=validate(next);lastReceived=clock();if(confirmRemoval&&!data.friends.some(item=>item.id===confirmRemoval))confirmRemoval=null;render();}
  async function refresh(){
    if(!visible()||mutating)return;
    if(pending)return pending;
    const version=++readVersion;loading=true;syncBusy();clearError();
    if(!data)notice.textContent='Loading your court crew…';
    const read=Promise.resolve().then(async()=>{
      try{const next=await request('/api/friends',{});if(version!==readVersion||!visible())return;apply(next);if(!mutating)notice.textContent='';}
      catch(error){if(version===readVersion&&visible()){render();showError(error);notice.textContent='';}}
      finally{if(version===readVersion){pending=null;loading=false;if(!destroyed)syncBusy();}}
    });pending=read;return read;
  }
  async function mutate(path,body,message,{onSuccess,resetSharing=false}={}){
    if(!visible()||mutating)return;
    mutating=true;++readVersion;pending=null;loading=false;syncBusy();clearError();notice.textContent=path.startsWith('/api/friends/presence')?'Saving your sharing choices…':'Saving your friends…';
    try{
      const next=validate(await request(path,{method:'POST',body:JSON.stringify(body)}));if(destroyed)return;
      confirmRemoval=null;if(resetSharing)draft=null;apply(next);notice.textContent=typeof message==='function'?message(next):message;onSuccess?.();
    }catch(error){if(!destroyed){showError(error);notice.textContent='';}}
    finally{mutating=false;if(!destroyed)syncBusy();}
  }
  async function sendRequest(event){
    event.preventDefault();if(!visible()||mutating)return;
    const original=input.value,code=parsePlayerCode(original);
    if(!code){clearError();showError(new Error('Enter a player code such as SO-012345ABCDEF, or their Sideout player link.'));input.focus();return;}
    return mutate('/api/friends/request',{playerCode:code},next=>next.friends.some(item=>item.player.code===code)?'You’re already friends.':next.incoming.some(item=>item.player.code===code)?'This player has already invited you. Accept their request below.':'Friend request sent. They’ll need to accept it.',{onSuccess(){if(input.value===original)input.value='';}});
  }
  function sharingChanged(){draft={status:statusInput.value,courtId:courtInput.value,shareStatus:statusToggle.checked,shareLocation:locationToggle.checked,dirty:true};}
  async function saveSharing(event){
    event.preventDefault();if(!visible()||mutating||!data)return;
    sharingChanged();if(draft.shareLocation&&!data.courts?.some(court=>court.id===draft.courtId)){clearError();showError(new Error('Choose a court before sharing your whereabouts.'));courtInput.focus();return;}
    const body={status:draft.status,courtId:draft.courtId||null,shareStatus:draft.shareStatus,shareLocation:draft.shareLocation};
    return mutate('/api/friends/presence',body,body.shareLocation?'Sharing updated. Accepted friends can see your choices for 2 hours.':body.shareStatus?'Status shared with friends for 2 hours. Your public court check-in was cleared.':'Status and whereabouts hidden. Your public court check-in was cleared.',{resetSharing:true});
  }
  const hidePresence=()=>mutate('/api/friends/presence/hide',{},'Status and whereabouts hidden. Your public court check-in was cleared.',{resetSharing:true});
  const stopPolling=()=>{if(timer!==null){cancelInterval(timer);timer=null;}if(expiryTimer!==null){cancelInterval(expiryTimer);expiryTimer=null;}};
  const startPolling=()=>{if(visible()&&timer===null){timer=interval(()=>{if(visible()&&!loading&&!mutating)refresh();},20000);expiryTimer=interval(()=>{if(visible()&&serverNow()>=nextExpiryRender)render();},1000);}};
  const visibilityChanged=()=>{stopPolling();if(visible()){render();refresh();startPolling();}};
  function resetPrivateView(){
    for(const kind of ['friends','incoming','outgoing']){byId(kind==='friends'?'friend-list':`friend-${kind}`).replaceChildren(make('p','friend-empty','Open Friends to load your crew.'));byId(`friend-${kind}-count`).textContent='0';}
    byId('friends-count').textContent='—';byId('friends-summary').textContent='Your friends and requests appear here.';byId('friend-presence-summary').textContent='Open Friends to load your sharing choices.';byId('friend-presence-summary').className='friend-sharing-summary';
    statusInput.value='available';courtInput.value='';statusToggle.checked=false;locationToggle.checked=false;notice.textContent='';input.value='';clearError();
  }
  listen(form,'submit',sendRequest);listen(presenceForm,'submit',saveSharing);for(const field of [statusInput,courtInput,statusToggle,locationToggle])listen(field,'change',sharingChanged);listen(byId('friend-presence-hide'),'click',hidePresence);listen(byId('friends-refresh'),'click',refresh);listen(byId('friends-retry'),'click',refresh);listen(byId('friends-open-play'),'click',()=>onNavigate('play'));listen(doc,'visibilitychange',visibilityChanged);
  resetPrivateView();syncBusy();
  return{refresh,async handleNavigation(page){const wasActive=active;active=page==='friends';if(!active){stopPolling();++readVersion;pending=null;loading=false;syncBusy();return;}render();startPolling();if(!wasActive||!data)return refresh();},destroy(){if(destroyed)return;destroyed=true;active=false;++readVersion;stopPolling();for(const cleanup of cleanups)cleanup();controls.clear();data=null;draft=null;loading=false;mutating=false;resetPrivateView();syncBusy();}};
}
