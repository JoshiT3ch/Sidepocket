import {parsePlayerCode} from './player-links.js';
import {drawAvatar} from './pixel-player.js';

const relationshipId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function initFriends({request=(path,options)=>window.sideoutService.request(path,options),document:doc=globalThis.document,setInterval:interval=globalThis.setInterval,clearInterval:cancelInterval=globalThis.clearInterval,onNavigate=()=>{}}={}){
  const byId=id=>doc.getElementById(id),root=byId('friends');
  if(!root)return{refresh:async()=>{},handleNavigation:async()=>{},destroy(){}};
  const form=byId('friend-request-form'),input=byId('friend-player-code'),notice=byId('friends-status'),errorBox=byId('friends-error'),errorMessage=byId('friends-error-message');
  let data=null,active=false,destroyed=false,mutating=false,loading=false,pending=null,readVersion=0,timer=null,signature='',confirmRemoval=null;
  const cleanups=[],controls=new Set();
  const visible=()=>active&&!doc.hidden&&!destroyed;
  const make=(tag,className='',text='')=>{const node=doc.createElement(tag);node.className=className;if(text!=='')node.textContent=String(text);return node;};
  const listen=(node,event,callback)=>{node.addEventListener(event,callback);cleanups.push(()=>node.removeEventListener(event,callback));};
  const clearError=()=>{errorBox.hidden=true;errorMessage.textContent='';};
  const showError=error=>{errorMessage.textContent=(error?.message||'Could not connect to Sideout.')+' Please try again.';errorBox.hidden=false;};
  const validate=next=>{
    for(const key of ['friends','incoming','outgoing']){
      if(!Array.isArray(next?.[key])||next[key].some(item=>!item||!relationshipId.test(item.id)||typeof item.player?.id!=='string'||typeof item.player?.name!=='string'||parsePlayerCode(item.player.code)!==item.player.code||!Number.isFinite(item.player.rating)))throw new Error('Your friends could not be loaded. Refresh to try again.');
    }
    return next;
  };
  function syncBusy(){
    input.disabled=mutating;byId('friend-request-submit').disabled=mutating;
    byId('friends-refresh').disabled=mutating||loading;byId('friends-retry').disabled=mutating||loading;
    for(const button of controls)button.disabled=mutating;
    root.setAttribute('aria-busy',String(mutating||loading));
  }
  const button=(label,callback,className='friend-button')=>{const node=make('button',className,label);node.type='button';node.disabled=mutating;node.addEventListener('click',callback);controls.add(node);return node;};
  function person(player){
    const row=make('div','friend-person'),canvas=make('canvas','friend-avatar');canvas.width=100;canvas.height=140;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${player.name}’s pixel character`);
    const copy=make('div','friend-person-copy');copy.append(make('strong','',player.name),make('span','',`${Number(player.rating).toLocaleString()} MMR`),make('small','friend-code',player.code));row.append(canvas,copy);
    try{drawAvatar(canvas.getContext('2d'),47,131,1.2,{...(player.avatar||{}),name:player.name});}catch{canvas.setAttribute('aria-label',player.name);}
    return row;
  }
  function render(){
    if(!data)return;
    const nextSignature=JSON.stringify([data,confirmRemoval]);if(signature===nextSignature){syncBusy();return;}signature=nextSignature;controls.clear();
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
  function apply(next){data=validate(next);if(confirmRemoval&&!data.friends.some(item=>item.id===confirmRemoval))confirmRemoval=null;render();}
  async function refresh(){
    if(!visible()||mutating)return;
    if(pending)return pending;
    const version=++readVersion;loading=true;syncBusy();clearError();
    if(!data)notice.textContent='Loading your court crew…';
    const read=Promise.resolve().then(async()=>{
      try{const next=await request('/api/friends',{});if(version!==readVersion||!visible())return;apply(next);if(!mutating)notice.textContent='';}
      catch(error){if(version===readVersion&&visible()){showError(error);notice.textContent='';}}
      finally{if(version===readVersion){pending=null;loading=false;if(!destroyed)syncBusy();}}
    });pending=read;return read;
  }
  async function mutate(path,body,message,{onSuccess}={}){
    if(!visible()||mutating)return;
    mutating=true;++readVersion;pending=null;loading=false;syncBusy();clearError();notice.textContent='Saving your friends…';
    try{
      const next=validate(await request(path,{method:'POST',body:JSON.stringify(body)}));if(destroyed)return;
      confirmRemoval=null;apply(next);notice.textContent=typeof message==='function'?message(next):message;onSuccess?.();
    }catch(error){if(!destroyed){showError(error);notice.textContent='';}}
    finally{mutating=false;if(!destroyed)syncBusy();}
  }
  async function sendRequest(event){
    event.preventDefault();if(!visible()||mutating)return;
    const original=input.value,code=parsePlayerCode(original);
    if(!code){clearError();showError(new Error('Enter a player code such as SO-012345ABCDEF, or their Sideout player link.'));input.focus();return;}
    return mutate('/api/friends/request',{playerCode:code},next=>next.friends.some(item=>item.player.code===code)?'You’re already friends.':next.incoming.some(item=>item.player.code===code)?'This player has already invited you. Accept their request below.':'Friend request sent. They’ll need to accept it.',{onSuccess(){if(input.value===original)input.value='';}});
  }
  const stopPolling=()=>{if(timer!==null){cancelInterval(timer);timer=null;}};
  const startPolling=()=>{if(visible()&&timer===null)timer=interval(()=>{if(visible()&&!loading&&!mutating)refresh();},20000);};
  const visibilityChanged=()=>{stopPolling();if(visible()){refresh();startPolling();}};
  listen(form,'submit',sendRequest);listen(byId('friends-refresh'),'click',refresh);listen(byId('friends-retry'),'click',refresh);listen(byId('friends-open-play'),'click',()=>onNavigate('play'));listen(doc,'visibilitychange',visibilityChanged);
  return{refresh,async handleNavigation(page){const wasActive=active;active=page==='friends';if(!active){stopPolling();++readVersion;pending=null;loading=false;syncBusy();return;}startPolling();if(!wasActive||!data)return refresh();},destroy(){destroyed=true;active=false;++readVersion;stopPolling();for(const cleanup of cleanups)cleanup();controls.clear();}};
}
