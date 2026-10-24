import {roomLink,parseRoomLink} from './player-links.js';
import {renderRoomQr} from './qr.js';
import {drawAvatar} from './pixel-player.js';

const node=(tag,classes='',text='')=>{const item=document.createElement(tag);item.className=classes;item.textContent=text;return item;};
const ROOM_FORMAT=Object.freeze({bestOf:1,pointsToWin:11,winBy:2});
export function initRooms({onMatch=()=>{},onStatus=()=>{}}={}){
 const root=document.getElementById('match-room');
 if(!root)return null;
 let room=null,playerId=null,viewedId=null,busy=false,loading=null,version=0,signature='';
 const board=document.getElementById('room-board'),error=document.getElementById('room-error');
 const api=(path,body)=>window.sideoutService.request(path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)});
 const problem=message=>{error.textContent=message||'';error.hidden=!message;};
 const button=(label,callback,classes='play-small-button')=>{const item=node('button',classes,label);item.type='button';item.disabled=busy;item.addEventListener('click',callback);return item;};
 const clearLink=()=>{const url=new URL(window.location.href);url.searchParams.delete('room');window.history.replaceState(null,'',url);};
 function render(){
  const next=JSON.stringify([room,playerId,busy]);if(signature===next)return;signature=next;
  const focused=document.activeElement?.id;board.replaceChildren();root.setAttribute('aria-busy',String(busy));
  document.getElementById('create-room').disabled=busy||Boolean(room?.slots.some(player=>player?.id===playerId));
  if(!room){board.append(node('p','play-empty','Make a room and share its QR. Four players choose their spots. Use the two extra + spots to switch sides without leaving.'));return;}
  const leader=room.leaderId===playerId,joined=room.slots.some(player=>player?.id===playerId);
  const full=room.slots.filter(Boolean).length>=4;
  const heading=node('div','play-panel-heading');heading.append(node('h3','',`${room.leader.name}’s room`),node('span','pill',leader?'YOU · ROOM LEADER':'ONE ROOM LEADER'));board.append(heading);
  board.append(node('p','room-format','1 set · 11 points'),node('p','play-helper',room.matchActive?'Match in progress. Enter the final score below after playing.':!joined&&full?'This room already has four players.':joined?'Need to switch sides? Use either extra + to move aside, then choose the correct spot.':'Tap an open player spot to join. The extra + spots let players switch sides.'));
  const teams=node('div','room-teams');
  for(const [side,indexes] of [['First side',[0,1,4]],['Opposite side',[2,3,5]]]){
   const section=node('section','room-team');section.setAttribute('aria-label',side);const slots=node('div','room-slots');
   for(const slot of indexes){
    const player=room.slots[slot],transfer=slot>=4,name=transfer?`Extra switch spot ${slot-3}`:`${side}, player spot ${slot%2+1}`;
    const tile=button('',()=>act('slot',{slot}),'room-slot'+(player?' occupied':' open')+(transfer?' room-transfer':''));tile.id=`room-slot-${slot}`;
    tile.disabled=busy||Boolean(player)||room.matchActive||(!joined&&(transfer||full));tile.setAttribute('aria-label',player?`${name}: ${player.name}${player.id===playerId?', you':''}`:`${joined?'Move to':'Join'} ${name}`);
    if(player){const canvas=node('canvas');canvas.width=100;canvas.height=130;canvas.setAttribute('aria-hidden','true');try{drawAvatar(canvas.getContext('2d'),45,122,1.1,{...player.avatar,name:player.name});}catch{}tile.append(canvas,node('strong','',player.name),node('span','',`${player.rating} MMR${player.id===playerId?' · You':''}`));if(player.id===room.leaderId)tile.append(node('small','room-leader','Room leader'));}
    else tile.append(node('span','room-plus','+'),node('strong','',transfer?'Move aside':'Open spot'),node('small','',transfer?'Free your spot to switch sides':joined?'Move here':'Join here'));
    slots.append(tile);
   }
   section.append(slots);teams.append(section);
  }
  board.append(teams);
  if(leader){
   const settings=node('form','room-start');settings.id='room-start-form';
   const start=button(room.matchActive?'Match in progress':'Start match ↗',()=>{} ,'button button-black');start.type='submit';start.disabled=busy||room.matchActive||room.slots.slice(0,4).some(player=>!player)||room.slots.slice(4).some(Boolean);settings.addEventListener('submit',event=>{event.preventDefault();act('start',{format:ROOM_FORMAT});});settings.append(start,button('Close room',()=>act('close')));board.append(settings);
  }else if(joined)board.append(button('Leave room',()=>act('leave')));
  if(!joined)board.append(button('Back to my room',async()=>{viewedId=null;clearLink();await refresh();}));
  const share=node('details','room-share');share.open=true;share.append(node('summary','','Room QR · share with your court crew'));const canvas=node('canvas');canvas.width=280;canvas.height=280;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Scan to open this room and choose a slot');renderRoomQr(canvas,room.id);
  const link=node('input','qr-link-output');link.readOnly=true;link.value=roomLink(room.id);link.setAttribute('aria-label','Room link');share.append(canvas,link,button('Copy room link ↗',async()=>{try{await navigator.clipboard.writeText(link.value);onStatus('Room link copied. Players can scan or open it and choose a +.');}catch{link.focus();link.select();onStatus('Select and copy the room link.');}}));board.append(share);
  if(focused)document.getElementById(focused)?.focus();
 }
 async function act(action,body={}){
  if(busy)return;busy=true;++version;problem('');render();
  try{
   if(loading)await loading;
   const value=await api(action==='create'?'/api/rooms':`/api/rooms/${room.id}/${action}`,body);room=value.room;playerId=value.playerId;viewedId=room?.id||null;
   if(!room)clearLink();else if(action==='slot')clearLink();
   onStatus({create:'Room ready. Share the room QR with your players.',slot:'Spot saved. You can move to another open +.',leave:'You left the room.',close:'Room closed.',start:'Match started. Enter the final score under Doubles matches.'}[action]);
   if(action==='start')await onMatch();
  }catch(error){problem(error.message);await refresh({force:true});}
  finally{busy=false;render();}
 }
 async function refresh({force=false}={}){
  if(busy&&!force)return;if(loading)return loading;
  const generation=version;
  loading=(async()=>{try{const value=await api(viewedId?`/api/rooms/${viewedId}`:'/api/rooms');if(generation!==version)return;room=value.room;playerId=value.playerId;render();}catch(error){if(generation!==version)return;problem(error.message);if(error.status===404){room=null;viewedId=null;clearLink();render();}}finally{loading=null;}})();return loading;
 }
 async function open(input){const id=parseRoomLink(input);if(!id||busy)return false;viewedId=id;++version;if(loading)await loading;await refresh();root.scrollIntoView({behavior:'smooth',block:'start'});return true;}
 document.getElementById('create-room').addEventListener('click',()=>act('create'));
 document.getElementById('refresh-room').addEventListener('click',()=>refresh());
 const pollRoom=()=>{if(!document.hidden&&document.querySelector('.page.active')?.id==='play')void refresh();};
 let poll=setInterval(pollRoom,5000);
 window.addEventListener('pagehide',()=>{clearInterval(poll);poll=null;});
 window.addEventListener('pageshow',()=>{if(poll===null)poll=setInterval(pollRoom,5000);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollRoom();});
 render();return{refresh,open};
}
