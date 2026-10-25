import {getService} from './service.js';
import {drawAvatar} from './pixel-player.js';

const zone='Asia/Manila';
export const categories={men:'Men’s doubles only',women:'Women’s doubles only',mixed:'Mixed doubles',open:'Open doubles'};
const format=(value,options)=>new Intl.DateTimeFormat('en-PH',{timeZone:zone,...options}).format(new Date(value));
const time=value=>format(value,{hour:'numeric',minute:'2-digit'});
const day=value=>format(value,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
export function manilaFields(value){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
  const p=Object.fromEntries(parts.map(item=>[item.type,item.value]));return{date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
}
const money=value=>value?new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(value):'Free';
const statuses={requested:'Request sent · waiting for host approval',confirmed:'You’re confirmed',maybe:'You marked Maybe',declined:'Not attending'};

export function initHosting({request,document:doc=globalThis.document,setInterval:interval=globalThis.setInterval,clearInterval:clear=globalThis.clearInterval}={}){
  const get=id=>doc.getElementById(id),root=get('hosting');
  if(!root)return{handleNavigation:async()=>{},destroy(){}};
  const form=get('hosting-form'),editor=get('hosting-editor');
  get('hosting-create').dataset.hostDisabled='true';
  let snapshot=null,scope='upcoming',selected=null,tab='details',editing=null,active=false,destroyed=false,busy=false,loading=false,version=0;
  const cleanups=[];
  const listen=(node,type,fn)=>{node.addEventListener(type,fn);cleanups.push(()=>node.removeEventListener(type,fn));};
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const api=async(action,data={})=>{const send=request||((await getService()).request);return send('/api/hosting',{method:'POST',body:JSON.stringify({action,data})});};
  function message(text,error=false){const n=get('hosting-message');n.textContent=text;n.className=`hosting-message${error?' hosting-error':''}`;n.setAttribute('role',error?'alert':'status');}
  function sync(){
    root.setAttribute('aria-busy',String(busy||loading));
    root.querySelectorAll('button').forEach(b=>b.disabled=busy||b.dataset.hostDisabled==='true');
    form.querySelectorAll('input,select,textarea').forEach(n=>n.disabled=busy);
    get('hosting-refresh').disabled=busy||loading;
  }
  function button(text,fn,cls='button button-outline',disabled=false){const b=el('button',text,cls);b.type='button';b.dataset.hostDisabled=String(disabled);b.disabled=busy||disabled;b.addEventListener('click',fn);return b;}
  async function load(quiet=false){
    if(destroyed||busy)return false;const own=++version;loading=true;sync();if(!quiet)message('Loading games…');
    try{const result=await api('list',{...(selected?{eventId:selected}:{}),scope});if(destroyed||own!==version||!active)return false;snapshot=result;selected=result.selectedEvent?.id||null;render();if(!quiet)message('All times are in the Philippines (UTC+8).');return true;}
    catch(error){if(!destroyed&&own===version&&active)message(error.message,true);return false;}
    finally{if(own===version){loading=false;sync();}}
  }
  async function mutate(action,data,success){
    if(busy||destroyed)return false;busy=true;++version;loading=false;sync();
    try{const result=await api(action,{...data,scope:data.scope||scope});if(destroyed)return false;snapshot=result;selected=result.selectedEvent?.id||null;scope=result.scope||scope;if(active){render();message(success);}return true;}
    catch(error){if(!destroyed)message(error.message,true);return false;}
    finally{busy=false;if(!destroyed)sync();}
  }
  function person(player,host=false){
    const cell=el('div',undefined,'hosting-person');cell.dataset.hostingParticipant=player.id;
    const circle=el('div',undefined,'hosting-avatar'),canvas=el('canvas');canvas.width=100;canvas.height=140;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${player.name}’s pixel character`);circle.append(canvas);
    cell.append(circle,el('strong',player.name),el('small',host?'Host':`${Number(player.rating||1200).toLocaleString()} MMR`));
    if(player.isVerified)cell.append(el('span','✓ Verified','hosting-verified'));
    try{drawAvatar(canvas.getContext('2d'),47,131,1.2,{...(player.avatar||{}),name:player.name});}catch{canvas.setAttribute('aria-label',player.name);}return cell;
  }
  function render(){
    const verified=snapshot.me?.isVerified===true;
    get('hosting-verification').textContent=verified?'✓ Verified account · You can host a game.':'Hosting requires an existing Sideout verified account. Everyone can request to join a game.';
    get('hosting-create').dataset.hostDisabled=String(!verified);
    get('hosting-scope').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scope===scope)));
    const list=get('hosting-events');list.replaceChildren();let previous='';
    for(const event of snapshot.events){
      const date=day(event.startsAt);if(date!==previous){list.append(el('h3',date,'hosting-date-heading'));previous=date;}
      const card=button('',async()=>{if(busy)return;selected=event.id;tab='details';if(await load())if(doc.defaultView?.matchMedia('(max-width:1100px)').matches)get('hosting-detail').scrollIntoView({behavior:'smooth',block:'start'});},'hosting-event');card.setAttribute('aria-pressed',String(event.id===selected));
      const clock=el('span',undefined,'hosting-event-time');clock.append(el('strong',time(event.startsAt)),el('small','DOUBLES'));
      const body=el('span',undefined,'hosting-event-copy'),top=el('span',undefined,'hosting-event-top');
      top.append(el('strong',event.title),el('span',`${event.confirmedCount}/${event.capacity}`,'hosting-count'));
      body.append(top,el('span',categories[event.category]),el('span',event.venue,'hosting-venue'),el('small',event.status==='cancelled'?'Cancelled':`${time(event.startsAt)} – ${time(event.endsAt)} · ${event.confirmedCount} confirmed`));
      if(event.myStatus)body.append(el('span',statuses[event.myStatus],'hosting-my-status'));
      card.append(clock,body);list.append(card);
    }
    if(!snapshot.events.length)list.append(el('p',scope==='mine'?'Events you host or respond to will appear here.':scope==='past'?'No past events yet.':'No upcoming games yet. Verified hosts can add the next one.','hosting-empty'));
    renderDetail();sync();
  }
  function detailRow(icon,label,main,sub){const row=el('div',undefined,'hosting-detail-row'),copy=el('div');copy.append(el('span',label,'hosting-row-label'),el('strong',main));if(sub)copy.append(el('p',sub));const mark=el('span',icon,'hosting-row-icon');mark.setAttribute('aria-hidden','true');row.append(mark,copy);return row;}
  function renderDetail(){
    const box=get('hosting-detail');box.replaceChildren();const event=snapshot.selectedEvent;
    if(!event){box.append(el('span','YOUR NEXT GOOD GAME','eyebrow'),el('h2','Find a game. Bring your player.'),el('p','Choose an event to see when, where, and who’s joining.','hosting-empty'));return;}
    const owner=event.host.id===snapshot.me?.player?.id,ended=new Date(event.endsAt).getTime()<=new Date(snapshot.serverTime).getTime(),closed=event.status==='cancelled'||ended;
    const header=el('div',undefined,'hosting-detail-heading');header.append(el('span',categories[event.category],'eyebrow'),el('h2',event.title),el('p',`${format(event.startsAt,{weekday:'short',month:'short',day:'numeric'})} · ${time(event.startsAt)} – ${time(event.endsAt)}`));box.append(header);
    const tabs=el('div',undefined,'hosting-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Event view');
    for(const [key,label]of[['details','Details'],['participants',`Participants · ${event.confirmedCount}/${event.capacity}`]]){const b=button(label,()=>{tab=key;renderDetail();},'hosting-tab');b.setAttribute('aria-pressed',String(tab===key));tabs.append(b);}box.append(tabs);
    const host=el('div',undefined,'hosting-host');host.append(el('span','HOSTED BY','eyebrow'),el('strong',`${event.host.name}${event.host.isVerified?' ✓':''}`),el('small',event.host.isVerified?'Verified player':'Sideout player'));box.append(host);
    if(tab==='details'){
      const duration=(new Date(event.endsAt)-new Date(event.startsAt))/3600000;
      const when=detailRow('▦','WHEN',day(event.startsAt),`${time(event.startsAt)} – ${time(event.endsAt)} · ${duration} ${duration===1?'hour':'hours'} · Philippine time`);
      if(!closed)when.lastChild.append(button('Add to calendar ↗',()=>calendar(event),'hosting-text-button'));
      box.append(when,detailRow('⌖','WHERE',event.venue,event.address),detailRow('◈','FORMAT',categories[event.category],`${event.confirmedCount}/${event.capacity} confirmed players · host approval required`),detailRow('₱','PER PLAYER',money(event.fee),event.fee?'Arrange fees directly with your host.':null));
      if(event.notes){const notes=el('div',undefined,'hosting-notes');notes.append(el('h3','Notes'),el('p',event.notes));box.append(notes);}
      const preview=el('div',undefined,'hosting-preview');for(const p of event.participants.slice(0,4))preview.append(person(p,p.id===event.host.id));if(event.confirmedCount>4)preview.append(el('span',`+${event.confirmedCount-4}`,'hosting-preview-more'));box.append(preview);
    }else{
      box.append(el('h3',`Confirmed · ${event.confirmedCount}/${event.capacity}`,'hosting-participant-title'));
      const grid=el('div',undefined,'hosting-people');for(const player of event.participants)grid.append(person(player,player.id===event.host.id));
      for(let i=event.confirmedCount;i<event.capacity;i++){const cell=el('div',undefined,'hosting-person hosting-person-empty');cell.append(el('span','+','hosting-open-spot'),el('small','Open spot'));grid.append(cell);}box.append(grid);
    }
    if(owner&&!closed){
      const started=new Date(event.startsAt).getTime()<=new Date(snapshot.serverTime).getTime();
      const controls=el('div',undefined,'hosting-owner-actions');controls.append(button('Edit event',()=>openEditor(event),'button button-outline',!snapshot.me.isVerified||started),button('Cancel event',()=>confirmCancel(event),'button button-outline'));box.append(controls);
      if(!snapshot.me.isVerified)box.append(el('p','Your verification has expired. You can still manage requests or cancel this event.','hosting-muted'));
      const requests=el('section',undefined,'hosting-requests');requests.append(el('h3',`Join requests · ${event.requests.length}`));
      for(const item of event.requests){const row=el('div',undefined,'hosting-request');row.dataset.userId=item.player.id;row.append(el('strong',item.player.name));const actions=el('div');actions.append(button('Approve',()=>mutate('respond',{eventId:event.id,userId:item.player.id,accept:true},'Player confirmed.'),'button button-black',event.confirmedCount>=event.capacity),button('Decline',()=>mutate('respond',{eventId:event.id,userId:item.player.id,accept:false},'Request declined.')));row.append(actions);requests.append(row);}
      if(!event.requests.length)requests.append(el('p','New join requests will appear here.','hosting-muted'));box.append(requests);
    }
    if(closed)box.append(el('p',event.status==='cancelled'?'This event has been cancelled.':'This event has ended.','hosting-event-notice'));
    else if(owner)box.append(el('p','You’re hosting · your spot is confirmed.','hosting-event-notice'));
    else{
      const status=el('p',statuses[event.myStatus]||'Request a spot. Your host will confirm you.','hosting-event-notice');box.append(status);
      const actions=el('div',undefined,'hosting-rsvp');
      const withdraw=()=>mutate('rsvp',{eventId:event.id,status:'declined'},'You marked Can’t go. Your spot is available again.');
      actions.append(button('Can’t go',()=>{if(event.myStatus==='confirmed')confirmWithdraw(event,withdraw);else withdraw();},'button hosting-no',event.myStatus==='declined'),button('Maybe',()=>{const save=()=>mutate('rsvp',{eventId:event.id,status:'maybe'},'You marked Maybe.');if(event.myStatus==='confirmed')confirmWithdraw(event,save);else save();},'button hosting-maybe',event.myStatus==='maybe'));
      const full=event.confirmedCount>=event.capacity,joined=['confirmed','requested'].includes(event.myStatus);
      actions.append(button(event.myStatus==='confirmed'?'Confirmed ✓':event.myStatus==='requested'?'Request sent':full?'Event full':'Request to join',()=>mutate('request',{eventId:event.id},'Request sent. Your host will review it.'),'button button-black',joined||full));box.append(actions);
    }
    sync();
  }
  function confirmation(text,yes,action){const box=get('hosting-detail');box.querySelector('.hosting-confirm')?.remove();const panel=el('div',undefined,'hosting-confirm');panel.setAttribute('role','alert');panel.append(el('p',text),button(yes,action,'button button-black'),button('Keep my choice',()=>panel.remove()));box.append(panel);panel.scrollIntoView({behavior:'smooth',block:'nearest'});}
  function confirmWithdraw(event,action){confirmation('Release your confirmed spot? You’ll need host approval to join again.','Release my spot',action);}
  function confirmCancel(event){confirmation('Cancel this event for everyone? The event and participant list will remain visible as cancelled.','Yes, cancel event',()=>mutate('cancel',{eventId:event.id},'Event cancelled.'));}
  function openEditor(event=null){
    if(!snapshot?.me?.isVerified){message('An existing Sideout verified account is required to host.',true);return;}
    editing=event?.id||null;form.reset();
    const now=new Date(snapshot.serverTime),today=manilaFields(now).date;get('hosting-date').min=today;get('hosting-date').max=manilaFields(new Date(now.getTime()+365*86400000)).date;
    if(event){for(const name of['title','category','capacity','venue','address','fee','notes'])form.elements.namedItem(name).value=event[name];form.elements.namedItem('date').value=manilaFields(event.startsAt).date;form.elements.namedItem('startTime').value=manilaFields(event.startsAt).time;form.elements.namedItem('endTime').value=manilaFields(event.endsAt).time;}
    else form.elements.namedItem('date').value=manilaFields(new Date(now.getTime()+86400000)).date;
    get('hosting-save').textContent=event?'Save changes ↗':'Publish event ↗';editor.open=true;editor.scrollIntoView({behavior:'smooth',block:'start'});form.elements.namedItem('title').focus();
  }
  function calendar(event){
    const stamp=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const escape=value=>String(value).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Sideout//Hosting//EN','BEGIN:VEVENT',`UID:${event.id}@sideout`,`DTSTAMP:${stamp(Date.now())}`,`DTSTART:${stamp(event.startsAt)}`,`DTEND:${stamp(event.endsAt)}`,`SUMMARY:${escape(event.title)}`,`LOCATION:${escape(`${event.venue}, ${event.address}`)}`,`DESCRIPTION:${escape(event.notes||categories[event.category])}`,'END:VEVENT','END:VCALENDAR'];
    const url=URL.createObjectURL(new Blob([lines.join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'})),link=el('a');link.href=url;link.download='sideout-event.ics';doc.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  listen(get('hosting-create'),'click',()=>openEditor());
  listen(get('hosting-refresh'),'click',()=>{if(!busy)load();});
  listen(get('hosting-discard'),'click',()=>{editor.open=false;editing=null;form.reset();});
  get('hosting-scope').querySelectorAll('button').forEach(b=>listen(b,'click',()=>{if(!busy){scope=b.dataset.scope;selected=null;tab='details';load();}}));
  listen(form,'submit',async event=>{
    event.preventDefault();if(busy||!form.reportValidity())return;
    if(!snapshot?.me?.isVerified){message('An existing Sideout verified account is required to host.',true);return;}
    const data=Object.fromEntries(new FormData(form));data.capacity=Number(data.capacity);data.fee=Number(data.fee);if(data.endTime<=data.startTime){message('End time must be later than start time on the same day.',true);return;}
    if(editing)data.eventId=editing;
    data.scope='mine';if(await mutate(editing?'edit':'create',data,editing?'Event updated.':'Event published. Players can now request to join.')){editor.open=false;editing=null;form.reset();}
  });
  const timer=interval(()=>{if(active&&!doc.hidden&&!busy&&!loading&&!editor.open&&!root.contains(doc.activeElement)&&!root.querySelector('.hosting-confirm'))load(true);},30000);
  return{async handleNavigation(page){active=page==='hosting';if(active&&!busy)await load();else{++version;loading=false;}},destroy(){destroyed=true;active=false;++version;clear(timer);for(const fn of cleanups)fn();}};
}
