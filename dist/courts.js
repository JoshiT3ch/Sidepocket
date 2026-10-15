import {drawAvatar} from './pixel-player.js';

const statuses={playing:'Playing',idle:'Idle',practice:'Practicing'};
const samePlayer=(a,b)=>Boolean(a&&b&&((a.id&&a.id===b.id)||(a.code&&a.code===b.code)));
const count=value=>Math.max(0,Number(value)||0).toLocaleString();
const validMapsUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'&&['www.google.com','google.com','maps.google.com','maps.app.goo.gl'].includes(url.hostname)&&((url.hostname==='maps.app.goo.gl')||url.pathname.startsWith('/maps'))?url.href:null;}catch{return null;}};

export function initCourts({request=(...args)=>window.sideoutService.request(...args),onNavigate=()=>{},document:doc=globalThis.document,setInterval:interval=globalThis.setInterval,clearInterval:cancelInterval=globalThis.clearInterval,now:clock=Date.now}={}){
  const root=doc?.getElementById('courts');
  if(!root)return{refresh:async()=>{},handleNavigation:async()=>{},destroy(){}};
  const byId=id=>doc.getElementById(id);
  const make=(tag,className='',text)=>{const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;};
  const list=byId('court-list'),detail=byId('court-detail'),notice=byId('courts-status'),errorBox=byId('courts-error');
  let active=false,destroyed=false,courts=[],selected=null,me=null,data=null,timer=null,pending=null,readVersion=0,loading=false,mutating=false,view=null,draft=null,lastReceived=0,directorySignature='';
  const visible=()=>active&&!destroyed&&!doc.hidden;
  const serverNow=()=>data?Number(data.serverTime)+Math.max(0,clock()-lastReceived):clock();
  const activeCheckIn=()=>me?.checkIn&&Number(me.checkIn.expiresAt)>serverNow()?me.checkIn:null;
  const visibleCourt=court=>{
    if(!data)return court;
    const expired=data.selectedCourtId===court.id?data.players.filter(entry=>Number(entry.expiresAt)<=serverNow()):[];
    const own=me?.checkIn;
    if(own?.courtId===court.id&&Number(own.expiresAt)<=serverNow()&&!expired.some(entry=>samePlayer(entry.player,me.player)))expired.push({...own,player:me.player});
    return{...court,playerCount:Math.max(0,Number(court.playerCount)-expired.length),openPlayCount:Math.max(0,Number(court.openPlayCount)-expired.filter(entry=>entry.openPlay).length)};
  };
  const addListener=(node,event,callback)=>{node.addEventListener(event,callback);return()=>node.removeEventListener?.(event,callback);};
  const cleanups=[];
  const setError=error=>{byId('courts-error-message').textContent=error?.status===401?'Your session has ended. Refresh the page to sign in again.':error?.message||'Please check your connection and try again.';errorBox.hidden=false;notice.textContent='Couldn’t load the latest check-ins. Please try again.';};
  const clearError=()=>{errorBox.hidden=true;};
  const syncBusy=()=>{
    root.setAttribute('aria-busy',String(loading||mutating));detail.setAttribute('aria-busy',String(loading||mutating));
    byId('courts-refresh').disabled=loading||mutating;byId('courts-retry').disabled=loading||mutating;
    for(const button of list.children)button.disabled=mutating;
    if(view){view.submit.disabled=mutating||loading;view.leave.disabled=mutating||loading;view.openPlay.disabled=mutating||loading;for(const input of view.radios)input.disabled=mutating||loading;}
  };
  const renderDirectory=()=>{
    const visibleCourts=courts.map(visibleCourt),signature=JSON.stringify([selected,visibleCourts]);
    if(signature!==directorySignature){
      directorySignature=signature;list.replaceChildren();
      for(const [index,court]of visibleCourts.entries()){
      const button=make('button','court-choice');button.type='button';button.dataset.courtId=court.id;button.setAttribute('aria-pressed',String(court.id===selected));
      const top=make('span','court-choice-top');top.append(make('span','court-choice-number',String(index+1).padStart(2,'0')),make('span','court-choice-arrow','↗'));
      button.append(top,make('strong','court-choice-name',court.name),make('span','court-choice-address',court.address));
      const stats=make('span','court-choice-stats');stats.append(make('span','',`${count(court.playerCount)} here`),make('span','court-choice-open',`${count(court.openPlayCount)} open play`));button.append(stats);
        button.addEventListener('click',()=>selectCourt(court.id));list.append(button);
      }
    }
    const total=visibleCourts.reduce((sum,court)=>sum+(Number(court.playerCount)||0),0),open=visibleCourts.reduce((sum,court)=>sum+(Number(court.openPlayCount)||0),0);
    byId('courts-summary').textContent=`${count(courts.length)} local courts · ${count(total)} checked in · ${count(open)} up for open play`;
    syncBusy();
  };
  const person=(entry,serverNow)=>{
    const player=entry.player,row=make('article',`court-player${samePlayer(player,me?.player)?' court-player-you':''}`);
    const art=make('div','court-player-art'),canvas=make('canvas','court-player-avatar');canvas.width=144;canvas.height=184;canvas.setAttribute('aria-hidden','true');
    try{drawAvatar(canvas.getContext('2d'),62,176,1.45,{...player.avatar,name:player.name});}catch{canvas.hidden=true;art.append(make('span','court-avatar-fallback','◈'));}art.append(canvas);
    const copy=make('div','court-player-copy'),name=make('strong','court-player-name',player.name||'Player');copy.append(name);
    if(samePlayer(player,me?.player))copy.append(make('span','court-you','You'));
    copy.append(make('span','court-player-mmr',`${count(player.rating)} MMR`));
    const state=make('div','court-player-state');state.append(make('span',`court-status court-status-${entry.status}`,statuses[entry.status]));
    if(entry.openPlay)state.append(make('span','court-open-badge','Open play'));
    const minutes=Math.max(0,Math.floor((serverNow-Number(entry.updatedAt))/60000));state.append(make('small','court-player-updated',minutes<1?'Updated just now':`Updated ${minutes}m ago`));
    row.append(art,copy,state);return row;
  };
  const createView=court=>{
    detail.replaceChildren();
    const header=make('div','court-detail-header'),eyebrow=make('div','eyebrow','THE COURT LINEUP'),title=make('h2','',court.name),address=make('p','court-detail-address',court.address);header.append(eyebrow,title,address);
    const maps=validMapsUrl(court.mapsUrl);if(maps){const link=make('a','court-directions','Get directions ↗');link.href=maps;link.target='_blank';link.rel='noopener noreferrer';header.append(link);}
    const checkin=make('form','court-checkin'),checkinTop=make('div','court-checkin-heading');checkinTop.append(make('span','eyebrow','YOUR COURT STATUS'));const ownNote=make('strong','court-own-note','Let the crew know you’re here.');checkinTop.append(ownNote);checkin.append(checkinTop);
    const fieldset=make('fieldset','court-status-fieldset');fieldset.append(make('legend','','What are you doing?'));const choices=make('div','court-status-options'),radios=[];
    for(const [value,label]of Object.entries(statuses)){const option=make('label',`court-status-option court-status-option-${value}`),input=make('input');input.type='radio';input.name='court-status';input.value=value;input.addEventListener('change',()=>{if(input.checked){draft.status=value;draft.dirty=true;}});option.append(input,make('span','',label));choices.append(option);radios.push(input);}fieldset.append(choices);checkin.append(fieldset);
    const openLabel=make('label','court-open-option'),openPlay=make('input');openPlay.type='checkbox';openPlay.addEventListener('change',()=>{draft.openPlay=openPlay.checked;draft.dirty=true;});openLabel.append(openPlay,make('span','','Available for open play'));checkin.append(openLabel);
    const actions=make('div','court-checkin-actions'),submit=make('button','button button-black','I’m here ↗'),leave=make('button','button court-leave','Leave court');submit.type='submit';leave.type='button';leave.addEventListener('click',()=>mutate('/api/courts/leave',{courtId:selected}));actions.append(submit,leave);checkin.append(actions);
    const privacy=make('p','court-checkin-privacy','Checking in shares this court, your character, rating, and status with signed-in players for 2 hours. Your location is not tracked.');checkin.append(privacy);
    checkin.addEventListener('submit',event=>{event.preventDefault();return mutate('/api/courts/check-in',{courtId:selected,status:draft.status,openPlay:draft.openPlay});});
    const rosterHeader=make('div','court-roster-heading');rosterHeader.append(make('h3','','Who’s here?'));const rosterCount=make('span','court-roster-count');rosterHeader.append(rosterCount);
    const roster=make('div','court-roster'),rosterNote=make('p','court-roster-note');detail.append(header,checkin,rosterHeader,roster,rosterNote);
    view={courtId:court.id,ownNote,submit,leave,openPlay,radios,roster,rosterCount,rosterNote};
  };
  const renderDetail=()=>{
    const rawCourt=courts.find(item=>item.id===selected);if(!rawCourt||data?.selectedCourtId!==selected)return;
    const court=visibleCourt(rawCourt);
    if(!view||view.courtId!==selected)createView(court);
    const own=activeCheckIn(),here=own?.courtId===selected;
    if(!draft||draft.courtId!==selected||!draft.dirty)draft={courtId:selected,status:here?own.status:'idle',openPlay:here?own.openPlay:false,dirty:false};
    for(const input of view.radios)input.checked=input.value===draft.status;view.openPlay.checked=Boolean(draft.openPlay);
    view.submit.textContent=here?'Update check-in ↗':'I’m here ↗';view.leave.hidden=!own;
    const ownCourt=courts.find(item=>item.id===own?.courtId);
    if(here){const remaining=Math.max(0,Math.ceil((Number(own.expiresAt)-serverNow())/60000));view.ownNote.textContent=`You’re here · ${statuses[own.status]} · expires in ${remaining}m`;}else view.ownNote.textContent=ownCourt?`You’re at ${ownCourt.name}. Checking in here moves your check-in.`:'Let the crew know you’re here.';
    // A leave action applies only to the selected court. Navigate to the active
    // court instead of presenting a misleading leave action on another venue.
    view.leave.hidden=!here;
    const currentTime=serverNow(),entries=data.players.filter(entry=>Number(entry.expiresAt)>currentTime);
    view.rosterCount.textContent=`${count(court.playerCount)} checked in`;
    const rosterSignature=JSON.stringify(entries.map(entry=>[entry.player.id,entry.player.name,entry.player.rating,entry.player.avatar,entry.status,entry.openPlay,Math.max(0,Math.floor((currentTime-Number(entry.updatedAt))/60000))]));
    if(view.rosterSignature!==rosterSignature){
      view.rosterSignature=rosterSignature;view.roster.replaceChildren();
      if(entries.length){for(const entry of entries)view.roster.append(person(entry,currentTime));}else{const empty=make('div','court-empty');empty.append(make('span','court-empty-symbol','⌗'),make('strong','','Be the first to check in.'),make('p','','No active check-ins here yet. If you’re at the court, let your people know.'));view.roster.append(empty);}
    }
    view.rosterNote.textContent=Number(court.playerCount)>entries.length?`Showing ${count(entries.length)} of ${count(court.playerCount)} players. Check-ins are self-reported and expire after 2 hours.`:'Self-reported check-ins · refreshes every 10 seconds while this page is open.';
    syncBusy();
  };
  const validate=next=>{if(!Array.isArray(next?.courts)||!Array.isArray(next.players)||!next.me?.player||!Number.isFinite(Number(next.serverTime)))throw new Error('The courts are unavailable right now. Please try again.');for(const entry of next.players)if(!entry?.player||!statuses[entry.status])throw new Error('The court roster is unavailable right now. Please refresh.');return next;};
  const renderExpiry=()=>{if(data){renderDirectory();renderDetail();}};
  const apply=next=>{validate(next);courts=next.courts;me=next.me;data=next;lastReceived=clock();renderDirectory();if(next.selectedCourtId===selected)renderDetail();notice.textContent='Latest check-ins loaded. Pick a court and say you’re here.';clearError();};
  const read=(path,expected)=>{
    if(pending?.path===path)return pending.promise;
    const version=++readVersion;loading=true;syncBusy();notice.textContent='Checking the local courts…';
    const promise=(async()=>{
      try{const next=validate(await Promise.resolve().then(()=>request(path)));if(destroyed||!active||version!==readVersion||selected!==expected)return false;if(next.selectedCourtId!==expected)throw new Error('The selected court could not be loaded. Please refresh.');apply(next);return true;}
      catch(error){if(!destroyed&&active&&version===readVersion){renderExpiry();setError(error);}return false;}
      finally{if(version===readVersion){loading=false;pending=null;syncBusy();}}
    })();pending={path,promise};return promise;
  };
  async function selectCourt(id){
    if(destroyed||mutating||!courts.some(court=>court.id===id))return;
    if(id!==selected){selected=id;draft=null;view=null;detail.replaceChildren(make('div','court-loading','Loading this court’s lineup…'));renderDirectory();}
    return read(`/api/courts/${encodeURIComponent(id)}`,id);
  }
  async function refresh(){
    if(!visible()||mutating)return;
    if(selected)return read(`/api/courts/${encodeURIComponent(selected)}`,selected);
    const loaded=await read('/api/courts',null);
    if(loaded&&visible()&&!selected){const id=courts.find(court=>court.id===activeCheckIn()?.courtId)?.id||courts[0]?.id;if(id)return selectCourt(id);}
  }
  async function mutate(path,body){
    if(!visible()||mutating||loading||!selected)return;
    mutating=true;++readVersion;pending=null;loading=false;syncBusy();clearError();notice.textContent=path.endsWith('/leave')?'Leaving the court…':'Saving your check-in…';
    try{const next=validate(await request(path,{method:'POST',body:JSON.stringify(body)}));if(destroyed)return;draft=null;apply(next);notice.textContent=path.endsWith('/leave')?'You’ve left the court. See you next game.':'You’re checked in. Your crew can see your court status.';}
    catch(error){if(!destroyed){renderExpiry();setError(error);}}
    finally{mutating=false;if(!destroyed)syncBusy();}
  }
  const stopPolling=()=>{if(timer!==null){cancelInterval(timer);timer=null;}};
  const startPolling=()=>{if(visible()&&timer===null)timer=interval(()=>{if(visible()){renderExpiry();if(!mutating&&!loading)refresh();}},10000);};
  const onVisibility=()=>{stopPolling();if(visible()){refresh();startPolling();}};
  cleanups.push(addListener(byId('courts-refresh'),'click',refresh),addListener(byId('courts-retry'),'click',refresh),addListener(doc,'visibilitychange',onVisibility));
  return{refresh,async handleNavigation(page){const wasActive=active;active=page==='courts';if(!active){stopPolling();++readVersion;pending=null;loading=false;syncBusy();return;}startPolling();if(!wasActive||!lastReceived)return refresh();},destroy(){destroyed=true;active=false;++readVersion;stopPolling();for(const cleanup of cleanups)cleanup();}};
}
