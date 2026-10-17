import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initFriends} from '../dist/friends.js';

class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.attributes={};this.className='';this._text='';this.value='';this.hidden=false;this.disabled=false;this.focused=false;this.checked=false;}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(child=>child.textContent||'').join('');}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this._text='';this.children=[...children];}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(name,callback){(this.listeners[name]??=new Set()).add(callback);}
  removeEventListener(name,callback){this.listeners[name]?.delete(callback);}
  async emit(name,event={}){for(const callback of this.listeners[name]||[])await callback(event);}
  click(){return this.disabled?undefined:this.emit('click');}
  focus(){this.focused=true;}
  getContext(){throw new Error('Character artwork is verified in the browser.');}
}
const ids=['friends','friend-request-form','friend-player-code','friend-request-submit','friends-status','friends-error','friends-error-message','friends-refresh','friends-retry','friends-open-play','friends-count','friends-summary','friend-list','friend-incoming','friend-outgoing','friend-friends-count','friend-incoming-count','friend-outgoing-count','friend-presence-form','friend-presence-status','friend-presence-court','friend-share-status','friend-share-location','friend-presence-save','friend-presence-hide','friend-presence-summary'];
const descendants=node=>[node,...node.children.flatMap(descendants)];
const buttons=node=>descendants(node).filter(child=>child.tagName==='BUTTON');
const click=async(node,label)=>{const button=buttons(node).find(item=>item.textContent===label);assert.ok(button,`Missing action: ${label}`);return button.click();};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const idsFor=['a1111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222','c3333333-3333-4333-8333-333333333333'];
const friend={id:'player-1',code:'SO-111111111111',name:'Court Friend',rating:1320,games:6,wins:4,avatar:{shirt:'sky'}};
const other={...friend,id:'player-2',code:'SO-222222222222',name:'Another Player'};
const relationship=(player=friend,index=0)=>({id:idsFor[index],player,createdAt:'2026-10-17T08:00:00Z'});
const now=1900000000000;
const courts=[{id:'paddle-grove',name:'Paddle Grove'},{id:'the-bodega',name:'The Bodega'}];
const ownPresence=(changes={})=>({status:'available',courtId:null,shareStatus:false,shareLocation:false,updatedAt:null,expiresAt:null,...changes});
const sharedPresence=(changes={})=>({status:'playing',court:{id:'paddle-grove',name:'Paddle Grove'},expiresAt:now+7200000,...changes});
const snapshot=(changes={})=>({friends:[],incoming:[],outgoing:[],me:{presence:ownPresence()},courts,serverTime:now,...changes});
function setup({initial=snapshot(),override}={}){
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()])),doc=new Element('document');doc.hidden=false;doc.createElement=tag=>new Element(tag);doc.getElementById=id=>nodes[id];
  const calls=[],routes=[],polls=new Map();let current=initial,timer=0,time=now;
  const request=(path,options={})=>{
    const call={path,method:options.method||'GET',body:options.body===undefined?undefined:JSON.parse(options.body)};calls.push(call);
    if(override){const result=override(call,{get:()=>current,set:value=>{current=value;}});if(result!==undefined)return result;}
    if(path==='/api/friends/request'){if(!current.outgoing.some(item=>item.player.code===call.body.playerCode))current={...current,outgoing:[relationship()]};}
    else if(path==='/api/friends/presence'){current={...current,serverTime:time,me:{presence:{...call.body,updatedAt:time,expiresAt:call.body.shareStatus||call.body.shareLocation?time+7200000:null}}};}
    else if(path==='/api/friends/presence/hide'){current={...current,serverTime:time,me:{presence:ownPresence({updatedAt:time})}};}
    else if(path.endsWith('/respond')){const id=path.split('/')[3],item=current.incoming.find(item=>item.id===id);current={...current,incoming:current.incoming.filter(item=>item.id!==id),friends:call.body.accept?[...current.friends,item]:current.friends};}
    else if(path.endsWith('/cancel'))current={...current,outgoing:current.outgoing.filter(item=>item.id!==path.split('/')[3])};
    else if(path.endsWith('/remove'))current={...current,friends:current.friends.filter(item=>item.id!==path.split('/')[3])};
    return current;
  };
  const controller=initFriends({request,document:doc,now:()=>time,onNavigate:page=>routes.push(page),setInterval:(callback,delay)=>{const id=++timer;polls.set(id,{callback,delay});return id;},clearInterval:id=>polls.delete(id)});
  return{nodes,doc,calls,routes,polls,controller,setTime:value=>{time=value;},async expire(){for(const {callback,delay}of polls.values())if(delay===1000)callback();await tick();},presenceSubmit:()=>nodes['friend-presence-form'].emit('submit',{preventDefault(){}}),async field(id,value){const node=nodes[id];if(typeof value==='boolean')node.checked=value;else node.value=value;await node.emit('change');},set:value=>{current=value;},get:()=>current,submit:()=>nodes['friend-request-form'].emit('submit',{preventDefault(){}}),async poll(){for(const {callback}of polls.values())callback();await tick();}};
}

test('Friends loads on navigation, shows honest empty states, and links to player QR without a mutation',async()=>{
  const c=setup();try{
    assert.equal(c.calls.length,0);await c.controller.handleNavigation('profile');assert.equal(c.calls.length,0);
    await c.controller.handleNavigation('friends');assert.deepEqual(c.calls,[{path:'/api/friends',method:'GET',body:undefined}]);
    assert.equal(c.nodes['friends-count'].textContent,'0');assert.match(c.nodes['friend-list'].textContent,/Your crew starts here/);assert.match(c.nodes['friend-incoming'].textContent,/No requests waiting/);assert.match(c.nodes['friend-outgoing'].textContent,/No requests sent/);
    assert.equal(c.polls.size,2);assert.deepEqual([...c.polls.values()].map(item=>item.delay),[20000,1000]);await c.nodes['friends-open-play'].click();assert.deepEqual(c.routes,['play']);
  }finally{c.controller.destroy();}
});

test('a player link submits only its normalized public code and displays the pending request',async()=>{
  const c=setup();try{
    await c.controller.handleNavigation('friends');c.nodes['friend-player-code'].value='https://sideout.example/?player=so-111111111111#play';await c.submit();
    assert.deepEqual(c.calls.at(-1),{path:'/api/friends/request',method:'POST',body:{playerCode:friend.code}});assert.equal(c.nodes['friend-player-code'].value,'');
    assert.match(c.nodes['friend-outgoing'].textContent,/Court Friend/);assert.match(c.nodes['friends-status'].textContent,/Friend request sent/);assert.equal(c.nodes['friends-count'].textContent,'0');
  }finally{c.controller.destroy();}
});

test('invalid or ambiguous codes fail locally and keep the draft available to correct',async()=>{
  const c=setup();try{
    await c.controller.handleNavigation('friends');const count=c.calls.length;
    for(const value of ['wrong','javascript:alert(1)','https://sideout.example/?player=SO-111111111111&player=SO-222222222222']){
      c.nodes['friend-player-code'].value=value;await c.submit();assert.equal(c.calls.length,count);assert.equal(c.nodes['friend-player-code'].value,value);assert.equal(c.nodes['friends-error'].hidden,false);assert.equal(c.nodes['friend-player-code'].focused,true);
    }
  }finally{c.controller.destroy();}
});

test('incoming requests can be accepted or declined and outgoing requests cancelled with exact relationship IDs',async()=>{
  const c=setup({initial:snapshot({incoming:[relationship(),relationship(other,1)],outgoing:[relationship({...other,id:'player-3'},2)]})});try{
    await c.controller.handleNavigation('friends');await click(c.nodes['friend-incoming'].children[0],'Accept friend ↗');
    assert.deepEqual(c.calls.at(-1),{path:`/api/friends/${idsFor[0]}/respond`,method:'POST',body:{accept:true}});assert.match(c.nodes['friend-list'].textContent,/Court Friend/);assert.equal(c.nodes['friends-count'].textContent,'1');
    await click(c.nodes['friend-incoming'],'Decline');assert.deepEqual(c.calls.at(-1).body,{accept:false});assert.match(c.nodes['friend-incoming'].textContent,/No requests waiting/);
    await click(c.nodes['friend-outgoing'],'Cancel request');assert.equal(c.calls.at(-1).path,`/api/friends/${idsFor[2]}/cancel`);assert.deepEqual(c.calls.at(-1).body,{});assert.match(c.nodes['friend-outgoing'].textContent,/No requests sent/);
  }finally{c.controller.destroy();}
});

test('removing a friend requires an inline confirmation and allows keeping the friend',async()=>{
  const c=setup({initial:snapshot({friends:[relationship()]})});try{
    await c.controller.handleNavigation('friends');const count=c.calls.length;await click(c.nodes['friend-list'],'Remove friend');assert.equal(c.calls.length,count);assert.match(c.nodes['friend-list'].textContent,/Remove Court Friend/);
    await click(c.nodes['friend-list'],'Keep friend');assert.equal(c.calls.length,count);assert.equal(c.nodes['friend-list'].textContent.includes('Yes, remove'),false);
    await click(c.nodes['friend-list'],'Remove friend');await c.poll();assert.match(c.nodes['friend-list'].textContent,/Yes, remove/);await click(c.nodes['friend-list'],'Yes, remove');
    assert.deepEqual(c.calls.at(-1),{path:`/api/friends/${idsFor[0]}/remove`,method:'POST',body:{}});assert.equal(c.nodes['friends-count'].textContent,'0');
  }finally{c.controller.destroy();}
});

test('background polling retains input and unchanged player DOM, pauses when hidden and stops outside Friends',async()=>{
  const c=setup({initial:snapshot({friends:[relationship()]})});try{
    await c.controller.handleNavigation('friends');const row=c.nodes['friend-list'].children[0];c.nodes['friend-player-code'].value='SO-22';await c.poll();assert.equal(c.nodes['friend-list'].children[0],row);assert.equal(c.nodes['friend-player-code'].value,'SO-22');
    c.doc.hidden=true;await c.doc.emit('visibilitychange');assert.equal(c.polls.size,0);const count=c.calls.length;await c.controller.refresh();assert.equal(c.calls.length,count);
    c.doc.hidden=false;await c.doc.emit('visibilitychange');await tick();assert.equal(c.polls.size,2);assert.equal(c.calls.length,count+1);
    await c.controller.handleNavigation('play');assert.equal(c.polls.size,0);await c.controller.refresh();assert.equal(c.calls.length,count+1);await c.controller.handleNavigation('friends');assert.equal(c.calls.length,count+2);
    c.controller.destroy();assert.equal(c.polls.size,0);await c.doc.emit('visibilitychange');assert.equal(c.calls.length,count+2);
  }finally{c.controller.destroy();}
});

test('simultaneous reads deduplicate and a stale read cannot overwrite a later mutation',async()=>{
  const delayed=deferred();let delay=true;const c=setup({override:call=>call.method==='GET'&&delay?delayed.promise:undefined});try{
    const first=c.controller.handleNavigation('friends'),second=c.controller.refresh();await tick();assert.equal(c.calls.length,1);
    c.nodes['friend-player-code'].value=friend.code;await c.submit();assert.match(c.nodes['friend-outgoing'].textContent,/Court Friend/);
    delay=false;delayed.resolve(snapshot());await Promise.all([first,second]);assert.match(c.nodes['friend-outgoing'].textContent,/Court Friend/);assert.equal(c.nodes.friends.attributes['aria-busy'],'false');
  }finally{c.controller.destroy();}
});

test('mutation controls prevent duplicate requests and polling until the response completes',async()=>{
  const delayed=deferred();const c=setup({override:call=>call.method==='POST'?delayed.promise:undefined});try{
    await c.controller.handleNavigation('friends');c.nodes['friend-player-code'].value=friend.code;const save=c.submit();await tick();
    assert.equal(c.nodes['friend-request-submit'].disabled,true);assert.equal(c.nodes['friend-player-code'].disabled,true);assert.equal(c.nodes['friends-refresh'].disabled,true);
    await c.submit();await c.poll();await c.controller.refresh();assert.equal(c.calls.filter(call=>call.method==='POST').length,1);assert.equal(c.calls.filter(call=>call.method==='GET').length,1);
    delayed.resolve(snapshot({outgoing:[relationship()]}));await save;assert.equal(c.nodes['friend-request-submit'].disabled,false);assert.equal(c.nodes.friends.attributes['aria-busy'],'false');
  }finally{c.controller.destroy();}
});

test('network errors provide retry and failed mutations retain drafts and existing friends',async()=>{
  let failRead=true,failWrite=true;const c=setup({initial:snapshot({friends:[relationship(other,1)]}),override:call=>{if(call.method==='GET'&&failRead)throw new Error('Connection interrupted.');if(call.method==='POST'&&failWrite)throw new Error('Player not found. Check their code.');}});try{
    await c.controller.handleNavigation('friends');assert.equal(c.nodes['friends-error'].hidden,false);assert.match(c.nodes['friends-error-message'].textContent,/Connection interrupted/);
    failRead=false;await c.nodes['friends-retry'].click();assert.match(c.nodes['friend-list'].textContent,/Another Player/);assert.equal(c.nodes['friends-error'].hidden,true);
    c.nodes['friend-player-code'].value=friend.code;await c.submit();assert.match(c.nodes['friends-error-message'].textContent,/Player not found/);assert.equal(c.nodes['friend-player-code'].value,friend.code);assert.match(c.nodes['friend-list'].textContent,/Another Player/);
    failWrite=false;await c.submit();assert.equal(c.nodes['friend-player-code'].value,'');assert.equal(c.nodes['friends-error'].hidden,true);
  }finally{c.controller.destroy();}
});

test('late navigation or destroyed reads cannot repaint Friends and malformed snapshots preserve the last list',async()=>{
  const delayed=deferred();let next;const c=setup({initial:snapshot({friends:[relationship()]}),override:()=>next});try{
    await c.controller.handleNavigation('friends');next=snapshot({friends:[{...relationship(),id:'../../other-path'}]});await c.controller.refresh();assert.match(c.nodes['friend-list'].textContent,/Court Friend/);assert.equal(c.nodes['friends-error'].hidden,false);
    next=delayed.promise;const read=c.controller.refresh();await tick();await c.controller.handleNavigation('profile');delayed.resolve(snapshot());await read;assert.match(c.nodes['friend-list'].textContent,/Court Friend/);
    const afterDestroy=deferred();next=afterDestroy.promise;const open=c.controller.handleNavigation('friends');await tick();c.controller.destroy();afterDestroy.resolve(snapshot());await open;assert.equal(c.nodes['friend-list'].textContent.includes('Court Friend'),false);
  }finally{c.controller.destroy();}
});

test('untrusted names stay text, private fields are absent, and the feature uses lazy navigation',async()=>{
  const hostile={...friend,name:'<img src=x onerror=alert(1)>',email:'private@example.invalid',phone:'secret phone'};const c=setup({initial:snapshot({friends:[relationship(hostile)]})});try{
    await c.controller.handleNavigation('friends');assert.ok(c.nodes['friend-list'].textContent.includes(hostile.name));assert.ok(!c.nodes['friend-list'].textContent.includes(hostile.email));assert.ok(!c.nodes['friend-list'].textContent.includes(hostile.phone));assert.equal(descendants(c.nodes['friend-list']).some(node=>node.tagName==='IMG'),false);
    const [app,html]=await Promise.all([readFile(new URL('../dist/app.js',import.meta.url),'utf8'),readFile(new URL('../dist/index.html',import.meta.url),'utf8')]);assert.match(app,/import\('\.\/friends\.js'\)/);assert.match(html,/data-page="friends"/);assert.match(html,/id="friend-request-form"/);
  }finally{c.controller.destroy();}
});

test('sharing defaults are off, courts are manual choices, and reads never publish a presence',async()=>{
  const c=setup();try{
    assert.equal(c.nodes['friend-presence-save'].disabled,true);await c.controller.handleNavigation('friends');
    assert.equal(c.nodes['friend-share-status'].checked,false);assert.equal(c.nodes['friend-share-location'].checked,false);assert.equal(c.nodes['friend-presence-status'].value,'available');assert.equal(c.nodes['friend-presence-court'].value,'');
    assert.equal(c.nodes['friend-presence-court'].children.length,3);assert.match(c.nodes['friend-presence-summary'].textContent,/private with friends/);await c.poll();assert.equal(c.calls.some(call=>call.method==='POST'),false);
    const [source,html,courtSource]=await Promise.all([readFile(new URL('../dist/friends.js',import.meta.url),'utf8'),readFile(new URL('../dist/index.html',import.meta.url),'utf8'),readFile(new URL('../dist/courts.js',import.meta.url),'utf8')]);
    assert.equal(/navigator\.geolocation|watchPosition|getCurrentPosition/.test(source),false);assert.match(html,/Turning court sharing off also clears your public court check-in/);assert.match(courtSource,/even with Friends sharing off/);assert.match(courtSource,/Hide status & whereabouts clears your check-in/);
  }finally{c.controller.destroy();}
});

test('status and manually selected court sharing can be saved independently with explicit booleans',async()=>{
  const c=setup();try{
    await c.controller.handleNavigation('friends');await c.field('friend-presence-status','practice');await c.field('friend-share-status',true);await c.presenceSubmit();
    assert.deepEqual(c.calls.at(-1),{path:'/api/friends/presence',method:'POST',body:{status:'practice',courtId:null,shareStatus:true,shareLocation:false}});assert.match(c.nodes['friend-presence-summary'].textContent,/Sharing status with friends/);assert.match(c.nodes['friends-status'].textContent,/public court check-in was cleared/);
    await c.field('friend-share-status',false);await c.field('friend-presence-court','the-bodega');await c.field('friend-share-location',true);await c.presenceSubmit();
    assert.deepEqual(c.calls.at(-1).body,{status:'practice',courtId:'the-bodega',shareStatus:false,shareLocation:true});assert.match(c.nodes['friend-presence-summary'].textContent,/Sharing court with friends/);
    await c.controller.handleNavigation('profile');await c.controller.handleNavigation('friends');assert.equal(c.nodes['friend-share-status'].checked,false);assert.equal(c.nodes['friend-share-location'].checked,true);assert.equal(c.nodes['friend-presence-court'].value,'the-bodega');
  }finally{c.controller.destroy();}
});

test('sharing whereabouts requires a known manually chosen court and retains the draft on failure',async()=>{
  let fail=false;const c=setup({override:call=>{if(fail&&call.method==='POST')throw new Error('Connection interrupted.');}});try{
    await c.controller.handleNavigation('friends');await c.field('friend-share-location',true);const count=c.calls.length;await c.presenceSubmit();assert.equal(c.calls.length,count);assert.equal(c.nodes['friend-presence-court'].focused,true);assert.match(c.nodes['friends-error-message'].textContent,/Choose a court/);
    await c.field('friend-presence-court','unknown-court');await c.presenceSubmit();assert.equal(c.calls.length,count);
    await c.field('friend-presence-court','paddle-grove');fail=true;await c.presenceSubmit();assert.equal(c.nodes['friend-share-location'].checked,true);assert.equal(c.nodes['friend-presence-court'].value,'paddle-grove');assert.match(c.nodes['friends-error-message'].textContent,/Connection interrupted/);
  }finally{c.controller.destroy();}
});

test('only accepted friends show active allowed presence and private details stay separate',async()=>{
  const accepted={...relationship(),presence:sharedPresence({court:{id:'paddle-grove',name:'<script>Court</script>'},email:'private@example.invalid',updatedAt:now})};
  const pending={...relationship(other,1),presence:sharedPresence({status:'away',court:{id:'the-bodega',name:'Secret Pending Court'}})};
  const c=setup({initial:snapshot({friends:[accepted],incoming:[pending],outgoing:[pending]})});try{
    await c.controller.handleNavigation('friends');assert.match(c.nodes['friend-list'].textContent,/Playing/);assert.ok(c.nodes['friend-list'].textContent.includes('At <script>Court</script>'));assert.equal(descendants(c.nodes['friend-list']).some(node=>node.tagName==='SCRIPT'),false);assert.equal(c.nodes['friend-list'].textContent.includes('private@example.invalid'),false);assert.equal(c.nodes['friend-list'].textContent.includes(String(now)),false);
    for(const kind of ['incoming','outgoing']){assert.equal(c.nodes[`friend-${kind}`].textContent.includes('Secret Pending Court'),false);assert.equal(c.nodes[`friend-${kind}`].textContent.includes('Away'),false);}
    c.set(snapshot({friends:[{...relationship(),presence:sharedPresence({status:null})},{...relationship(other,1),presence:sharedPresence({court:null})}]}));await c.controller.refresh();assert.match(c.nodes['friend-list'].textContent,/Status privateAt Paddle Grove/);assert.match(c.nodes['friend-list'].textContent,/PlayingCourt private/);
    c.set(snapshot({friends:[{...relationship(),presence:null}]}));await c.controller.refresh();assert.match(c.nodes['friend-list'].textContent,/Status & whereabouts private/);assert.equal(c.nodes['friend-list'].textContent.includes('At Paddle Grove'),false);
  }finally{c.controller.destroy();}
});

test('the hide action clears own sharing and court selection with one request and no friend removal',async()=>{
  const c=setup({initial:snapshot({friends:[relationship()],me:{presence:ownPresence({status:'playing',courtId:'paddle-grove',shareStatus:true,shareLocation:true,updatedAt:now,expiresAt:now+7200000})}})});try{
    await c.controller.handleNavigation('friends');assert.match(c.nodes['friend-presence-summary'].textContent,/Sharing status and court/);await c.nodes['friend-presence-hide'].click();
    assert.deepEqual(c.calls.at(-1),{path:'/api/friends/presence/hide',method:'POST',body:{}});assert.equal(c.nodes['friend-share-status'].checked,false);assert.equal(c.nodes['friend-share-location'].checked,false);assert.equal(c.nodes['friend-presence-court'].value,'');assert.match(c.nodes['friend-presence-summary'].textContent,/private with friends/);assert.match(c.nodes['friends-status'].textContent,/public court check-in was cleared/);assert.equal(c.nodes['friends-count'].textContent,'1');
  }finally{c.controller.destroy();}
});

test('polls preserve unsaved sharing choices and expiry clears cached presence during stalled or failed reads',async()=>{
  const delayed=deferred();let stalled=false;const c=setup({initial:snapshot({friends:[{...relationship(),presence:sharedPresence({expiresAt:now+1000})}],me:{presence:ownPresence({courtId:'paddle-grove',shareStatus:true,shareLocation:true,expiresAt:now+1000})}}),override:call=>stalled&&call.method==='GET'?delayed.promise:undefined});try{
    c.setTime(now+86400000);await c.controller.handleNavigation('friends');assert.match(c.nodes['friend-list'].textContent,/At Paddle Grove/);await c.field('friend-presence-status','away');await c.field('friend-presence-court','the-bodega');
    await c.controller.refresh();assert.equal(c.nodes['friend-presence-status'].value,'away');assert.equal(c.nodes['friend-presence-court'].value,'the-bodega');stalled=true;const reading=c.controller.refresh();await tick();
    c.setTime(now+86401001);await c.expire();assert.equal(c.nodes['friend-list'].textContent.includes('At Paddle Grove'),false);assert.equal(c.nodes['friend-list'].textContent.includes('Playing'),false);assert.match(c.nodes['friend-list'].textContent,/private/);assert.match(c.nodes['friend-presence-summary'].textContent,/private with friends/);assert.equal(c.nodes['friend-presence-status'].value,'away');assert.equal(c.nodes['friend-presence-court'].value,'the-bodega');
    delayed.reject(new Error('Offline'));await reading;assert.equal(c.nodes['friend-list'].textContent.includes('At Paddle Grove'),false);assert.match(c.nodes['friends-error-message'].textContent,/Offline/);assert.equal(c.calls.some(call=>call.method==='POST'),false);
  }finally{c.controller.destroy();}
});

test('expired sharing returns hidden on reentry before a network response and timers stop while hidden',async()=>{
  let fail=false;const c=setup({initial:snapshot({friends:[{...relationship(),presence:sharedPresence({expiresAt:now+1000})}],me:{presence:ownPresence({shareStatus:true,expiresAt:now+1000})}}),override:call=>{if(fail&&call.method==='GET')throw new Error('Offline');}});try{
    await c.controller.handleNavigation('friends');await c.controller.handleNavigation('play');fail=true;c.setTime(now+1001);const open=c.controller.handleNavigation('friends');assert.equal(c.nodes['friend-list'].textContent.includes('Playing'),false);await open;
    assert.equal(c.nodes['friend-share-status'].checked,false);assert.equal(c.nodes['friend-share-location'].checked,false);c.doc.hidden=true;await c.doc.emit('visibilitychange');assert.equal(c.polls.size,0);
  }finally{c.controller.destroy();}
});

test('destroy and a new offline controller on the same DOM clear previous private data and ignore a late save',async()=>{
  const delayed=deferred();const c=setup({initial:snapshot({friends:[{...relationship(),presence:sharedPresence()}],me:{presence:ownPresence({courtId:'paddle-grove',shareStatus:true,shareLocation:true,expiresAt:now+7200000})}}),override:call=>call.method==='POST'?delayed.promise:undefined});let replacement;try{
    await c.controller.handleNavigation('friends');const save=c.nodes['friend-presence-hide'].click();await tick();c.controller.destroy();assert.equal(c.nodes['friend-list'].textContent.includes('Court Friend'),false);assert.equal(c.nodes['friend-presence-court'].value,'');assert.equal(c.nodes['friend-share-status'].checked,false);assert.equal(c.polls.size,0);
    replacement=initFriends({document:c.doc,request:async()=>{throw new Error('Offline');},setInterval:()=>1,clearInterval:()=>{}});await replacement.handleNavigation('friends');delayed.resolve(snapshot({friends:[{...relationship(),presence:sharedPresence()}]}));await save;
    assert.equal(c.nodes['friend-list'].textContent.includes('At Paddle Grove'),false);assert.equal(c.nodes['friend-list'].textContent.includes('Court Friend'),false);assert.equal(c.nodes['friend-presence-court'].value,'');assert.equal(c.nodes['friend-share-location'].checked,false);assert.equal(c.nodes['friend-presence-save'].disabled,true);assert.match(c.nodes['friends-error-message'].textContent,/Offline/);
  }finally{c.controller.destroy();replacement?.destroy();}
});
