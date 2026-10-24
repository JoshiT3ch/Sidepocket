import test from 'node:test';
import assert from 'node:assert/strict';
import {initPlay} from '../dist/play.js';

// The actual controller runs against a small DOM/transport contract double.
// QR raster decoding and the avatar canvas are covered separately.
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.attributes={};this.dataset={};this.style={};this.hidden=false;this.disabled=false;this.value='';this.className='';this._text='';this.open=false;this.width=360;this.height=360;this.parentNode=null;this.ownerDocument=null;this.modalOpens=0;}
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(child=>child.textContent||'').join('');}
 append(...children){for(const child of children){child.parentNode=this;child.ownerDocument=this.ownerDocument;this.children.push(child);}}
 replaceChildren(...children){this._text='';this.children=[];this.append(...children);}
 setAttribute(name,value){this.attributes[name]=String(value);if(name==='id')this.id=String(value);if(name==='class')this.className=String(value);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=String(value);}
 getAttribute(name){if(name==='id')return this.id??null;if(name==='class')return this.className;if(name.startsWith('data-'))return this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]??null;return this.attributes[name]??this[name]??null;}
 removeAttribute(name){delete this.attributes[name];}
 get valueAsNumber(){return this.value===''?NaN:Number(this.value);}
 get classList(){return{add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...names])].join(' ');},remove:(...names)=>{this.className=this.className.split(/\s+/).filter(name=>!names.includes(name)).join(' ');},contains:name=>this.className.split(/\s+/).includes(name),toggle:(name,force)=>{const next=force??!this.className.split(/\s+/).includes(name);if(next)this.classList.add(name);else this.classList.remove(name);return next;}};}
 addEventListener(name,callback){this.listeners[name]=callback;}
 matches(selector){return selector.split(',').some(part=>{part=part.trim();const tags=part.match(/^[a-z]+/i);if(tags&&this.tagName!==tags[0].toUpperCase())return false;for(const [,id]of part.matchAll(/#([\w-]+)/g))if(this.id!==id)return false;for(const [,name]of part.matchAll(/\.([\w-]+)/g))if(!this.className.split(/\s+/).includes(name))return false;for(const [,name,,value]of part.matchAll(/\[([\w-]+)(?:=(['"]?)([^\]'"]*)\2)?\]/g)){const actual=this.getAttribute(name);if(actual===null||actual===false||value!==undefined&&String(actual)!==value)return false;}return true;});}
 descendants(){return this.children.flatMap(child=>[child,...(child.descendants?.()||[])]);}
 querySelectorAll(selector){return this.descendants().filter(child=>child.matches?.(selector));}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 contains(node){return node===this||this.descendants().includes(node);}
 checkValidity(){return true;}
 reportValidity(){return true;}
 getContext(_type,options){if(options?.willReadFrequently)return{drawImage(){},getImageData(){return{width:1,height:1,data:new Uint8ClampedArray(4)};}};if(this.id!=='player-qr')throw new Error('Avatar rendering is verified separately.');return{fillStyle:'',fillRect(){}};}
 click(){return this.disabled?undefined:this.listeners.click?.();}
 emit(name,event={}){return this.listeners[name]?.(event);}
 close(){if(!this.open)return;this.open=false;const event={target:this};this.listeners.close?.(event);this.ownerDocument?.emit('close',event);}
 showModal(){this.open=true;this.modalOpens++;}
 async play(){}
 focus(){if(this.ownerDocument)this.ownerDocument.activeElement=this;}
 select(){}
}
const ids=['found-player-dialog','found-player-close','found-player-status','found-player-error','show-found-player','play','player-scan-dialog','player-scan-video','scanner-message','play-status','play-error','scan-error','play-identity-player','player-code','player-qr','player-qr-label','player-qr-badge','qr-link-output','create-duo-qr','show-player-qr','player-qr-help','connected-player','my-duo','duo-invitations','duo-invitation-dialog','duo-invitation-close','duo-invitation-error','duo-invitation-heading','duo-invitation-description','install-dialog','story-dialog','play-matches','play-match-count','refresh-play','find-player','connect-player-form','connect-player-code','copy-qr-link','copy-player-code','scan-player','use-player-photo','scan-close','scan-file','scan-help','match-settings-dialog','match-settings-form','match-settings-best-of','match-settings-points','match-settings-win-by','match-settings-submit','match-settings-close','match-settings-error'];
const buttonIds=new Set(['found-player-close','show-found-player','create-duo-qr','show-player-qr','refresh-play','find-player','copy-qr-link','copy-player-code','scan-player','use-player-photo','scan-close','duo-invitation-close','match-settings-submit','match-settings-close']);
const dialogIds=new Set(['found-player-dialog','player-scan-dialog','duo-invitation-dialog','install-dialog','story-dialog','match-settings-dialog']);
const selectIds=new Set(['match-settings-best-of','match-settings-points','match-settings-win-by']);
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
const invitation=(id='invite-1',from=partner,expiresAt=60000)=>({id,from,expiresAt});
const invited=(invitations=[invitation()])=>({...snapshot(),invitations});
const challenge=(changes={})=>({id:'match-1',status:'pending',teams:{a:[opponent,opponentPartner],b:[mine,partner]},createdBy:opponent.id,createdAt:1000,reportedBy:null,completedAt:null,winnerSide:null,preview:{a:28,b:32},deltas:null,...changes});
const challenged=(matches=[challenge()])=>({...paired(),matches});
const button=(node,label)=>node.querySelectorAll('button').find(node=>node.textContent===label);
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
const submitForm=async form=>{const pending=form.emit('submit',{preventDefault(){}});await nextTurn();return pending;};
const matchFormat={bestOf:3,pointsToWin:11,winBy:2};
function setScore(document,matchId,index,side,value){const input=document.getElementById(`score-${matchId}-${index}-${side}`);assert.ok(input,`Missing set ${index+1} ${side} score`);input.value=String(value);input.emit('input',{target:input});input.emit('change',{target:input});return input;}
function deferred(){let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return{promise,resolve,reject};}

async function withPlay({href=origin+'/#play',ready=true,request,onDuoFormed,onOpponentFound,loadQrDecoder,mediaDevices,createImageBitmap,initialPage='play',hidden=false,openDialog=null}={},run){
 const globals=['document','window','location','navigator','setInterval','clearInterval','createImageBitmap'];
 const previous=new Map(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const nodes=Object.fromEntries(ids.map(id=>{const node=new Element(buttonIds.has(id)?'button':dialogIds.has(id)?'dialog':selectIds.has(id)?'select':id.endsWith('-form')?'form':id==='player-qr'?'canvas':'div');node.id=id;return[id,node];}));
 Object.assign(nodes['match-settings-best-of'],{value:'3'});Object.assign(nodes['match-settings-points'],{value:'11'});Object.assign(nodes['match-settings-win-by'],{value:'2'});
 const globalIds=new Set(['found-player-dialog','found-player-close','found-player-status','found-player-error','connected-player','duo-invitations','duo-invitation-dialog','duo-invitation-close','duo-invitation-error','duo-invitation-heading','duo-invitation-description','install-dialog','story-dialog',...ids.filter(id=>id.startsWith('match-settings-'))]);
 nodes.play.append(...Object.values(nodes).filter(node=>node!==nodes.play&&!globalIds.has(node.id)));
 nodes['duo-invitation-dialog'].append(nodes['duo-invitation-heading'],nodes['duo-invitation-description'],nodes['duo-invitation-close'],nodes['duo-invitation-error'],nodes['duo-invitations']);
 nodes['found-player-dialog'].append(nodes['found-player-close'],nodes['connected-player'],nodes['found-player-status'],nodes['found-player-error']);
 nodes['match-settings-dialog'].append(nodes['match-settings-close'],nodes['match-settings-form']);nodes['match-settings-form'].append(nodes['match-settings-best-of'],nodes['match-settings-points'],nodes['match-settings-win-by'],nodes['match-settings-submit'],nodes['match-settings-error']);
 const calls=[],routes=[],copies=[],formations=[],opponents=[],polls=[],stats=[],page={id:initialPage},documentListeners={},windowListeners={};let current=new URL(href),avatarReady=ready,time=1000;
 const location={get href(){return current.href;},get origin(){return current.origin;}};
 const matchingDialogs=selector=>{const match=/^dialog(?:\[open\]|:modal)(?::not\(#([^)]*)\))?$/.exec(selector);return match?Object.values(nodes).filter(node=>node.tagName==='DIALOG'&&node.open&&node.id!==match[1]):[];};
 const allNodes=()=>[...new Set(Object.values(nodes).flatMap(node=>[node,...node.descendants()]))];
 const document={hidden,activeElement:null,getElementById:id=>nodes[id]||allNodes().find(node=>node.id===id),createElement:tag=>{const node=new Element(tag);node.ownerDocument=document;return node;},createTextNode:text=>({textContent:String(text)}),querySelector:selector=>selector==='.page.active'?page:matchingDialogs(selector)[0]||allNodes().find(node=>node.matches?.(selector))||null,querySelectorAll:selector=>selector.startsWith('dialog')?matchingDialogs(selector):allNodes().filter(node=>node.matches?.(selector)),addEventListener(name,callback){(documentListeners[name]||=[]).push(callback);},emit(name,event={}){for(const callback of documentListeners[name]||[])callback(event);}};
 for(const node of Object.values(nodes))node.ownerDocument=document;
 if(openDialog)nodes[openDialog].open=true;
 const service={async request(path,options={}){const body=options.body===undefined?undefined:JSON.parse(options.body);calls.push({path,body,method:options.method||'GET'});return request?request(path,body,calls):snapshot();}};
 const window={location,history:{replaceState(_state,_title,url){current=new URL(url,current);}},sideoutService:service,addEventListener(name,callback){windowListeners[name]=callback;}};
 for(const [key,value]of Object.entries({document,window,location,navigator:{mediaDevices,clipboard:{async writeText(value){copies.push(value);}}},setInterval:(callback,delay)=>{polls.push({callback,delay,active:true});return polls.length;},clearInterval:id=>{polls[id-1].active=false;},createImageBitmap}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 const context={nodes,calls,routes,copies,formations,opponents,polls,stats,location,document,setReady(value){avatarReady=value;},setTime(value){time=value;},setPage(value){page.id=value;},setUrl(value){current=new URL(value,current);},async visibility(hidden){document.hidden=hidden;document.emit('visibilitychange');await tick();},async windowEvent(name,event={}){windowListeners[name]?.(event);await tick();},async poll(){for(const {callback,active}of polls)if(active)callback();await tick();},async escapeInvitation(){let prevented=false;await nodes['duo-invitation-dialog'].emit('cancel',{preventDefault(){prevented=true;}});if(!prevented)nodes['duo-invitation-dialog'].close();await tick();return prevented;},async lookup(input){nodes['connect-player-code'].value=input;nodes['connect-player-form'].emit('submit',{preventDefault(){}});await tick();}};
 try{context.controller=await initPlay({getAvatarCreated:()=>avatarReady,now:()=>time,loadQrDecoder,onStats:value=>stats.push(value),onNavigate:route=>{routes.push(route);page.id=route;},onDuoFormed:(player,duo)=>{formations.push({player,duo});return onDuoFormed?.(player,duo);},onOpponentFound:(player,duo,otherDuo)=>{opponents.push({player,duo,otherDuo});return onOpponentFound?.(player,duo,otherDuo);}});await run(context);}
 finally{for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}

test('finding a player by code opens global details and invites them only after an explicit tap',async()=>{
 await withPlay({request:path=>path.startsWith('/api/players/')?{player:partner,duo:null}:snapshot()},async({nodes,calls,lookup})=>{
  await lookup(partner.code);
  assert.equal(nodes['found-player-dialog'].open,true);
  assert.equal(nodes.play.contains(nodes['found-player-dialog']),false);
  assert.equal(nodes['found-player-dialog'].contains(nodes['connected-player']),true);
  assert.match(nodes['connected-player'].textContent,/Court Friend/);
  assert.match(nodes['connected-player'].textContent,/1200 MMR/);
  assert.match(nodes['connected-player'].textContent,/SO-111111111111/);
  assert.equal(calls.some(call=>call.method==='POST'),false);
  const invite=nodes['connected-player'].querySelectorAll('button').find(node=>node.textContent.startsWith('Invite as my duo'));
  assert.equal(invite.disabled,false);await invite.click();
  assert.deepEqual(calls.find(call=>call.path==='/api/duos'),{path:'/api/duos',body:{playerCode:partner.code},method:'POST'});
  assert.equal(nodes['found-player-dialog'].open,false);assert.match(nodes['play-status'].textContent,/Duo invite sent/);
 });
});

test('scanning an available player opens the same details popup after closing the camera',async()=>{
 let stops=0;
 await withPlay({loadQrDecoder:async()=>()=>partner.code,mediaDevices:{async getUserMedia(){return{getTracks:()=>[{stop(){stops++;}}]};}},request:path=>path.startsWith('/api/players/')?{player:partner,duo:null}:snapshot()},async({nodes,calls})=>{
  Object.assign(nodes['player-scan-video'],{readyState:2,videoWidth:100,videoHeight:100});
  await nodes['scan-player'].click();await nextTurn();
  assert.equal(stops,1);assert.equal(nodes['player-scan-dialog'].open,false);assert.equal(nodes['found-player-dialog'].open,true);
  assert.match(nodes['connected-player'].textContent,/Court Friend/);assert.equal(calls.some(call=>call.method==='POST'),false);
 });
});

test('player details dismiss without reopening on polls and can be reopened explicitly',async()=>{
 await withPlay({request:path=>path.startsWith('/api/players/')?{player:partner,duo:null}:snapshot()},async({nodes,lookup,controller,poll,calls})=>{
  await lookup(partner.code);await nodes['found-player-close'].click();assert.equal(nodes['found-player-dialog'].open,false);
  await controller.refresh();await poll();assert.equal(nodes['found-player-dialog'].open,false);
  await nodes['show-found-player'].click();assert.equal(nodes['found-player-dialog'].open,true);
  let prevented=false;await nodes['found-player-dialog'].emit('cancel',{preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(nodes['found-player-dialog'].open,false);assert.equal(calls.some(call=>call.method==='POST'),false);
 });
});

test('player invitation errors stay inside the popup and support retry without duplicate submissions',async()=>{
 const saved=deferred();let attempts=0;
 await withPlay({request:path=>path.startsWith('/api/players/')?{player:partner,duo:null}:path==='/api/duos'?(++attempts===1?saved.promise:snapshot()):snapshot()},async({nodes,lookup})=>{
  await lookup(partner.code);
  const invite=()=>nodes['connected-player'].querySelectorAll('button').find(node=>node.textContent.startsWith('Invite as my duo'));
  const submitting=invite().click();await nextTurn();assert.equal(nodes['found-player-close'].disabled,true);
  await invite().click();await nodes['found-player-close'].click();assert.equal(attempts,1);
  saved.reject(new Error('Connection interrupted. Try again.'));await submitting;
  assert.equal(nodes['found-player-dialog'].open,true);assert.equal(nodes['found-player-error'].hidden,false);
  assert.match(nodes['found-player-error'].textContent,/Connection interrupted/);assert.equal(invite().disabled,false);
  await invite().click();assert.equal(attempts,2);assert.equal(nodes['found-player-dialog'].open,false);
 });
});

test('a player lookup that finishes after leaving Play cannot open a delayed popup',async()=>{
 const found=deferred();
 await withPlay({request:path=>path.startsWith('/api/players/')?found.promise:snapshot()},async({nodes,lookup,setPage,controller})=>{
  await lookup(partner.code);setPage('profile');await controller.handleNavigation('profile');
  found.resolve({player:partner,duo:null});await nextTurn();assert.equal(nodes['found-player-dialog'].open,false);
 });
});

test('Add friend sends a public code, blocks duplicate clicks and opens Friends after success',async()=>{
 const saved=deferred();
 await withPlay({request:path=>path.startsWith('/api/players/')?{player:partner,duo:null}:path==='/api/friends/request'?saved.promise:snapshot()},async({nodes,calls,routes,lookup})=>{
  await lookup(partner.code);const add=nodes['connected-player'].querySelectorAll('button').find(button=>button.textContent==='Add friend ↗');assert.ok(add);
  const first=add.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(add.disabled,true);await add.click();assert.equal(calls.filter(call=>call.path==='/api/friends/request').length,1);
  saved.resolve({friends:[],incoming:[],outgoing:[{id:'request-id',player:partner}]});await first;
  assert.deepEqual(calls.find(call=>call.path==='/api/friends/request'),{path:'/api/friends/request',method:'POST',body:{playerCode:partner.code}});assert.deepEqual(routes,['friends']);assert.match(nodes['play-status'].textContent,/Friend request sent/);
 });
});

test('Add friend recognizes an existing friendship and keeps server failures actionable without navigating',async()=>{
 let fail=true;
 await withPlay({request:path=>{if(path.startsWith('/api/players/'))return{player:partner,duo:null};if(path==='/api/friends/request'){if(fail)throw new Error('Too many friend requests. Try again later.');return{friends:[{id:'friendship-id',player:partner}],incoming:[],outgoing:[]};}return snapshot();}},async({nodes,routes,lookup})=>{
  await lookup(partner.code);const add=()=>nodes['connected-player'].querySelectorAll('button').find(button=>button.textContent==='Add friend ↗');await add().click();assert.match(nodes['play-error'].textContent,/Too many friend requests/);assert.deepEqual(routes,[]);assert.equal(add().disabled,false);
  fail=false;await add().click();assert.match(nodes['play-status'].textContent,/already friends/);assert.deepEqual(routes,['friends']);
 });
});

test('a delayed Add friend response keeps the page the player navigated to',async()=>{
 const saved=deferred();
 await withPlay({request:path=>path.startsWith('/api/players/')?{player:partner,duo:null}:path==='/api/friends/request'?saved.promise:snapshot()},async({nodes,routes,lookup,setPage,controller})=>{
  await lookup(partner.code);const save=nodes['connected-player'].querySelectorAll('button').find(button=>button.textContent==='Add friend ↗').click();await new Promise(resolve=>setImmediate(resolve));
  setPage('locker');await controller.handleNavigation('locker');saved.resolve({friends:[],incoming:[],outgoing:[{id:'request-id',player:partner}]});await save;
  assert.deepEqual(routes,[]);assert.match(nodes['play-status'].textContent,/Friend request sent/);
 });
});

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

test('a pending invitation opens a global popup on startup with the saved inviter details',()=>withPlay({initialPage:'friends',request:()=>invited([invitation('first',{...partner,name:'<img src=x onerror=alert(1)> & Court Friend',rating:1140})])},async({nodes,calls,routes})=>{
 const popup=nodes['duo-invitation-dialog'];
 assert.equal(popup.open,true);assert.equal(popup.modalOpens,1);
 assert.equal(nodes.play.querySelectorAll('button').includes(button(nodes['duo-invitations'],'Accept duo ↗')),false,'popup actions must live outside the hidden Play page');
 assert.match(nodes['duo-invitations'].textContent,/<img src=x onerror=alert\(1\)> & Court Friend/);assert.match(nodes['duo-invitations'].textContent,/1140 MMR/);
 assert.ok(button(popup,'Accept duo ↗'));assert.ok(button(popup,'Decline'));
 assert.deepEqual(calls.map(call=>call.path),['/api/play']);assert.deepEqual(routes,[],'showing an invitation must preserve the current page');
}));

test('new invitations are polled and pop up from every signed-in page',async()=>{
 for(const page of ['profile','rating','play','locker','friends','courts','leaderboard']){
  let current=snapshot();
  await withPlay({initialPage:page,request:()=>current},async({controller,polls,poll,nodes,routes})=>{
   await controller.handleNavigation(page);
   assert.equal(polls.filter(entry=>entry.active).length,1,`${page} keeps invitation polling active`);assert.equal(polls.find(entry=>entry.active).delay,20000);
   current=invited();await poll();
   assert.equal(nodes['duo-invitation-dialog'].open,true,`${page} receives the popup`);assert.match(nodes['duo-invitations'].textContent,/Court Friend/);assert.deepEqual(routes,[]);
  });
 }
});

test('close and Escape dismiss current invitations until manually reopened or a new invite arrives',async()=>{
 let current=invited([invitation('first'),invitation('second',opponent)]);
 await withPlay({request:()=>structuredClone(current)},async({nodes,controller,poll,escapeInvitation})=>{
  const popup=nodes['duo-invitation-dialog'];
  await nodes['duo-invitation-close'].click();assert.equal(popup.open,false);
  await controller.refresh();await poll();assert.equal(popup.open,false);assert.equal(popup.modalOpens,1,'unchanged pending IDs cannot reopen a dismissed popup');
  const reopen=button(nodes['my-duo'],'View duo invitation');assert.ok(reopen);await reopen.click();assert.equal(popup.open,true);
  await escapeInvitation();assert.equal(popup.open,false);await controller.refresh();assert.equal(popup.open,false);
  current=invited([...current.invitations,invitation('third',opponentPartner)]);await poll();
  assert.equal(popup.open,true);assert.equal(popup.modalOpens,3);assert.match(nodes['duo-invitations'].textContent,/Other Teammate/);
  assert.equal(nodes['duo-invitations'].querySelectorAll('button').filter(node=>node.textContent==='Accept duo ↗').length,3,'reopening presents all currently pending invitations');
 });
});

test('identical invitations retain their focused actions through unchanged and unrelated stats refreshes',async()=>{
 let current=invited();
 await withPlay({request:()=>structuredClone(current)},async({nodes,controller,poll,document})=>{
  const card=nodes['duo-invitations'].children[0],accept=button(card,'Accept duo ↗');accept.focus();
  await controller.refresh();await poll();
  assert.equal(nodes['duo-invitations'].children[0],card);assert.equal(document.activeElement,accept);assert.equal(nodes['duo-invitation-dialog'].modalOpens,1);
  current={...current,player:{...mine,rating:1220,games:1,wins:1}};await controller.refresh();
  assert.equal(nodes['duo-invitations'].children[0],card,'a stats update must not replace the invitation under the keyboard user');assert.equal(document.activeElement,accept);
 });
});

test('a new invitation preserves the focused inviter and action when the popup list changes order',async()=>{
 let current=invited([invitation('first')]);
 await withPlay({request:()=>structuredClone(current)},async({nodes,poll,document})=>{
  const originalDecline=button(nodes['duo-invitations'].children[0],'Decline');originalDecline.focus();
  current=invited([invitation('second',opponent),...current.invitations]);await poll();
  assert.equal(nodes['duo-invitation-dialog'].open,true);assert.equal(nodes['duo-invitation-dialog'].modalOpens,1);
  const existingCard=nodes['duo-invitations'].children[1];assert.match(existingCard.textContent,/Court Friend/);
  assert.equal(document.activeElement,button(existingCard,'Decline'),'focus follows the same invitation ID and action instead of the old list position');
 });
});

test('a popup response blocks duplicate actions and dismissal, then shows failures and permits retry',async()=>{
 const saved=deferred();let attempts=0,current=invited([invitation('first'),invitation('second',opponent)]);
 await withPlay({initialPage:'locker',request:path=>{if(path==='/api/duos/first/respond'){if(++attempts===1)return saved.promise;current=invited([invitation('second',opponent)]);}return current;}},async({nodes,calls,escapeInvitation})=>{
  const popup=nodes['duo-invitation-dialog'],decline=button(nodes['duo-invitations'],'Decline'),responding=decline.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(nodes['duo-invitation-close'].disabled,true);assert.ok(nodes['duo-invitations'].querySelectorAll('button').every(node=>node.disabled));
  await decline.click();await nodes['duo-invitation-close'].click();assert.equal(await escapeInvitation(),true);assert.equal(popup.open,true);
  assert.equal(calls.filter(call=>call.method==='POST').length,1);assert.deepEqual(calls.at(-1),{path:'/api/duos/first/respond',body:{accept:false},method:'POST'});
  saved.reject(new Error('Connection interrupted. Try again.'));await responding;
  assert.equal(popup.open,true);assert.equal(nodes['duo-invitation-error'].hidden,false);assert.match(nodes['duo-invitation-error'].textContent,/Connection interrupted/);assert.equal(nodes['duo-invitation-close'].disabled,false);
  const retry=button(nodes['duo-invitations'],'Decline');assert.equal(retry.disabled,false);await retry.click();
  assert.equal(attempts,2);assert.equal(popup.open,true);assert.doesNotMatch(nodes['duo-invitations'].textContent,/Court Friend/);assert.match(nodes['duo-invitations'].textContent,/Other Captain/);assert.equal(nodes['duo-invitation-error'].hidden,true);
 });
});

test('declining one of two invitations keeps the popup open and focuses the remaining action',async()=>{
 let current=invited([invitation('first'),invitation('second',opponent)]);
 await withPlay({request:(path,body)=>{if(path==='/api/duos/first/respond'){assert.deepEqual(body,{accept:false});current=invited([invitation('second',opponent)]);}return current;}},async({nodes,calls,document})=>{
  const decline=button(nodes['duo-invitations'].children[0],'Decline');decline.focus();await decline.click();
  assert.equal(nodes['duo-invitation-dialog'].open,true);assert.equal(nodes['duo-invitation-dialog'].modalOpens,1);assert.equal(nodes['duo-invitations'].children.length,1);
  const remaining=nodes['duo-invitations'].children[0],accept=button(remaining,'Accept duo ↗');assert.match(remaining.textContent,/Other Captain/);
  assert.equal(document.activeElement,accept);assert.equal(accept.disabled,false);assert.equal(calls.filter(call=>call.method==='POST').length,1);
 });
});

test('removed and locally expired invitations close the popup and cannot be reopened',async()=>{
 for(const reason of ['removed','expired']){
  let current=invited([invitation('first',partner,5000)]);
  await withPlay({request:()=>current},async({nodes,controller,setTime})=>{
   assert.equal(nodes['duo-invitation-dialog'].open,true);
   if(reason==='removed')current=snapshot();else setTime(5000);
   await controller.refresh();
   assert.equal(nodes['duo-invitation-dialog'].open,false,reason);assert.equal(nodes['duo-invitations'].children.length,0,reason);assert.equal(button(nodes['my-duo'],'View duo invitation'),undefined,reason);
  });
 }
});

test('an expired invitation closes even when its quiet polling refresh fails',async()=>{
 let reads=0;
 await withPlay({request:()=>{if(++reads>1)throw new Error('Offline.');return invited([invitation('first',partner,5000)]);}},async({nodes,setTime,poll})=>{
  assert.equal(nodes['duo-invitation-dialog'].open,true);setTime(22000);await poll();
  assert.equal(reads,2);assert.equal(nodes['duo-invitation-dialog'].open,false);assert.equal(nodes['duo-invitations'].children.length,0);
  assert.equal(nodes['play-error'].hidden,true,'background polling failures stay quiet');assert.equal(nodes['duo-invitation-error'].hidden,true);
  const reopen=button(nodes['my-duo'],'View duo invitation');if(reopen)await reopen.click();
  assert.equal(nodes['duo-invitation-dialog'].open,false,'cached data cannot reopen an expired invitation');
 });
});

test('hidden tabs defer pending invitation popups until the page becomes visible',()=>withPlay({hidden:true,initialPage:'courts',request:()=>invited()},async({nodes,visibility,polls})=>{
 assert.equal(nodes['duo-invitation-dialog'].open,false);assert.equal(polls.filter(entry=>entry.active).length,0);
 await visibility(false);assert.equal(nodes['duo-invitation-dialog'].open,true);assert.equal(polls.filter(entry=>entry.active).length,1);
}));

test('pending invitations wait for another dialog to close before taking focus',async()=>{
 for(const otherDialog of ['install-dialog','story-dialog','player-scan-dialog'])await withPlay({openDialog:otherDialog,request:()=>invited()},async({nodes})=>{
  const popup=nodes['duo-invitation-dialog'];assert.equal(popup.open,false,otherDialog);assert.equal(nodes[otherDialog].open,true);
  nodes[otherDialog].close();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(popup.open,true,`${otherDialog} close releases the queued invitation`);assert.equal(popup.modalOpens,1);
 });
});

test('incoming challenges show both rosters and ratings for recipients on either team side',async()=>{
 for(const ownSide of ['a','b']){
  const match=challenge({teams:ownSide==='a'?{a:[mine,partner],b:[opponent,opponentPartner]}:{a:[opponent,opponentPartner],b:[mine,partner]}});
  await withPlay({initialPage:'friends',request:()=>challenged([match])},async({nodes,routes,calls,formations})=>{
   assert.equal(nodes['duo-invitation-dialog'].open,true,ownSide);assert.equal(nodes['duo-invitation-heading'].textContent,'You’ve been challenged.');
   const content=nodes['duo-invitations'].textContent;for(const player of [mine,partner,opponent,opponentPartner])assert.ok(content.includes(player.name),player.name);
   for(const rating of ['1480 MMR','1320 MMR','1200 MMR','1400 avg. MMR','1200 avg. MMR'])assert.ok(content.includes(rating),rating);
   assert.ok(button(nodes['duo-invitations'],'Accept match ↗'));assert.ok(button(nodes['duo-invitations'],'Decline'));assert.equal(button(nodes['duo-invitations'],'Accept duo ↗'),undefined);
   assert.ok(button(nodes['play-matches'],'View challenge'));assert.equal(button(nodes['play-matches'],'Accept match ↗'),undefined,'the inline card reopens the actionable popup');
   assert.deepEqual(routes,[]);assert.equal(calls.some(call=>call.method==='POST'),false);assert.deepEqual(formations,[]);
  });
 }
});

test('incoming match challenges pop up through polling on every signed-in page',async()=>{
 for(const page of ['profile','rating','play','locker','friends','courts','leaderboard']){
  let current=paired();
  await withPlay({initialPage:page,request:()=>current},async({nodes,controller,poll,routes})=>{
   await controller.handleNavigation(page);assert.equal(nodes['duo-invitation-dialog'].open,false);
   current=challenged();await poll();
   assert.equal(nodes['duo-invitation-dialog'].open,true,page);assert.equal(nodes['duo-invitation-heading'].textContent,'You’ve been challenged.');assert.deepEqual(routes,[]);
  });
 }
});

test('outgoing, answered, unrelated, incomplete and expired challenges never become incoming popups',async()=>{
 const scenarios=[
  {label:'current player sent it',match:challenge({createdBy:mine.id})},
  {label:'current teammate sent it',match:challenge({createdBy:partner.id})},
  ...['active','completed','cancelled'].map(status=>({label:status,match:challenge({status})})),
  {label:'creator is not on either team',match:challenge({createdBy:'unrelated-player'})},
  {label:'current player is not a participant',match:challenge({teams:{a:[opponent,opponentPartner],b:[partner,player('other','Other Player','SO-444444444444')]}})},
  {label:'one opposing player is missing',match:challenge({teams:{a:[opponent],b:[mine,partner]}})},
  {label:'duplicate opposing player',match:challenge({teams:{a:[opponent,{...opponent}],b:[mine,partner]}})},
  {label:'24-hour challenge lifetime elapsed',match:challenge({createdAt:-86400000})},
  {label:'explicit expiry elapsed',match:challenge({expiresAt:1000})},
 ];
 for(const {label,match}of scenarios)await withPlay({request:()=>challenged([match])},async({nodes,calls})=>{
  assert.equal(nodes['duo-invitation-dialog'].open,false,label);assert.equal(nodes['duo-invitations'].children.length,0,label);assert.equal(calls.some(call=>call.method==='POST'),false,label);
 });
});

test('challenge close and Escape postpone the current match while View challenge or a new ID reopens it',async()=>{
 let current=challenged();
 await withPlay({request:()=>structuredClone(current)},async({nodes,controller,poll,escapeInvitation})=>{
  const popup=nodes['duo-invitation-dialog'];await nodes['duo-invitation-close'].click();
  await controller.refresh();await poll();assert.equal(popup.open,false);assert.equal(popup.modalOpens,1);
  await button(nodes['play-matches'],'View challenge').click();assert.equal(popup.open,true);
  await escapeInvitation();await controller.refresh();assert.equal(popup.open,false);
  current=challenged([challenge({id:'match-2'})]);await poll();
  assert.equal(popup.open,true);assert.equal(popup.modalOpens,3);assert.equal(nodes['duo-invitation-heading'].textContent,'You’ve been challenged.');
 });
});

test('challenge accept and decline block duplicate submissions, show retry errors, and keep duo celebration silent',async()=>{
 for(const accept of [true,false]){
  const saved=deferred();let attempts=0,current=challenged();
  await withPlay({initialPage:'courts',request:(path,body)=>{if(path==='/api/matches/match-1/respond'){assert.deepEqual(body,{accept});if(++attempts===1)return saved.promise;current=challenged([challenge({status:accept?'active':'cancelled'})]);}return current;}},async({nodes,calls,escapeInvitation,document,formations})=>{
   const label=accept?'Accept match ↗':'Decline',action=button(nodes['duo-invitations'],label),responding=action.click();await new Promise(resolve=>setImmediate(resolve));
   assert.equal(nodes['duo-invitation-close'].disabled,true);assert.ok(nodes['duo-invitations'].querySelectorAll('button').every(node=>node.disabled));
   await action.click();await nodes['duo-invitation-close'].click();assert.equal(await escapeInvitation(),true);assert.equal(nodes['duo-invitation-dialog'].open,true);
   assert.deepEqual(calls.filter(call=>call.method==='POST'),[{path:'/api/matches/match-1/respond',body:{accept},method:'POST'}]);
   saved.reject(new Error('Connection interrupted. Try again.'));await responding;
   assert.equal(nodes['duo-invitation-dialog'].open,true);assert.equal(nodes['duo-invitation-error'].hidden,false);assert.match(nodes['duo-invitation-error'].textContent,/Connection interrupted/);
   const retry=button(nodes['duo-invitations'],label);assert.equal(retry.disabled,false);assert.equal(document.activeElement,button(nodes['duo-invitations'],'Accept match ↗'));
   await retry.click();assert.equal(attempts,2);assert.equal(nodes['duo-invitation-dialog'].open,false);assert.equal(nodes['duo-invitations'].children.length,0);assert.deepEqual(formations,[]);
   assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>call.body),[{accept},{accept}]);
  });
 }
});

test('teammate acceptance, cancellation and removed matches close pending challenge popups on refresh',async()=>{
 for(const status of ['active','cancelled','removed']){
  let current=challenged();
  await withPlay({request:()=>current},async({nodes,poll,calls,formations})=>{
   assert.equal(nodes['duo-invitation-dialog'].open,true);current=status==='removed'?paired():challenged([challenge({status})]);await poll();
   assert.equal(nodes['duo-invitation-dialog'].open,false,status);assert.equal(nodes['duo-invitations'].children.length,0,status);assert.equal(button(nodes['play-matches'],'View challenge'),undefined,status);
   assert.equal(calls.some(call=>call.method==='POST'),false);assert.deepEqual(formations,[]);
  });
 }
});

test('challenge expiry closes cached popups even when quiet refresh fails',async()=>{
 for(const explicit of [false,true]){
  let reads=0;const match=challenge(explicit?{expiresAt:5000}:{});
  await withPlay({request:()=>{if(++reads>1)throw new Error('Offline.');return challenged([match]);}},async({nodes,setTime,poll})=>{
   assert.equal(nodes['duo-invitation-dialog'].open,true);setTime(explicit?5000:86401000);await poll();
   assert.equal(reads,2);assert.equal(nodes['duo-invitation-dialog'].open,false);assert.equal(nodes['duo-invitations'].children.length,0);assert.equal(button(nodes['play-matches'],'View challenge'),undefined);
   assert.equal(nodes['play-error'].hidden,true);assert.equal(nodes['duo-invitation-error'].hidden,true);
  });
 }
});

test('explicit challenge expiry overrides its creation date and legacy matches without dates remain answerable',async()=>{
 for(const match of [challenge({createdAt:-86400000,expiresAt:60000}),challenge({createdAt:undefined})])await withPlay({request:()=>challenged([match])},async({nodes})=>{
  assert.equal(nodes['duo-invitation-dialog'].open,true);assert.ok(button(nodes['duo-invitations'],'Accept match ↗'));
 });
});

test('challenge popups defer to another dialog and preserve focused actions on unchanged polling',()=>withPlay({openDialog:'story-dialog',request:()=>structuredClone(challenged())},async({nodes,controller,poll,document})=>{
 const popup=nodes['duo-invitation-dialog'];assert.equal(popup.open,false);
 nodes['story-dialog'].close();await new Promise(resolve=>setImmediate(resolve));assert.equal(popup.open,true);
 const card=nodes['duo-invitations'].children[0],decline=button(card,'Decline');decline.focus();await controller.refresh();await poll();
 assert.equal(nodes['duo-invitations'].children[0],card);assert.equal(document.activeElement,decline);assert.equal(popup.modalOpens,1);
}));

test('accepting a traditional invitation celebrates, leaving does not, and a later new duo can celebrate',async()=>{
 let current={...snapshot(),invitations:[{id:'invite-1',from:partner}]};
 await withPlay({request:path=>{
  if(path==='/api/duos/invite-1/respond')current=paired();
  if(path==='/api/duos/leave')current=snapshot();
  return current;
 }},async({nodes,formations,controller})=>{
  const accept=nodes['duo-invitations'].querySelectorAll('button').find(button=>button.textContent==='Accept duo ↗');
  assert.ok(accept);assert.equal(nodes['duo-invitation-dialog'].open,true);assert.deepEqual(formations,[]);await accept.click();
  assert.equal(nodes['duo-invitation-dialog'].open,false);assert.equal(nodes['duo-invitations'].children.length,0);
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

test('a rejected lazy duo effect is contained after a successful claim',()=>withPlay({href:`${origin}/?duo=${token}#play`,request:path=>path==='/api/duos/join'?paired():snapshot(),async onDuoFormed(){throw new Error('Effect import unavailable.');}},async({nodes,formations,location})=>{
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(formations.length,1);
 assert.equal(new URL(location.href).searchParams.has('duo'),false);
 assert.equal(nodes['play-error'].hidden,true);
 assert.match(nodes['my-duo'].textContent,/Court Friend/);
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

test('startup and quick navigation reuse a current snapshot while explicit refresh fetches fresh data',()=>withPlay({},async({controller,calls,setTime})=>{
 assert.equal(calls.length,1);
 await controller.handleNavigation('profile');await controller.handleNavigation('rating');await controller.handleNavigation('play');
 assert.equal(calls.length,1,'initial navigation must not repeat the initial player request');
 await controller.refresh();assert.equal(calls.length,2,'manual refresh always asks the server');
 setTime(22000);await controller.handleNavigation('play');assert.equal(calls.length,3,'returning after the poll interval refreshes stale ratings');
}));

test('unchanged refreshes retain play DOM and notify profile stats only when stats change',async()=>{
 let current=snapshot();
 await withPlay({request:()=>structuredClone(current)},async({controller,stats,nodes,poll})=>{
  const identity=nodes['play-identity-player'].children[0],matches=nodes['play-matches'].children[0];
  await controller.refresh();await poll();assert.equal(stats.length,1);
  assert.equal(nodes['play-identity-player'].children[0],identity);assert.equal(nodes['play-matches'].children[0],matches);
  current={...snapshot(),invitations:[{id:'new-invitation',from:partner}]};await controller.refresh();
  assert.equal(stats.length,1,'invitations must not redraw unrelated profile and wardrobe controls');assert.match(nodes['duo-invitations'].textContent,/Court Friend/);
  current={...current,player:{...mine,rating:1216,games:1,wins:1}};await controller.refresh();
  assert.equal(stats.length,2);assert.equal(stats[1].rating,1216);assert.match(nodes['play-identity-player'].textContent,/1216 MMR/);
 });
});

test('a slow opponent refresh does not delay displaying current own stats',async()=>{
 const opponentRead=deferred();let reads=0,current=snapshot();
 await withPlay({href:`${origin}/?player=${partner.code}#play`,request:path=>path.startsWith('/api/players/')?(++reads===1?{player:partner,duo:null}:opponentRead.promise):current},async({controller,stats,nodes})=>{
  current={...snapshot(),player:{...mine,rating:1250}};const updating=controller.refresh();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(stats.at(-1).rating,1250);assert.match(nodes['play-identity-player'].textContent,/1250 MMR/);
  opponentRead.resolve({player:{...partner,name:'Updated Friend'},duo:null});await updating;
  assert.match(nodes['connected-player'].textContent,/Updated Friend/);
 });
});

test('an older opponent refresh cannot overwrite a newer explicit player lookup',async()=>{
 const oldRead=deferred();let reads=0;
 await withPlay({href:`${origin}/?player=${partner.code}#play`,request:path=>path.endsWith(partner.code)?(++reads===1?{player:partner,duo:null}:oldRead.promise):path.endsWith(opponent.code)?{player:opponent,duo:opposingDuo}:paired()},async({controller,lookup,nodes})=>{
  const refreshing=controller.refresh();await new Promise(resolve=>setImmediate(resolve));
  await lookup(opponent.code);assert.match(nodes['connected-player'].textContent,/Other Captain/);
  oldRead.resolve({player:{...partner,name:'Outdated Friend'},duo:null});await refreshing;
  assert.match(nodes['connected-player'].textContent,/Other Captain/);assert.doesNotMatch(nodes['connected-player'].textContent,/Outdated Friend/);
 });
});

test('polling pauses in hidden tabs, resumes after restoration, and keeps invitations active on other pages',()=>withPlay({},async({controller,calls,polls,visibility,windowEvent,setTime,setPage,poll})=>{
 assert.equal(polls.filter(entry=>entry.active).length,1);
 await visibility(true);assert.equal(polls.filter(entry=>entry.active).length,0);await poll();assert.equal(calls.length,1);
 setTime(22000);await visibility(false);assert.equal(polls.filter(entry=>entry.active).length,1);assert.equal(calls.length,2);
 await windowEvent('pagehide');assert.equal(polls.filter(entry=>entry.active).length,0);
 setTime(43000);await windowEvent('pageshow',{persisted:true});assert.equal(polls.filter(entry=>entry.active).length,1);assert.equal(calls.length,3);
 setPage('locker');await controller.handleNavigation('locker');assert.equal(polls.filter(entry=>entry.active).length,1);
 await poll();assert.equal(calls.length,4);
 setPage('profile');await controller.handleNavigation('profile');assert.equal(polls.filter(entry=>entry.active).length,1);assert.equal(calls.length,4);
 setPage('avatar');await controller.handleNavigation('avatar');assert.equal(polls.filter(entry=>entry.active).length,0);await poll();assert.equal(calls.length,4);
}));

test('the photo QR decoder loads only when a photo is read and is reused for subsequent photos',async()=>{
 let loads=0,decodes=0,closed=0;
 await withPlay({loadQrDecoder:async()=>{loads++;return()=>{decodes++;return null;};},createImageBitmap:async()=>({width:100,height:100,close(){closed++;}})},async({nodes})=>{
  assert.equal(loads,0);nodes['use-player-photo'].click();assert.equal(loads,0);
  await nodes['scan-file'].emit('change',{target:{files:[{size:100}]}});assert.equal(loads,1);assert.equal(decodes,1);assert.equal(closed,1);
  await nodes['scan-file'].emit('change',{target:{files:[{size:100}]}});assert.equal(loads,1);assert.equal(decodes,2);assert.equal(closed,2);
  nodes['scan-close'].click();
 });
});

test('leaving the scanner during decoder startup releases the camera without starting a scan',async()=>{
 const decoder=deferred();let loads=0,stops=0,decodes=0;
 await withPlay({loadQrDecoder:()=>{loads++;return decoder.promise;},mediaDevices:{async getUserMedia(){return{getTracks:()=>[{stop(){stops++;}}]};}}},async({nodes,controller})=>{
  const opening=nodes['scan-player'].click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(loads,1);assert.equal(nodes['player-scan-dialog'].open,true);
  await controller.handleNavigation('profile');assert.equal(stops,1);assert.equal(nodes['player-scan-dialog'].open,false);
  decoder.resolve(()=>{decodes++;return null;});await opening;
  assert.equal(decodes,0);assert.equal(nodes['player-scan-video'].srcObject,null);
 });
});

test('scanning an opposing duo opens settings after the preview and sends nothing until confirmation',async()=>{
 const preview=deferred();
 await withPlay({onOpponentFound:()=>preview.promise,loadQrDecoder:async()=>()=>opponent.code,mediaDevices:{async getUserMedia(){return{getTracks:()=>[{stop(){}}]};}},request:path=>path.startsWith('/api/players/')?{player:opponent,duo:opposingDuo}:paired()},async({nodes,calls,opponents})=>{
  Object.assign(nodes['player-scan-video'],{readyState:2,videoWidth:100,videoHeight:100});
  await nodes['scan-player'].click();await nextTurn();
  assert.equal(opponents.length,1);assert.equal(nodes['player-scan-dialog'].open,false);
  assert.equal(nodes['match-settings-dialog'].open,false,'let the player see the preview first');
  preview.resolve();await nextTurn();
  assert.equal(nodes['match-settings-dialog'].open,true);
  assert.equal(nodes['match-settings-best-of'].value,'3');
  assert.equal(calls.some(call=>call.method==='POST'),false,'scanning never creates a match');
  await submitForm(nodes['match-settings-form']);
  assert.equal(calls.filter(call=>call.path==='/api/matches').length,1);
 });
});

test('leaving Play or replacing the opponent prevents an old scan from reopening match settings',async()=>{
 for(const action of ['navigate','replace']){
  const preview=deferred();
  await withPlay({onOpponentFound:()=>preview.promise,loadQrDecoder:async()=>()=>opponent.code,mediaDevices:{async getUserMedia(){return{getTracks:()=>[{stop(){}}]};}},request:path=>path.startsWith('/api/players/')?{player:path.endsWith(partner.code)?partner:opponent,duo:path.endsWith(partner.code)?paired().duo:opposingDuo}:paired()},async({nodes,calls,setPage,controller,lookup})=>{
   Object.assign(nodes['player-scan-video'],{readyState:2,videoWidth:100,videoHeight:100});
   await nodes['scan-player'].click();await nextTurn();
   if(action==='navigate'){setPage('profile');await controller.handleNavigation('profile');}else await lookup(partner.code);
   preview.resolve();await nextTurn();
   assert.equal(nodes['match-settings-dialog'].open,false,action);
   assert.equal(calls.some(call=>call.method==='POST'),false);
  });
 }
});

test('camera scanning loads the decoder once and closes the camera after finding a player',async()=>{
 let loads=0,decodes=0,stops=0;
 await withPlay({loadQrDecoder:async()=>{loads++;return()=>{decodes++;return partner.code;};},mediaDevices:{async getUserMedia(){return{getTracks:()=>[{stop(){stops++;}}]};}},request:path=>path.startsWith('/api/players/')?{player:partner,duo:null}:snapshot()},async({nodes,calls})=>{
  Object.assign(nodes['player-scan-video'],{readyState:2,videoWidth:100,videoHeight:100});
  await nodes['scan-player'].click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(loads,1);assert.equal(decodes,1);assert.equal(stops,1);assert.equal(nodes['player-scan-dialog'].open,false);assert.equal(calls.filter(call=>call.path.endsWith(partner.code)).length,1);
  await nodes['scan-player'].click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(loads,1);assert.equal(decodes,2);assert.equal(stops,2);
 });
});

test('Challenge opens global match settings with defaults and closing or Escape sends no challenge',()=>withPlay({request:path=>path.startsWith('/api/players/')?{player:opponent,duo:opposingDuo}:paired()},async({nodes,lookup,calls})=>{
 await lookup(opponent.code);
 const open=()=>button(nodes['connected-player'],'Challenge their duo ↗').click();
 await open();assert.equal(nodes['match-settings-dialog'].open,true);
 assert.equal(nodes.play.contains(nodes['match-settings-dialog']),false,'settings must remain global when Play is hidden');
 assert.equal(nodes['match-settings-best-of'].value,'3');assert.equal(nodes['match-settings-points'].value,'11');assert.equal(nodes['match-settings-win-by'].value,'2');
 assert.equal(calls.some(call=>call.method==='POST'),false);
 await nodes['match-settings-close'].click();assert.equal(nodes['match-settings-dialog'].open,false);
 await open();let prevented=false;nodes['match-settings-dialog'].emit('cancel',{preventDefault(){prevented=true;}});if(!prevented)nodes['match-settings-dialog'].close();await nextTurn();
 assert.equal(nodes['match-settings-dialog'].open,false);assert.equal(calls.some(call=>call.method==='POST'),false);
}));

test('selected match settings survive refresh and failed submission, block duplicates, and persist in the created challenge',async()=>{
 const saved=deferred(),format={bestOf:5,pointsToWin:21,winBy:1};let attempts=0,current=paired();
 await withPlay({request:(path,body)=>{if(path.startsWith('/api/players/'))return{player:opponent,duo:opposingDuo};if(path==='/api/matches'){if(++attempts===1)return saved.promise;current={...paired(),matches:[challenge({teams:{a:[mine,partner],b:[opponent,opponentPartner]},createdBy:mine.id,format:body.format})]};}return current;}},async({nodes,lookup,calls,controller})=>{
  await lookup(opponent.code);await button(nodes['connected-player'],'Challenge their duo ↗').click();
  nodes['match-settings-best-of'].value='5';nodes['match-settings-points'].value='21';nodes['match-settings-win-by'].value='1';
  await controller.refresh();assert.equal(nodes['match-settings-best-of'].value,'5');assert.equal(nodes['match-settings-points'].value,'21');assert.equal(nodes['match-settings-win-by'].value,'1');
  const submitting=nodes['match-settings-form'].emit('submit',{preventDefault(){}});await nextTurn();
  assert.equal(nodes['match-settings-submit'].disabled,true);assert.equal(nodes['match-settings-close'].disabled,true);
  nodes['match-settings-form'].emit('submit',{preventDefault(){}});await nodes['match-settings-close'].click();let prevented=false;nodes['match-settings-dialog'].emit('cancel',{preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(nodes['match-settings-dialog'].open,true);assert.equal(calls.filter(call=>call.path==='/api/matches').length,1);
  saved.reject(new Error('Connection interrupted. Try again.'));await submitting;await nextTurn();
  assert.equal(nodes['match-settings-dialog'].open,true);assert.equal(nodes['match-settings-error'].hidden,false);assert.match(nodes['match-settings-error'].textContent,/Connection interrupted/);
  assert.equal(nodes['match-settings-submit'].disabled,false);assert.equal(nodes['match-settings-best-of'].value,'5');
  await submitForm(nodes['match-settings-form']);
  assert.equal(nodes['match-settings-dialog'].open,false);assert.equal(attempts,2);
  assert.deepEqual(calls.filter(call=>call.path==='/api/matches').map(call=>call.body),[{playerCode:opponent.code,format},{playerCode:opponent.code,format}]);
  assert.match(nodes['play-matches'].textContent,/Best of 5 · 21 points · Win by 1/);
 });
});

test('a challenge waits for an in-flight refresh and rejects a replacement duo on either side',async()=>{
 for(const changedSide of ['own','opponent']){
  let current=paired(),opponentView={player:opponent,duo:opposingDuo},playRead=null;
  await withPlay({request:path=>path.startsWith('/api/players/')?structuredClone(opponentView):path==='/api/play'&&playRead?playRead.promise:structuredClone(current)},async({nodes,lookup,controller,calls})=>{
   await lookup(opponent.code);await button(nodes['connected-player'],'Challenge their duo ↗').click();
   if(changedSide==='own')current={...paired(),duo:{id:'replacement-own-duo',players:[mine,player('replacement-partner','New Teammate','SO-444444444444')]}};
   else opponentView={player:opponent,duo:{id:'replacement-opponent-duo',players:[opponent,player('replacement-opponent','New Opponent','SO-555555555555')]}};
   playRead=deferred();const updating=controller.refresh();await nextTurn();
   const submitting=nodes['match-settings-form'].emit('submit',{preventDefault(){}});await nextTurn();
   assert.equal(nodes['match-settings-submit'].disabled,true);assert.equal(calls.some(call=>call.path==='/api/matches'),false,'a pending refresh must finish before creating a challenge');
   playRead.resolve(structuredClone(current));await Promise.all([updating,submitting]);
   assert.equal(calls.some(call=>call.path==='/api/matches'),false,`${changedSide} duo changes require the player to review the matchup again`);
   assert.equal(nodes['match-settings-dialog'].open,true);assert.equal(nodes['match-settings-error'].hidden,false);assert.match(nodes['match-settings-error'].textContent,/duos changed/i);assert.equal(nodes['match-settings-submit'].disabled,false);assert.equal(nodes['match-settings-close'].disabled,false);
  });
 }
});

test('invalid settings are rejected before sending and newly received challenges defer until settings close',async()=>{
 let current=paired();
 await withPlay({request:path=>path.startsWith('/api/players/')?{player:opponent,duo:opposingDuo}:current},async({nodes,lookup,calls,poll})=>{
  await lookup(opponent.code);await button(nodes['connected-player'],'Challenge their duo ↗').click();
  for(const [id,value]of [['match-settings-best-of','2'],['match-settings-points','10'],['match-settings-win-by','3']]){
   nodes['match-settings-best-of'].value='3';nodes['match-settings-points'].value='11';nodes['match-settings-win-by'].value='2';nodes[id].value=value;
   await submitForm(nodes['match-settings-form']);assert.equal(calls.some(call=>call.path==='/api/matches'),false);assert.equal(nodes['match-settings-error'].hidden,false);
  }
  current=challenged([challenge({format:matchFormat})]);await poll();assert.equal(nodes['duo-invitation-dialog'].open,false);assert.equal(nodes['match-settings-dialog'].open,true);
  await nodes['match-settings-close'].click();await nextTurn();assert.equal(nodes['duo-invitation-dialog'].open,true);assert.match(nodes['duo-invitations'].textContent,/Best of 3 · 11 points · Win by 2/);
 });
});

test('saved format is shown in incoming challenges and normal match cards without inventing legacy rules',async()=>{
 for(const format of [matchFormat,{bestOf:1,pointsToWin:15,winBy:1},{bestOf:5,pointsToWin:21,winBy:2}])await withPlay({request:()=>challenged([challenge({format})])},async({nodes})=>{
  const text=`${format.bestOf===1?'1 set':`Best of ${format.bestOf}`} · ${format.pointsToWin} points · Win by ${format.winBy}`;assert.ok(nodes['duo-invitations'].textContent.includes(text));assert.ok(nodes['play-matches'].textContent.includes(text));
 });
 for(const format of [null,undefined])await withPlay({request:()=>challenged([challenge({format})])},async({nodes})=>{assert.doesNotMatch(nodes['duo-invitations'].textContent,/Best of/);assert.doesNotMatch(nodes['play-matches'].textContent,/Best of/);});
});

test('one-set matches show one final-score pair and derive the winner from the entered score',async()=>{
 let current=challenged([challenge({status:'active',format:{bestOf:1,pointsToWin:11,winBy:2}})]);
 await withPlay({request:(path,body)=>{if(path.endsWith('/result'))current=challenged([challenge({status:'completed',format:{bestOf:1,pointsToWin:11,winBy:2},scores:body.scores,winnerSide:'a'})]);return current;}},async({nodes,calls,document})=>{
  const form=document.getElementById('result-match-1');
  assert.equal(form.querySelectorAll('input').length,2);
  assert.match(form.textContent,/Enter the final score\./);assert.match(form.textContent,/Play to 11, win by 2/);
  assert.equal(nodes['play-matches'].textContent.includes('Best of 1'),false);
  setScore(document,'match-1',0,'a',11);setScore(document,'match-1',0,'b',7);await submitForm(form);
  assert.deepEqual(calls.filter(call=>call.path.endsWith('/result')).map(call=>call.body),[{scores:[{a:11,b:7}]}]);
  assert.match(nodes['play-matches'].textContent,/Final score/);
 });
});

test('formatted score entry validates set rules and incomplete, partial, gapped or extra sets before any POST',async()=>{
 const invalid=[[[11,10],[11,7]],[[11,7]],[[11,7],['',11],[12,10]],[[11,7],['',''],[11,7]],[[11,7],[11,8],[11,9]],[[-1,11],[11,7],[12,10]],[[11.5,7],[11,7]],[[11,11],[11,7]]];
 for(const scores of invalid)await withPlay({request:()=>challenged([challenge({status:'active',format:matchFormat})])},async({nodes,calls,document})=>{
  for(const [index,score]of scores.entries())for(const [side,value]of [['a',score[0]],['b',score[1]]])setScore(document,'match-1',index,side,value);
  await submitForm(document.getElementById('result-match-1'));
  assert.equal(calls.some(call=>call.path.endsWith('/result')),false,JSON.stringify(scores));const error=document.getElementById('score-error-match-1');assert.equal(error.hidden,false,JSON.stringify(scores));assert.ok(error.textContent.length>0,JSON.stringify(scores));
 });
});

test('formatted scores derive the winner, preserve drafts on refresh and failure, and submit once per attempt',async()=>{
 const saved=deferred(),scores=[{a:11,b:7},{a:9,b:11},{a:12,b:10}];let attempts=0,current=challenged([challenge({status:'active',format:matchFormat})]);
 await withPlay({request:(path,body)=>{if(path.endsWith('/result')){if(++attempts===1)return saved.promise;current=challenged([challenge({status:'completed',format:matchFormat,scores:body.scores,winnerSide:'a'})]);}return current;}},async({nodes,calls,controller,document})=>{
  assert.equal(nodes['play-matches'].querySelector('select'),null,'a scored match must derive its winner');
  for(const [index,score]of scores.entries())for(const side of ['a','b'])setScore(document,'match-1',index,side,score[side]);
  current={...current,player:{...mine,name:'My Updated Player'}};await controller.refresh();for(const [index,score]of scores.entries())for(const side of ['a','b'])assert.equal(document.getElementById(`score-match-1-${index}-${side}`).value,String(score[side]));
  const form=document.getElementById('result-match-1'),submitting=form.emit('submit',{preventDefault(){}});await nextTurn();
  assert.ok(nodes['play-matches'].querySelectorAll('input').every(input=>input.disabled));form.emit('submit',{preventDefault(){}});assert.equal(calls.filter(call=>call.path.endsWith('/result')).length,1);
  saved.reject(new Error('Save interrupted. Retry your score.'));await submitting;await nextTurn();
  assert.match(nodes['play-error'].textContent,/Save interrupted/);for(const [index,score]of scores.entries())for(const side of ['a','b'])assert.equal(document.getElementById(`score-match-1-${index}-${side}`).value,String(score[side]));
  await submitForm(document.getElementById('result-match-1'));assert.equal(attempts,2);
  assert.deepEqual(calls.filter(call=>call.path.endsWith('/result')).map(call=>call.body),[{scores},{scores}]);
  assert.match(nodes['play-matches'].textContent,/RESULT RECORDED/);assert.match(nodes['play-matches'].textContent,/11.*7/);assert.match(nodes['play-matches'].textContent,/12.*10/);
 });
});

test('unrelated profile refreshes restore the focused score field and retain the entered draft',async()=>{
 let current=challenged([challenge({status:'active',format:matchFormat})]);
 await withPlay({request:()=>structuredClone(current)},async({nodes,controller,document})=>{
  setScore(document,'match-1',0,'a',11);setScore(document,'match-1',0,'b',7);setScore(document,'match-1',1,'a',11);
  const original=setScore(document,'match-1',1,'b',8);original.focus();
  current={...current,player:{...mine,name:'Updated Player Name'}};await controller.refresh();
  const restored=document.getElementById(original.id);assert.notEqual(restored,original,'this refresh must exercise replacement of the match form');assert.equal(document.activeElement,restored);assert.equal(nodes.play.contains(document.activeElement),true);assert.equal(restored.value,'8');
  assert.equal(document.getElementById('score-match-1-0-a').value,'11');assert.equal(document.getElementById('score-match-1-0-b').value,'7');assert.equal(document.getElementById('score-match-1-1-a').value,'11');
  const otherDialog=nodes['story-dialog'];otherDialog.showModal();otherDialog.focus();current={...current,player:{...current.player,name:'Another Profile Update'}};await controller.refresh();
  assert.equal(document.activeElement,otherDialog,'a score redraw must leave focus inside another open dialog');
 });
});

test('a failed score submission restores the last focused field and clears its error after editing and retrying',async()=>{
 const saved=deferred(),firstScores=[{a:11,b:7},{a:11,b:8}];let attempts=0,current=challenged([challenge({status:'active',format:matchFormat})]);
 await withPlay({request:(path,body)=>{if(path.endsWith('/result')){if(++attempts===1)return saved.promise;current=challenged([challenge({status:'completed',format:matchFormat,scores:body.scores,winnerSide:'a'})]);}return structuredClone(current);}},async({nodes,document,calls})=>{
  for(const [index,score]of firstScores.entries())for(const side of ['a','b'])setScore(document,'match-1',index,side,score[side]);
  const lastFocused=document.getElementById('score-match-1-0-b');lastFocused.focus();lastFocused.emit('focus');
  const form=document.getElementById('result-match-1');form.querySelector('button[type="submit"]').focus();
  const submitting=form.emit('submit',{preventDefault(){}});await nextTurn();saved.reject(new Error('Connection lost. Please retry.'));await submitting;
  const restored=document.getElementById(lastFocused.id),problem=document.getElementById('score-error-match-1');
  assert.notEqual(restored,lastFocused);assert.equal(document.activeElement,restored,'clicking Submit must not lose the earlier focused score field');assert.equal(nodes.play.contains(document.activeElement),true);assert.equal(restored.disabled,false);assert.equal(restored.value,'7');assert.equal(problem.hidden,false);assert.match(problem.textContent,/Connection lost/);
  setScore(document,'match-1',0,'b',8);assert.equal(problem.hidden,true);assert.equal(problem.textContent,'');
  await submitForm(document.getElementById('result-match-1'));
  assert.equal(attempts,2);assert.deepEqual(calls.filter(call=>call.path.endsWith('/result')).map(call=>call.body),[{scores:firstScores},{scores:[{a:11,b:8},{a:11,b:8}]}]);
  assert.equal(nodes['play-error'].hidden,true);assert.match(nodes['play-matches'].textContent,/RESULT RECORDED/);assert.doesNotMatch(nodes['play-matches'].textContent,/Connection lost/);
 });
});

test('a straight-set win excludes blank unplayed slots from its score submission',()=>withPlay({request:()=>challenged([challenge({status:'active',format:matchFormat})])},async({document,calls})=>{
 setScore(document,'match-1',0,'a',11);setScore(document,'match-1',0,'b',7);setScore(document,'match-1',1,'a',11);setScore(document,'match-1',1,'b',8);
 await submitForm(document.getElementById('result-match-1'));
 assert.deepEqual(calls.find(call=>call.path.endsWith('/result')).body,{scores:[{a:11,b:7},{a:11,b:8}]});
}));

test('legacy active matches retain winner selection and never submit invented scores',async()=>{
 for(const format of [null,undefined])await withPlay({request:()=>challenged([challenge({status:'active',format})])},async({nodes,calls})=>{
  const select=nodes['play-matches'].querySelector('select');assert.ok(select);assert.equal(nodes['play-matches'].querySelectorAll('input').length,0);select.value='b';select.emit('change',{target:select});
  await submitForm(nodes['play-matches'].querySelector('form'));
  assert.deepEqual(calls.find(call=>call.path.endsWith('/result')).body,{winnerSide:'b'});
 });
});
