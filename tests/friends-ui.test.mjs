import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initFriends} from '../dist/friends.js';

class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.attributes={};this.className='';this._text='';this.value='';this.hidden=false;this.disabled=false;this.focused=false;}
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
const ids=['friends','friend-request-form','friend-player-code','friend-request-submit','friends-status','friends-error','friends-error-message','friends-refresh','friends-retry','friends-open-play','friends-count','friends-summary','friend-list','friend-incoming','friend-outgoing','friend-friends-count','friend-incoming-count','friend-outgoing-count'];
const descendants=node=>[node,...node.children.flatMap(descendants)];
const buttons=node=>descendants(node).filter(child=>child.tagName==='BUTTON');
const click=async(node,label)=>{const button=buttons(node).find(item=>item.textContent===label);assert.ok(button,`Missing action: ${label}`);return button.click();};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const idsFor=['a1111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222','c3333333-3333-4333-8333-333333333333'];
const friend={id:'player-1',code:'SO-111111111111',name:'Court Friend',rating:1320,games:6,wins:4,avatar:{shirt:'sky'}};
const other={...friend,id:'player-2',code:'SO-222222222222',name:'Another Player'};
const relationship=(player=friend,index=0)=>({id:idsFor[index],player,createdAt:'2026-10-17T08:00:00Z'});
const snapshot=(changes={})=>({friends:[],incoming:[],outgoing:[],...changes});
function setup({initial=snapshot(),override}={}){
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()])),doc=new Element('document');doc.hidden=false;doc.createElement=tag=>new Element(tag);doc.getElementById=id=>nodes[id];
  const calls=[],routes=[],polls=new Map();let current=initial,timer=0;
  const request=(path,options={})=>{
    const call={path,method:options.method||'GET',body:options.body===undefined?undefined:JSON.parse(options.body)};calls.push(call);
    if(override){const result=override(call,{get:()=>current,set:value=>{current=value;}});if(result!==undefined)return result;}
    if(path==='/api/friends/request'){if(!current.outgoing.some(item=>item.player.code===call.body.playerCode))current={...current,outgoing:[relationship()]};}
    else if(path.endsWith('/respond')){const id=path.split('/')[3],item=current.incoming.find(item=>item.id===id);current={...current,incoming:current.incoming.filter(item=>item.id!==id),friends:call.body.accept?[...current.friends,item]:current.friends};}
    else if(path.endsWith('/cancel'))current={...current,outgoing:current.outgoing.filter(item=>item.id!==path.split('/')[3])};
    else if(path.endsWith('/remove'))current={...current,friends:current.friends.filter(item=>item.id!==path.split('/')[3])};
    return current;
  };
  const controller=initFriends({request,document:doc,onNavigate:page=>routes.push(page),setInterval:(callback,delay)=>{const id=++timer;polls.set(id,{callback,delay});return id;},clearInterval:id=>polls.delete(id)});
  return{nodes,doc,calls,routes,polls,controller,set:value=>{current=value;},get:()=>current,submit:()=>nodes['friend-request-form'].emit('submit',{preventDefault(){}}),async poll(){for(const {callback}of polls.values())callback();await tick();}};
}

test('Friends loads on navigation, shows honest empty states, and links to player QR without a mutation',async()=>{
  const c=setup();try{
    assert.equal(c.calls.length,0);await c.controller.handleNavigation('profile');assert.equal(c.calls.length,0);
    await c.controller.handleNavigation('friends');assert.deepEqual(c.calls,[{path:'/api/friends',method:'GET',body:undefined}]);
    assert.equal(c.nodes['friends-count'].textContent,'0');assert.match(c.nodes['friend-list'].textContent,/Your crew starts here/);assert.match(c.nodes['friend-incoming'].textContent,/No requests waiting/);assert.match(c.nodes['friend-outgoing'].textContent,/No requests sent/);
    assert.equal(c.polls.size,1);assert.equal([...c.polls.values()][0].delay,20000);await c.nodes['friends-open-play'].click();assert.deepEqual(c.routes,['play']);
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
    c.doc.hidden=false;await c.doc.emit('visibilitychange');await tick();assert.equal(c.polls.size,1);assert.equal(c.calls.length,count+1);
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
    const afterDestroy=deferred();next=afterDestroy.promise;const open=c.controller.handleNavigation('friends');await tick();c.controller.destroy();afterDestroy.resolve(snapshot());await open;assert.match(c.nodes['friend-list'].textContent,/Court Friend/);
  }finally{c.controller.destroy();}
});

test('untrusted names stay text, private fields are absent, and the feature uses lazy navigation',async()=>{
  const hostile={...friend,name:'<img src=x onerror=alert(1)>',email:'private@example.invalid',phone:'secret phone'};const c=setup({initial:snapshot({friends:[relationship(hostile)]})});try{
    await c.controller.handleNavigation('friends');assert.ok(c.nodes['friend-list'].textContent.includes(hostile.name));assert.ok(!c.nodes['friend-list'].textContent.includes(hostile.email));assert.ok(!c.nodes['friend-list'].textContent.includes(hostile.phone));assert.equal(descendants(c.nodes['friend-list']).some(node=>node.tagName==='IMG'),false);
    const [app,html]=await Promise.all([readFile(new URL('../dist/app.js',import.meta.url),'utf8'),readFile(new URL('../dist/index.html',import.meta.url),'utf8')]);assert.match(app,/import\('\.\/friends\.js'\)/);assert.match(html,/data-page="friends"/);assert.match(html,/id="friend-request-form"/);
  }finally{c.controller.destroy();}
});
