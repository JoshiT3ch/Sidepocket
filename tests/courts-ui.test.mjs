import test from 'node:test';
import assert from 'node:assert/strict';
import {initCourts} from '../dist/courts.js';
import {COURTS} from '../dist/courts-data.js';

class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.listeners={};this.hidden=false;this.disabled=false;this.checked=false;this.value='';this.className='';this._text='';}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(child=>child.textContent||'').join('');}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this._text='';this.children=[...children];}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(name,callback){(this.listeners[name]??=new Set()).add(callback);}
  removeEventListener(name,callback){this.listeners[name]?.delete(callback);}
  async emit(name,event={}){for(const callback of this.listeners[name]||[])await callback(event);}
  click(){if(!this.disabled)return this.emit('click');}
  getContext(){throw new Error('Sprites are visually verified in the browser.');}
}
const ids=['courts','court-list','court-detail','courts-status','courts-error','courts-error-message','courts-refresh','courts-retry','courts-summary'];
const descendants=node=>[node,...node.children.flatMap(descendants)];
const byClass=(node,name)=>descendants(node).find(child=>child.className.split(' ').includes(name));
const allClass=(node,name)=>descendants(node).filter(child=>child.className.split(' ').includes(name));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const me={id:'my-player',code:'SO-111111111111',name:'My Player',rating:1200,avatar:{shirt:'sky'}};
const other={id:'other-player',code:'SO-222222222222',name:'Court Friend',rating:1440,avatar:{shirt:'coral'}};
const now=1900000000000;

function setup({initial=[],override}={}){
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()])),doc=new Element('document');doc.hidden=false;doc.getElementById=id=>nodes[id];doc.createElement=tag=>new Element(tag);
  const calls=[],polls=new Map();let timerId=0,time=now,entries=initial.map(item=>({...item}));
  const snapshot=(id=null)=>({courts:COURTS.map(court=>({...court,playerCount:entries.filter(entry=>entry.courtId===court.id&&entry.expiresAt>time).length,openPlayCount:entries.filter(entry=>entry.courtId===court.id&&entry.expiresAt>time&&entry.openPlay).length})),selectedCourtId:id,players:id?entries.filter(entry=>entry.courtId===id&&entry.expiresAt>time):[],me:{player:me,checkIn:entries.find(entry=>entry.player.id===me.id&&entry.expiresAt>time)||null},serverTime:time,ttlMinutes:120,rosterLimit:100});
  const request=async(path,options={})=>{
    const body=options.body?JSON.parse(options.body):undefined,call={path,method:options.method||'GET',body};calls.push(call);
    if(override){const result=override(call,{snapshot,entries,setEntries:value=>{entries=value;}});if(result!==undefined)return result;}
    if(path==='/api/courts/check-in'){entries=entries.filter(entry=>entry.player.id!==me.id);entries.push({player:me,courtId:body.courtId,status:body.status,openPlay:body.openPlay,checkedInAt:time,updatedAt:time,expiresAt:time+7200000});return snapshot(body.courtId);}
    if(path==='/api/courts/leave'){entries=entries.filter(entry=>entry.player.id!==me.id);return snapshot(body.courtId);}
    return snapshot(path==='/api/courts'?null:decodeURIComponent(path.split('/').at(-1)));
  };
  const controller=initCourts({request,document:doc,now:()=>time,setInterval:(callback,delay)=>{const id=++timerId;polls.set(id,{callback,delay});return id;},clearInterval:id=>polls.delete(id)});
  const context={nodes,doc,calls,polls,controller,snapshot,setTime:value=>{time=value;},setEntries:value=>{entries=value;},async poll(){for(const {callback}of polls.values())callback();await tick();},choose:id=>nodes['court-list'].children.find(button=>button.dataset.courtId===id).click(),form:()=>byClass(nodes['court-detail'],'court-checkin'),submit:()=>byClass(nodes['court-detail'],'court-checkin').emit('submit',{preventDefault(){}}),status:async value=>{const input=descendants(nodes['court-detail']).find(node=>node.tagName==='INPUT'&&node.value===value);input.checked=true;await input.emit('change');},openPlay:async value=>{const input=descendants(nodes['court-detail']).find(node=>node.type==='checkbox');input.checked=value;await input.emit('change');}};
  return context;
}
const entry=(player=me,changes={})=>({player,courtId:COURTS[0].id,status:'idle',openPlay:false,checkedInAt:now,updatedAt:now,expiresAt:now+7200000,...changes});

test('courts initialize lazily, show all eight real venues and honest zero counts without checking anyone in',async()=>{
  const c=setup();try{
    assert.deepEqual(c.calls,[]);await c.controller.handleNavigation('profile');assert.deepEqual(c.calls,[]);
    await c.controller.handleNavigation('courts');
    assert.deepEqual(c.calls.map(call=>call.path),['/api/courts','/api/courts/paddle-grove']);
    assert.equal(c.nodes['court-list'].children.length,8);for(const court of COURTS)assert.match(c.nodes['court-list'].textContent,new RegExp(court.name));
    assert.match(c.nodes['courts-summary'].textContent,/8 local courts · 0 checked in · 0 up for open play/);
    assert.match(c.nodes['court-detail'].textContent,/Be the first to check in/);assert.match(c.nodes['court-detail'].textContent,/Your location is not tracked/);
    assert.equal(c.calls.some(call=>call.method==='POST'),false);assert.equal(c.polls.size,1);assert.equal([...c.polls.values()][0].delay,10000);
  }finally{c.controller.destroy();}
});

test('choose a court, check in, update status and open play, then leave without changing identity or sending client time',async()=>{
  const c=setup();try{
    await c.controller.handleNavigation('courts');await c.choose(COURTS[1].id);
    await c.submit();assert.deepEqual(c.calls.at(-1),{path:'/api/courts/check-in',method:'POST',body:{courtId:COURTS[1].id,status:'idle',openPlay:false}});
    assert.match(c.nodes['court-detail'].textContent,/You’re here · Idle/);assert.match(c.nodes['court-detail'].textContent,/My PlayerYou1,200 MMRIdle/);
    assert.match(c.nodes['courts-summary'].textContent,/1 checked in · 0 up for open play/);
    await c.status('playing');await c.openPlay(true);await c.submit();
    assert.deepEqual(c.calls.at(-1).body,{courtId:COURTS[1].id,status:'playing',openPlay:true});assert.match(c.nodes['court-detail'].textContent,/PlayingOpen play/);assert.match(c.nodes['courts-summary'].textContent,/1 up for open play/);
    await c.status('practice');await c.submit();assert.match(c.nodes['court-detail'].textContent,/You’re here · Practicing/);
    await byClass(c.nodes['court-detail'],'court-leave').click();assert.deepEqual(c.calls.at(-1),{path:'/api/courts/leave',method:'POST',body:{courtId:COURTS[1].id}});
    assert.match(c.nodes['court-detail'].textContent,/Be the first to check in/);assert.equal(byClass(c.nodes['court-detail'],'court-leave').hidden,true);
    await c.controller.refresh();assert.equal(allClass(c.nodes['court-detail'],'court-player').length,0);
  }finally{c.controller.destroy();}
});

test('returning player opens their checked-in court with persisted status, MMR, and other players',async()=>{
  const c=setup({initial:[entry(me,{courtId:COURTS[7].id,status:'practice',openPlay:true}),entry(other,{courtId:COURTS[7].id,status:'playing'})]});try{
    await c.controller.handleNavigation('courts');assert.equal(c.calls.at(-1).path,'/api/courts/the-bodega');
    assert.equal(allClass(c.nodes['court-detail'],'court-player').length,2);assert.match(c.nodes['court-detail'].textContent,/Court Friend1,440 MMRPlaying/);
    assert.equal(descendants(c.nodes['court-detail']).find(node=>node.value==='practice').checked,true);
    assert.equal(descendants(c.nodes['court-detail']).find(node=>node.type==='checkbox').checked,true);
    assert.match(c.nodes['court-detail'].textContent,/expires in 120m/);
    await c.choose(COURTS[0].id);assert.match(c.nodes['court-detail'].textContent,/You’re at The Bodega. Checking in here moves your check-in/);assert.equal(byClass(c.nodes['court-detail'],'court-leave').hidden,true);
    await c.submit();assert.equal(c.snapshot().me.checkIn.courtId,COURTS[0].id);assert.equal(c.snapshot().courts[7].playerCount,1);
  }finally{c.controller.destroy();}
});

test('polling reads only, preserves unsaved form choices, and stops while hidden or outside Courts',async()=>{
  const c=setup({initial:[entry()]});try{
    await c.controller.handleNavigation('courts');await c.status('playing');await c.openPlay(true);
    const form=c.form();await c.poll();assert.equal(c.form(),form,'background data must not replace the active form');
    assert.equal(descendants(c.nodes['court-detail']).find(node=>node.value==='playing').checked,true);assert.equal(descendants(c.nodes['court-detail']).find(node=>node.type==='checkbox').checked,true);
    assert.equal(c.calls.some(call=>call.method==='POST'),false,'reads must never renew a check-in');
    c.doc.hidden=true;await c.doc.emit('visibilitychange');assert.equal(c.polls.size,0);const calls=c.calls.length;await c.controller.refresh();assert.equal(c.calls.length,calls);
    c.doc.hidden=false;await c.doc.emit('visibilitychange');await tick();assert.equal(c.polls.size,1);assert.equal(c.calls.length,calls+1);
    await c.controller.handleNavigation('locker');assert.equal(c.polls.size,0);await c.controller.refresh();assert.equal(c.calls.length,calls+1);
    await c.controller.handleNavigation('courts');assert.equal(c.calls.length,calls+2);assert.equal(c.polls.size,1);
    c.controller.destroy();assert.equal(c.polls.size,0);await c.doc.emit('visibilitychange');assert.equal(c.calls.length,calls+2);
  }finally{c.controller.destroy();}
});

test('expired entries disappear on refresh without a leave or automatic check-in mutation',async()=>{
  const c=setup({initial:[entry()]});try{
    await c.controller.handleNavigation('courts');c.setTime(now+7200001);await c.poll();
    assert.match(c.nodes['court-detail'].textContent,/Be the first to check in/);assert.equal(byClass(c.nodes['court-detail'],'court-leave').hidden,true);assert.match(c.nodes['courts-summary'].textContent,/0 checked in/);assert.equal(c.calls.some(call=>call.method==='POST'),false);
  }finally{c.controller.destroy();}
});

test('offline expiry removes known stale players, own status, and counts even when a poll fails',async()=>{
  let offline=false;
  const c=setup({initial:[entry(me,{openPlay:true}),entry(other,{openPlay:true})],override:()=>{if(offline)throw new Error('You’re offline.');}});try{
    await c.controller.handleNavigation('courts');assert.match(c.nodes['courts-summary'].textContent,/2 checked in · 2 up for open play/);
    offline=true;c.setTime(now+7200001);await c.poll();
    assert.equal(c.nodes['courts-error'].hidden,false);assert.equal(allClass(c.nodes['court-detail'],'court-player').length,0);assert.match(c.nodes['court-detail'].textContent,/Be the first to check in/);
    assert.ok(!c.nodes['court-detail'].textContent.includes('You’re here'));assert.equal(byClass(c.nodes['court-detail'],'court-leave').hidden,true);
    assert.match(c.nodes['courts-summary'].textContent,/0 checked in · 0 up for open play/);assert.equal(c.calls.some(call=>call.method==='POST'),false);
  }finally{c.controller.destroy();}
});

test('a delayed old court response cannot replace the newly selected court or reapply after leaving the page',async()=>{
  const late=deferred();let deferOld=false;
  const c=setup({override:({path},{snapshot})=>deferOld&&path==='/api/courts/paddle-grove'?late.promise:undefined});try{
    await c.controller.handleNavigation('courts');deferOld=true;const old=c.controller.refresh();await tick();
    await c.choose(COURTS[1].id);assert.match(c.nodes['court-detail'].textContent,/Jerpits Pickleball Hub/);
    late.resolve(c.snapshot(COURTS[0].id));await old;assert.match(c.nodes['court-detail'].textContent,/Jerpits Pickleball Hub/);assert.equal(c.nodes['court-list'].children[1].attributes['aria-pressed'],'true');
    const previous=c.nodes['court-detail'].textContent;await c.controller.handleNavigation('profile');await c.controller.refresh();assert.equal(c.nodes['court-detail'].textContent,previous);
  }finally{c.controller.destroy();}
});

test('parallel navigation and refresh deduplicate reads and block double mutation while its response is pending',async()=>{
  const directory=deferred(),mutation=deferred();let delayDirectory=true;
  const c=setup({override:({path},{snapshot})=>path==='/api/courts'&&delayDirectory?directory.promise:path==='/api/courts/check-in'?mutation.promise:undefined});try{
    const first=c.controller.handleNavigation('courts'),second=c.controller.handleNavigation('courts'),third=c.controller.refresh();await tick();assert.equal(c.calls.length,1);
    delayDirectory=false;directory.resolve(c.snapshot());await Promise.all([first,second,third]);assert.equal(c.calls.filter(call=>call.path==='/api/courts/paddle-grove').length,1);
    const saving=c.submit();await tick();assert.equal(byClass(c.nodes['court-detail'],'court-checkin-actions').children[0].disabled,true);await c.submit();await c.controller.refresh();assert.equal(c.calls.filter(call=>call.method==='POST').length,1);
    mutation.resolve(c.snapshot(COURTS[0].id));await saving;assert.equal(byClass(c.nodes['court-detail'],'court-checkin-actions').children[0].disabled,false);
  }finally{c.controller.destroy();}
});

test('read errors offer retry; mutation errors retain the original check-in and unsaved choices',async()=>{
  let failRead=true,failMutation=true;
  const c=setup({override:({path})=>{if(path==='/api/courts'&&failRead)throw new Error('Network interrupted.');if(path==='/api/courts/check-in'&&failMutation)throw new Error('Could not save.');}});try{
    await c.controller.handleNavigation('courts');assert.equal(c.nodes['courts-error'].hidden,false);assert.match(c.nodes['courts-error-message'].textContent,/Network interrupted/);assert.equal(c.nodes['courts-retry'].disabled,false);
    failRead=false;await c.nodes['courts-retry'].click();assert.equal(c.nodes['courts-error'].hidden,true);
    await c.status('playing');await c.openPlay(true);await c.submit();assert.equal(c.nodes['courts-error'].hidden,false);assert.match(c.nodes['court-detail'].textContent,/Be the first to check in/);assert.equal(c.snapshot().me.checkIn,null);
    assert.equal(descendants(c.nodes['court-detail']).find(node=>node.type==='checkbox').checked,true);failMutation=false;await c.submit();assert.match(c.nodes['court-detail'].textContent,/You’re here · Playing/);assert.equal(c.nodes['courts-error'].hidden,true);
  }finally{c.controller.destroy();}
});

test('names are rendered as text, private fields are absent, and untrusted directions are not linked',async()=>{
  const hostile={...other,name:'<img src=x onerror=alert(1)>',email:'private@example.invalid'};
  const c=setup({initial:[entry(hostile)],override:(_call,{snapshot})=>{const data=snapshot(_call.path==='/api/courts'?null:COURTS[0].id);data.courts[0]={...data.courts[0],mapsUrl:'https://www.google.com.evil.test/maps'};return data;}});try{
    await c.controller.handleNavigation('courts');assert.ok(c.nodes['court-detail'].textContent.includes(hostile.name));assert.ok(!c.nodes['court-detail'].textContent.includes(hostile.email));assert.equal(descendants(c.nodes['court-detail']).some(node=>node.tagName==='IMG'),false);assert.equal(byClass(c.nodes['court-detail'],'court-directions'),undefined);
  }finally{c.controller.destroy();}
});
