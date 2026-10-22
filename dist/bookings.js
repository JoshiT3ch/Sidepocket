import {getService} from './service.js';

export const manilaDate=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const hourLabel=hour=>`${hour%12||12}:00 ${hour<12?'AM':'PM'}`;
const money=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(value);

export function initBookings({request,document:doc=globalThis.document}={}){
  const root=doc.getElementById('courts');
  if(!root)return{handleNavigation(){},destroy(){}};
  let active=false,destroyed=false,version=0,snapshot=null,selected=null,date=manilaDate(),slot=null,busy=false;
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const get=id=>doc.getElementById(id);
  const api=async(action,data={})=>{const send=request||((await getService()).request);return send('/api/bookings',{method:'POST',body:JSON.stringify({action,data})});};
  function message(text,error=false){get('booking-message').textContent=text;get('booking-message').setAttribute('role',error?'alert':'status');get('booking-message').className=error?'booking-message booking-error':'booking-message';}
  async function load(){
    const token=++version;message('Loading courts and availability…');
    try{const result=await api('list',{courtId:selected,date});if(destroyed||token!==version)return;snapshot=result;selected=result.selectedCourtId;slot=null;render();message('Availability is shown in Philippine time (UTC+8).');}
    catch(error){if(!destroyed&&token===version)message(error.message,true);}
  }
  function button(text,fn,cls='button button-outline'){const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;}
  function confirmation(label,action){const box=el('div',undefined,'booking-confirm');box.append(el('p',label),button('Yes, cancel booking',action),button('Keep booking',()=>box.remove()));return box;}
  async function mutate(action,data,success){
    if(busy)return false;busy=true;root.setAttribute('aria-busy','true');
    const buttons=[...root.querySelectorAll('button')].map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);
    try{await api(action,data);await load();message(success);return true;}
    catch(error){message(error.message,true);return false;}
    finally{busy=false;root.setAttribute('aria-busy','false');buttons.forEach(([b,disabled])=>{if(b.isConnected)b.disabled=disabled;});}
  }
  function render(){
    get('booking-membership').textContent=snapshot.isVerified?'✓ Verified player · You can apply to list a court.':'Court applications are for verified players. Membership is planned at ₱100/month with a profile checkmark. Subscription payments are not available yet.';
    const list=get('booking-courts');list.replaceChildren();
    for(const court of snapshot.courts){
      const b=button('',()=>{selected=court.id;load();},'booking-court');b.setAttribute('aria-pressed',String(court.id===selected));
      b.append(el('span',court.isTest?'TEST COURT':'VERIFIED COURT','eyebrow'),el('strong',court.name),el('span',court.address),el('small',`${money(court.rate)} / hour · ${hourLabel(court.openHour)}–${hourLabel(court.closeHour)}`));list.append(b);
    }
    if(!snapshot.courts.length)list.append(el('p','No approved courts yet. Apply to add yours.','booking-empty'));
    const detail=get('booking-detail');detail.replaceChildren();const court=snapshot.courts.find(c=>c.id===selected);
    if(court){
      if(court.photo){const img=el('img');img.src=court.photo;img.alt=`${court.name} court`;img.className='booking-photo';detail.append(img);}
      detail.append(el('span',court.isTest?'TRY THE BOOKING FLOW':'YOUR NEXT GOOD GAME','eyebrow'),el('h2',court.name),el('p',court.address),el('p',court.description));
      if(court.isTest)detail.append(el('p','Test court only. Reservations here do not reserve a real venue and no payment is collected.','booking-notice'));
      const label=el('label','Choose your date');label.htmlFor='booking-date';const input=el('input');input.type='date';input.id='booking-date';input.value=date;input.min=snapshot.today;input.max=snapshot.lastDate;
      input.addEventListener('change',()=>{if(input.value){date=input.value;load();}});detail.append(label,input,el('p',`${money(court.rate)} per hour · 1-hour sessions · Philippine time`,'booking-muted'));
      const slots=el('div',undefined,'booking-slots');
      for(const s of snapshot.slots){const b=button(`${hourLabel(s.hour)} · ${s.available?'Available':s.past?'Past':'Booked'}`,()=>{slot=s.hour;slots.querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));reserve.disabled=false;summary.textContent=`${date} · ${hourLabel(slot)}–${hourLabel(slot+1)} · ${money(court.rate)}`;},'booking-slot');b.disabled=!s.available;b.setAttribute('aria-pressed','false');slots.append(b);}
      const summary=el('p','Select an available time to continue.','booking-selection');summary.setAttribute('aria-live','polite');
      const reserve=button(court.isTest?'Confirm test booking ↗':'Confirm booking ↗',()=>{if(slot!==null)mutate('reserve',{courtId:selected,date,hour:slot},court.isTest?'Test booking confirmed. Find it under My bookings.':'Booking confirmed. Find it under My bookings.');},'button button-black');reserve.disabled=true;
      detail.append(slots,summary,reserve,el('p','Cancel here before your session starts. For paid courts, arrange payment directly with the owner; Sideout does not collect payment.','booking-muted'));
    }else detail.append(el('p','Choose an approved court to see availability.'));
    renderBookings('booking-mine',snapshot.bookings,false);renderBookings('booking-owner-reservations',snapshot.ownerBookings,true);
    const applications=get('booking-applications');applications.replaceChildren();
    for(const a of snapshot.applications){const item=el('article',undefined,'booking-row');item.append(el('strong',a.name),el('span',a.status==='approved'?'Approved · live for bookings':a.status==='rejected'?'Needs changes':'Pending verification','booking-badge'),el('p',a.reviewNote||'Sideout will review your court details and ownership information.'));if(a.status==='rejected')item.append(button('Edit and reapply',()=>openApplication(a)));applications.append(item);}
    if(!snapshot.applications.length)applications.append(el('p','Your court applications will appear here.','booking-muted'));
    get('booking-owner-panel').hidden=!snapshot.ownerBookings.length;
    get('booking-review-panel').hidden=!snapshot.isReviewer;
    const reviews=get('booking-reviews');reviews.replaceChildren();
    for(const a of snapshot.reviews){const card=el('article',undefined,'booking-review');card.append(el('h3',a.name),el('p',a.address),el('p',`${a.contact} · ${money(a.rate)} / hour · ${hourLabel(a.openHour)}–${hourLabel(a.closeHour)}`),el('p',`Ownership / business reference: ${a.evidence}`),el('p',a.description));if(a.photo){const img=el('img');img.src=a.photo;img.alt=a.name;img.className='booking-photo';card.append(img);}const note=el('textarea');note.placeholder='Review note (required when requesting changes)';note.maxLength=500;note.setAttribute('aria-label',`Review note for ${a.name}`);card.append(note,button('Approve court',()=>mutate('review',{applicationId:a.id,approve:true,note:note.value},'Court approved and open for bookings.')),button('Request changes',()=>{if(!note.value.trim()){note.focus();return;}mutate('review',{applicationId:a.id,approve:false,note:note.value},'Application returned with your review note.');}));reviews.append(card);}
    if(snapshot.isReviewer&&!snapshot.reviews.length)reviews.append(el('p','No pending applications.','booking-muted'));
  }
  function renderBookings(id,bookings,owner){
    const container=get(id);container.replaceChildren();
    for(const b of bookings){const item=el('article',undefined,'booking-row');item.append(el('strong',b.courtName),el('p',`${b.date} · ${hourLabel(b.hour)}–${hourLabel(b.hour+1)} · ${money(b.rate)}`),el('span',`${b.isTest?'Test · ':''}${b.status}`,'booking-badge'));if(owner)item.append(el('p',`Player: ${b.playerName} · ${b.playerCode}`));if(b.canCancel)item.append(button('Cancel booking',()=>{if(!item.querySelector('.booking-confirm'))item.append(confirmation('Cancel this reservation and release the time slot?',()=>mutate('cancel',{bookingId:b.id},'Booking cancelled. The time slot is available again.')));}));container.append(item);}
    if(!bookings.length)container.append(el('p',owner?'No upcoming reservations.':'Your bookings will appear here.','booking-empty'));
  }
  const form=get('booking-application-form');
  function openApplication(a){if(!snapshot){message('Load court details before applying.',true);return;}if(!snapshot.isVerified){message('Only verified players can apply for courts. Membership is planned at ₱100/month; subscription payments are not enabled yet.',true);get('booking-message').scrollIntoView({behavior:'smooth',block:'center'});return;}form.reset();form.dataset.applicationId=a?.id||'';for(const name of ['name','address','description','contact','evidence','rate','openHour','closeHour'])if(a)form.elements.namedItem(name).value=a[name];get('booking-application').open=true;form.elements.namedItem('name').focus();}
  get('booking-apply').addEventListener('click',()=>openApplication());
  get('booking-refresh').addEventListener('click',()=>{if(!busy)load();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!form.reportValidity())return;
    if(!snapshot?.isVerified){message('Only verified players can submit court applications.',true);return;}
    const data=Object.fromEntries(new FormData(form));data.applicationId=form.dataset.applicationId||null;
    if(Number(data.closeHour)<=Number(data.openHour)){message('Closing time must be later than opening time.',true);return;}
    try{const file=form.elements.namedItem('photo').files[0];data.photo=file?.size?await courtPhoto(file):null;
      if(await mutate('apply',data,'Application submitted. Your court will appear after Sideout verifies and approves it.')){form.reset();get('booking-application').open=false;}
    }catch(error){message(error.message,true);}
  });
  return{async handleNavigation(page){active=page==='courts';if(active&&!busy)await load();else version++;},destroy(){destroyed=true;version++;}};
}

async function courtPhoto(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw new Error('Choose a JPG, PNG, or WebP photo smaller than 8 MB.');
  const bitmap=await createImageBitmap(file);try{const canvas=document.createElement('canvas'),scale=Math.min(1,960/bitmap.width,640/bitmap.height);canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const result=canvas.toDataURL('image/jpeg',0.65);if(result.length>350000)throw new Error('This photo is too detailed. Please choose a smaller court photo.');return result;}finally{bitmap.close();}
}
