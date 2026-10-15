import test from 'node:test';
import assert from 'node:assert/strict';
import {initPlay} from '../dist/play.js';

// The actual controller runs against a small DOM/transport contract double.
// QR raster decoding and the avatar canvas are covered separately.
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.attributes={};this.style={};this.hidden=false;this.disabled=false;this.value='';this.className='';this._text='';this.open=false;this.width=360;this.height=360;}
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(child=>child.textContent||'').join('');}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this._text='';this.children=[...children];}
 setAttribute(name,value){this.attributes[name]=String(value);}
 addEventListener(name,callback){this.listeners[name]=callback;}
 querySelectorAll(selector){const descendants=this.children.flatMap(child=>[child,...(child.querySelectorAll?.(selector)||[])]);return descendants.filter(child=>selector==='button'&&child.tagName==='BUTTON');}
 getContext(){if(this.id!=='player-qr')throw new Error('Avatar rendering is verified separately.');return{fillStyle:'',fillRect(){}};}
 click(){return this.disabled?undefined:this.listeners.click?.();}
 emit(name,event={}){return this.listeners[name]?.(event);}
 close(){this.open=false;this.listeners.close?.();}
 focus(){}
 select(){}
}
const ids=['play','player-scan-dialog','player-scan-video','scanner-message','play-status','play-error','scan-error','play-identity-player','player-code','player-qr','player-qr-label','player-qr-badge','qr-link-output','create-duo-qr','show-player-qr','player-qr-help','connected-player','my-duo','duo-invitations','play-matches','play-match-count','refresh-play','find-player','connect-player-form','connect-player-code','copy-qr-link','copy-player-code','scan-player','use-player-photo','scan-close','scan-file','scan-help'];
const buttonIds=new Set(['create-duo-qr','show-player-qr','refresh-play','find-player','copy-qr-link','copy-player-code','scan-player','use-player-photo','scan-close']);
const origin='https://sideout-valencia.dchiligan.chatgpt.site';
const token='a2790e87-4509-4625-9dad-c3acc267c2f7';
const player=(id,name,code)=>({id,name,code,rating:1200,games:0,wins:0,avatar:{}});
const mine=player('me','My Player','SO-012345ABCDEF');
const partner=player('partner','Court Friend','SO-111111111111');
const opponent={...player('opponent','Other Captain','SO-222222222222'),rating:1480,avatar:{hair:'short',shirt:'sky'}};
const opponentPartner={...player('opponent-partner','Other Teammate','SO-333333333333'),rating:1320,avatar:{hair:'long-waves',shirt:'coral'}};
const opposingDuo={id:'duo-opponents',players:[opponent,opponentPartner]};
const snapshot=(duo=null)=>({player:mine,duo,invitations:[],matches:[],history:[]});
const paired=()=>snapshot({id:'duo-1',players:[mine,partner]});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}

async function withPlay({href=origin+'/#play',ready=true,request,onDuoFormed,onOpponentFound}={},run){
 const globals=['document','window','location','navigator','setInterval','clearInterval'];
 const previous=new Map(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const nodes=Object.fromEntries(ids.map(id=>{const node=new Element(buttonIds.has(id)?'button':id==='player-qr'?'canvas':'div');node.id=id;return[id,node];}));
 nodes.play.children.push(...Object.values(nodes).filter(node=>node!==nodes.play));
 const calls=[],routes=[],copies=[],formations=[],opponents=[],polls=[],page={id:'play'};let current=new URL(href),avatarReady=ready;
 const location={get href(){return current.href;},get origin(){return current.origin;}};
 const document={hidden:false,getElementById:id=>nodes[id],createElement:tag=>new Element(tag),createTextNode:text=>({textContent:String(text)}),querySelector:selector=>selector==='.page.active'?page:null};
 const service={async request(path,options={}){const body=options.body===undefined?undefined:JSON.parse(options.body);calls.push({path,body,method:options.method||'GET'});return request?request(path,body,calls):snapshot();}};
 const window={location,history:{replaceState(_state,_title,url){current=new URL(url,current);}},sideoutService:service,addEventListener(){}};
 for(const [key,value]of Object.entries({document,window,location,navigator:{clipboard:{async writeText(value){copies.push(value);}}},setInterval:(callback,delay)=>{polls.push({callback,delay});return polls.length;},clearInterval:()=>{}}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const context={nodes,calls,routes,copies,formations,opponents,polls,location,setReady(value){avatarReady=value;},setUrl(value){current=new URL(value,current);},async poll(){for(const {callback}of polls)callback();await new Promise(resolve=>setImmediate(resolve));},async lookup(input){nodes['connect-player-code'].value=input;nodes['connect-player-form'].emit('submit',{preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));}};
 try{context.controller=await initPlay({getAvatarCreated:()=>avatarReady,onNavigate:route=>{routes.push(route);page.id=route;},onDuoFormed:(player,duo)=>{formations.push({player,duo});onDuoFormed?.(player,duo);},onOpponentFound:(player,duo,otherDuo)=>{opponents.push({player,duo,otherDuo});return onOpponentFound?.(player,duo,otherDuo);}});await run(context);}
 finally{for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}

test('duo intent waits for avatar completion, then pairs once and removes the consumed invite URL',()=>withPlay({href:`${origin}/?duo=${token}&player=${partner.code}#avatar`,ready:false,request:path=>path==='/api/duos/join'?paired():snapshot()},async({controller,calls,nodes,location,setReady,formations})=>{
 assert.deepEqual(calls,[]);await controller.handleNavigation('play');assert.deepEqual(calls,[]);
 assert.equal(new URL(location.href).searchParams.get('duo'),token);
 setReady(true);await controller.handleNavigation('play');
 assert.deepEqual(calls.map(({path})=>path),['/api/play','/api/duos/join']);assert.deepEqual(calls[1].body,{token});
 assert.equal(new URL(location.href).search,'');assert.equal(new URL(location.href).hash,'#play');
 assert.match(nodes['my-duo'].textContent,/Court Friend/);assert.match(nodes['play-status'].textContent,/You’re a duo/);
 assert.equal(formations.length,1);assert.deepEqual(formations[0],{player:mine,duo:paired().duo});
 await controller.handleNavigation('play');assert.equal(calls.filter(call=>call.path==='/api/duos/join').length,1);
 assert.equal(formations.length,1);
}));

test('simultaneous navigation while an invite is joining cannot submit the claim twice',async()=>{
 const started=deferred(),finish=deferred();
 await withPlay({request:async path=>{if(path==='/api/duos/join'){started.resolve();return finish.promise;}return snapshot();}},async({controller,calls,setUrl,nodes})=>{
  setUrl(`/?duo=${token}#play`);const first=controller.handleNavigation('play');await started.promise;
  const second=controller.handleNavigation('play'),third=controller.handleNavigation('play');
  assert.equal(nodes.play.attributes['aria-busy'],'true');assert.equal(calls.filter(call=>call.path==='/api/duos/join').length,1);
  finish.resolve(paired());await Promise.all([first,second,third]);assert.equal(calls.filter(call=>call.path==='/api/duos/join').length,1);
  assert.equal(nodes.play.attributes['aria-busy'],'false');
 });
});

test('a failed claim keeps the current invite and Refresh retries it without losing the token',async()=>{
 let attempts=0;
 await withPlay({href:`${origin}/?duo=${token}#play`,request:path=>{if(path==='/api/duos/join'){if(++attempts===1)throw new Error('Connection interrupted.');return paired();}return snapshot();}},async({nodes,calls,location,formations})=>{
  assert.equal(new URL(location.href).searchParams.get('duo'),token);assert.equal(nodes['play-error'].hidden,false);assert.match(nodes['play-error'].textContent,/Connection interrupted/);
  assert.equal(formations.length,0);
  await nodes['refresh-play'].click();assert.equal(attempts,2);assert.equal(new URL(location.href).searchParams.has('duo'),false);assert.equal(nodes['play-error'].hidden,true);
  assert.deepEqual(calls.filter(call=>call.path==='/api/duos/join').map(call=>call.body),[{token},{token}]);
  assert.equal(formations.length,1);
 });
});

test('ordinary player QR links and typed legacy codes look up a player without automatic pairing',()=>withPlay({href:`${origin}/?player=${partner.code}#play`,request:path=>path.startsWith('/api/players/')?{player:partner,duo:null}:snapshot()},async({nodes,calls,location})=>{
 assert.deepEqual(calls.map(({path})=>path),['/api/play',`/api/players/${partner.code}`]);assert.match(nodes['connected-player'].textContent,/Court Friend/);
 assert.equal(new URL(location.href).searchParams.has('player'),false);assert.equal(calls.some(call=>call.method==='POST'),false);
 nodes['connect-player-code'].value=`SIDEOUT:${partner.code}`;await nodes['connect-player-form'].emit('submit',{preventDefault(){}});
 // The submit handler starts a lookup; allow its request and render continuations to settle.
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.filter(call=>call.path===`/api/players/${partner.code}`).length,2);assert.equal(calls.some(call=>call.method==='POST'),false);
}));

test('automatic pairing is offered only by an explicitly created duo QR and copying its website link',()=>withPlay({request:path=>path==='/api/duos/link'?{token,expiresAt:Date.now()+24*60*60*1000}:snapshot()},async({nodes,calls,copies})=>{
 assert.equal(nodes['qr-link-output'].value,`${origin}/?player=${mine.code}#play`);assert.equal(calls.length,1);
 await nodes['create-duo-qr'].click();assert.deepEqual(calls.at(-1),{path:'/api/duos/link',body:{},method:'POST'});
 assert.equal(nodes['qr-link-output'].value,`${origin}/?duo=${token}#play`);assert.equal(nodes['player-qr-label'].textContent,'YOUR DUO INVITE QR');assert.equal(nodes['show-player-qr'].hidden,false);
 await nodes['copy-qr-link'].click();assert.deepEqual(copies,[`${origin}/?duo=${token}#play`]);assert.equal(calls.some(call=>call.path==='/api/duos/join'),false);
 nodes['show-player-qr'].click();assert.equal(nodes['qr-link-output'].value,`${origin}/?player=${mine.code}#play`);assert.equal(nodes['show-player-qr'].hidden,true);
}));

test('ambiguous or malformed duo links never call the join endpoint',async()=>{
 for(const query of [`duo=${token}&duo=${token}`,'duo=invalid'])await withPlay({href:`${origin}/?${query}#play`},async({nodes,calls,location})=>{
  assert.equal(calls.some(call=>call.path==='/api/duos/join'),false);assert.match(nodes['play-error'].textContent,/invalid/);assert.equal(new URL(location.href).searchParams.has('duo'),true);
 });
});

test('an existing duo on initial load does not celebrate again on navigation or repeated refreshes',()=>withPlay({request:()=>paired()},async({controller,formations,poll})=>{
 assert.deepEqual(formations,[]);
 await controller.refresh();await controller.handleNavigation('play');await poll();await poll();
 assert.deepEqual(formations,[]);
}));

test('the invite owner celebrates a newly joined teammate once when the normal poll discovers the duo',async()=>{
 let current=snapshot();
 await withPlay({request:()=>current},async({formations,polls,poll,controller})=>{
  assert.deepEqual(formations,[]);assert.equal(polls.length,1);assert.equal(polls[0].delay,20000);
  current=paired();await poll();
  assert.deepEqual(formations,[{player:mine,duo:current.duo}]);
  await poll();await controller.refresh();
  assert.equal(formations.length,1,'the same persisted duo must not replay on every refresh');
 });
});

test('accepting a traditional invitation celebrates, leaving does not, and a later new duo can celebrate',async()=>{
 let current={...snapshot(),invitations:[{id:'invite-1',from:partner}]};
 await withPlay({request:path=>{
  if(path==='/api/duos/invite-1/respond')current=paired();
  if(path==='/api/duos/leave')current=snapshot();
  return current;
 }},async({nodes,formations,controller})=>{
  const accept=nodes['duo-invitations'].querySelectorAll('button').find(button=>button.textContent==='Accept duo ↗');
  assert.ok(accept);assert.deepEqual(formations,[]);await accept.click();
  assert.equal(formations.length,1);assert.equal(formations[0].duo.id,'duo-1');
  const leave=nodes['my-duo'].querySelectorAll('button').find(button=>button.textContent==='Leave this duo');
  assert.ok(leave);await leave.click();assert.equal(formations.length,1);
  await controller.refresh();assert.equal(formations.length,1);
  current=snapshot({id:'duo-2',players:[partner,mine]});await controller.refresh();
  assert.equal(formations.length,2);assert.equal(formations[1].duo.id,'duo-2');
  await controller.refresh();assert.equal(formations.length,2);
 });
});

test('a failed visual effect cannot undo a successful QR claim or keep its consumed invite URL',()=>withPlay({href:`${origin}/?duo=${token}#play`,request:path=>path==='/api/duos/join'?paired():snapshot(),onDuoFormed(){throw new Error('Canvas unavailable.');}},async({nodes,formations,location,calls})=>{
 assert.equal(formations.length,1);
 assert.equal(new URL(location.href).searchParams.has('duo'),false);
 assert.equal(nodes['play-error'].hidden,true);
 assert.match(nodes['my-duo'].textContent,/Court Friend/);
 assert.match(nodes['play-status'].textContent,/You’re a duo/);
 assert.equal(calls.filter(call=>call.path==='/api/duos/join').length,1);
}));

test('an opponent player QR link previews all four players once while challenge consent stays explicit',()=>withPlay({href:`${origin}/?player=${opponent.code}#play`,request:path=>path.startsWith('/api/players/')?{player:opponent,duo:opposingDuo}:paired()},async({controller,nodes,opponents,poll,calls})=>{
 assert.deepEqual(opponents,[{player:mine,duo:paired().duo,otherDuo:opposingDuo}]);
 assert.equal(opponents[0].otherDuo.players[0].rating,1480);
 assert.equal(opponents[0].otherDuo.players[1].rating,1320);
 assert.match(nodes['connected-player'].textContent,/Your duo: 1200 MMR · Their duo: 1400 MMR/);
 const challenge=nodes['connected-player'].querySelectorAll('button').find(button=>button.textContent==='Challenge their duo ↗');
 assert.ok(challenge);assert.equal(challenge.disabled,false);
 assert.equal(calls.some(call=>call.method==='POST'),false,'finding opponents cannot send or accept a match');
 await controller.refresh();await controller.handleNavigation('play');await poll();await poll();
 assert.equal(opponents.length,1,'refreshing a connected opponent must not replay the preview');
 assert.equal(calls.some(call=>call.method==='POST'),false);
}));

test('explicitly rescanning the same opposing duo replays the preview for a code or pasted website link',()=>withPlay({request:path=>path.startsWith('/api/players/')?{player:opponent,duo:opposingDuo}:paired()},async({lookup,opponents,calls})=>{
 assert.deepEqual(opponents,[],'loading an existing own duo is not an opponent lookup');
 await lookup(`SIDEOUT:${opponent.code}`);
 await lookup(`${origin}/?player=${opponent.code}#play`);
 assert.equal(opponents.length,2);
 assert.deepEqual(opponents[0],opponents[1]);
 assert.equal(calls.filter(call=>call.path===`/api/players/${opponent.code}`).length,2);
 assert.equal(calls.some(call=>call.method==='POST'),false);
}));

test('self, teammate, incomplete or overlapping teams and failed lookups cannot show an opponent preview',async()=>{
 const scenarios=[
  {label:'own QR',own:paired(),found:{player:mine,duo:paired().duo}},
  {label:'teammate QR',own:paired(),found:{player:partner,duo:paired().duo}},
  {label:'unpaired current player',own:snapshot(),found:{player:opponent,duo:opposingDuo}},
  {label:'unpaired opponent',own:paired(),found:{player:opponent,duo:null}},
  {label:'only one opponent',own:paired(),found:{player:opponent,duo:{...opposingDuo,players:[opponent]}}},
  {label:'three opponents',own:paired(),found:{player:opponent,duo:{...opposingDuo,players:[opponent,opponentPartner,partner]}}},
  {label:'duplicate opponent',own:paired(),found:{player:opponent,duo:{...opposingDuo,players:[opponent,{...opponent}]}}},
  {label:'duplicate opponent code',own:paired(),found:{player:opponent,duo:{...opposingDuo,players:[opponent,{...opponentPartner,code:opponent.code}]}}},
  {label:'current player on opponent team',own:paired(),found:{player:opponent,duo:{...opposingDuo,players:[opponent,mine]}}},
  {label:'shared teammate',own:paired(),found:{player:opponent,duo:{...opposingDuo,players:[opponent,partner]}}},
  {label:'same duo identifier',own:paired(),found:{player:opponent,duo:{...opposingDuo,id:paired().duo.id}}},
  {label:'scanned player missing from their team',own:paired(),found:{player:opponent,duo:{...opposingDuo,players:[opponentPartner,player('outsider','Other','SO-444444444444')]}}},
  {label:'own player missing from current duo',own:snapshot({id:'duo-1',players:[partner,player('outsider','Other','SO-444444444444')]}),found:{player:opponent,duo:opposingDuo}},
  {label:'duplicate own player',own:snapshot({id:'duo-1',players:[mine,{...mine}]}),found:{player:opponent,duo:opposingDuo}},
  {label:'failed lookup',own:paired(),error:true},
 ];
 for(const scenario of scenarios)await withPlay({request:path=>{if(path.startsWith('/api/players/')){if(scenario.error)throw new Error('Player unavailable.');return scenario.found;}return scenario.own;}},async({lookup,opponents,calls,nodes})=>{
  await lookup(scenario.found?.player.code||opponent.code);
  assert.equal(opponents.length,0,scenario.label);
  assert.equal(calls.some(call=>call.method==='POST'),false,scenario.label);
  if(scenario.error)assert.match(nodes['play-error'].textContent,/Player unavailable/);
 });
});

test('joining a duo QR never treats the new teammate as an opponent',()=>withPlay({href:`${origin}/?duo=${token}#play`,request:path=>path==='/api/duos/join'?paired():snapshot()},async({opponents,formations,calls})=>{
 assert.equal(formations.length,1);assert.deepEqual(opponents,[]);
 assert.equal(calls.some(call=>call.path.startsWith('/api/players/')),false);
}));

test('a failing opponent visual leaves the found team and normal challenge action available',async()=>{
 for(const callback of [()=>{throw new Error('Canvas unavailable.');},async()=>{throw new Error('Animation unavailable.');}])await withPlay({request:path=>path.startsWith('/api/players/')?{player:opponent,duo:opposingDuo}:paired(),onOpponentFound:callback},async({lookup,opponents,nodes,calls})=>{
  await lookup(opponent.code);
  assert.equal(opponents.length,1);assert.equal(nodes['play-error'].hidden,true);
  assert.match(nodes['play-status'].textContent,/Other Captain found/);assert.equal(nodes['connected-player'].hidden,false);
  const challenge=nodes['connected-player'].querySelectorAll('button').find(button=>button.textContent==='Challenge their duo ↗');
  assert.ok(challenge);assert.equal(challenge.disabled,false);
  assert.equal(calls.some(call=>call.method==='POST'),false);
 });
});
