import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as wardrobe from '../dist/wardrobe.js';
import * as hair from '../dist/hairstyles.js';
import * as renderCache from '../dist/render-cache.js';
import {STORY_TEMPLATES,getStoryDetails,storyFilename} from '../dist/story-card.js';

// Execute the real controllers, replacing only module loading and browser APIs.
// Counters assert work avoided, while node identity/selection checks catch stale UI.
function fakePage(){
 const counters={avatar:[],hair:[],clothing:[],story:[],imports:[],saves:[],flushes:0};
 const nodes=new Map(),windowEvents=new Map(),documentEvents=new Map(),frames=new Map();let nextFrame=0;
 const doc={activeElement:null,hidden:false};
 function matches(node,selector){
  if(selector.startsWith('#'))return node.id===selector.slice(1);
  if(selector.startsWith('.'))return selector.slice(1).split('.').every(name=>node.classes.has(name));
  if(selector.startsWith('[')){const [,name,value]=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/)||[];if(!name)return false;const actual=name.startsWith('data-')?node.dataset[name.slice(5).replace(/-([a-z])/g,(_m,c)=>c.toUpperCase())]:node.attributes[name];return actual!==undefined&&(value===undefined||String(actual)===value);}
  return node.tagName===selector.toUpperCase();
 }
 const descendants=node=>node.children.flatMap(child=>[child,...descendants(child)]);
 function select(root,selector){let roots=[root];for(const part of selector.split(/\s+/))roots=roots.flatMap(node=>descendants(node).filter(child=>matches(child,part)));return roots;}
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.id='';this.children=[];this.dataset={};this.attributes={};this.classes=new Set();this.listeners=new Map();this.style={};this.value='';this.hidden=false;this.open=false;this.disabled=false;this.width=640;this.height=480;this.rebuilds=0;this._text='';this.parentNode=null;
   this.classList={add:(...values)=>values.forEach(value=>this.classes.add(value)),remove:(...values)=>values.forEach(value=>this.classes.delete(value)),toggle:(value,on)=>{if(on??!this.classes.has(value))this.classes.add(value);else this.classes.delete(value);},contains:value=>this.classes.has(value)};
   this.context=new Proxy({canvas:this,measureText:value=>({width:String(value).length*10})},{get:(target,key)=>key in target?target[key]:(()=>{})});
  }
  set className(value){this.classes=new Set(value.split(/\s+/).filter(Boolean));}
  get className(){return [...this.classes].join(' ');}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  get firstElementChild(){return this.children[0];}
  append(...children){for(const child of children){child.parentNode=this;this.children.push(child);}}
  replaceChildren(...children){this.rebuilds++;this.children=[];this.append(...children);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  removeAttribute(name){delete this.attributes[name];}
  addEventListener(type,handler){const list=this.listeners.get(type)||[];list.push(handler);this.listeners.set(type,list);}
  async emit(type,event={}){for(const handler of this.listeners.get(type)||[])await handler({target:this,currentTarget:this,...event});}
  click(){return this.emit('click');}
  querySelectorAll(selector){return select(this,selector);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){let element=this;while(element){if(matches(element,selector))return element;element=element.parentNode;}return null;}
  getContext(){return this.context;}
  checkValidity(){return true;}
  reportValidity(){return true;}
  focus(){doc.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;return this.emit('close');}
 }
 const body=new Element('body');
 const node=id=>{if(!nodes.has(id)){const item=new Element(id.includes('avatar')||id==='story-canvas'?'canvas':'div');item.id=id;nodes.set(id,item);body.append(item);}return nodes.get(id);};
 Object.assign(doc,{body,getElementById:node,createElement:tag=>new Element(tag),querySelector:selector=>selector==='.rating-track span'?node('rating-track-span'):select(body,selector)[0]||null,querySelectorAll:selector=>select(body,selector),addEventListener:(type,fn)=>documentEvents.set(type,fn)});
 const pageIds=['avatar','profile','locker','play','leaderboard','hosting','friends','membership'];
 for(const id of pageIds){const page=node(id);page.className='page'+(id==='profile'?' active':'');const nav=new Element('button');nav.className='nav-button';nav.dataset.page=id;body.append(nav);}
 const membershipTrigger=node('profile-get-verified');membershipTrigger.tagName='BUTTON';membershipTrigger.dataset.membershipPlan='player';
 for(const scope of ['setup','locker']){
  for(const type of ['male','female']){const button=new Element('button');button.dataset.character=type;node(scope+'-character-options').append(button);}
  const button=new Element('button');button.dataset.hairHeadwear='';body.append(button);
 }
 for(const type of ['lean','regular','broad']){const button=new Element('button');button.dataset.body=type;node('setup-body-options').append(button);}
 for(const category of Object.keys(wardrobe.WARDROBE)){const button=new Element('button');button.dataset.category=category;body.append(button);}
 const profile={name:'Court Player',avatarCreated:true,skin:'#cf986c',shirt:'#ed795d',paddle:'#7286bb',hat:'cap',height:170,bodyType:'regular',characterType:'male',...wardrobe.DEFAULT_EQUIPMENT,...hair.normalizeHair({})};
 let current=new URL('https://sideout.example/#profile'),playOptions;
 const location={get href(){return current.href;},get hash(){return current.hash;},get search(){return current.search;}};
 const window={sideoutAuth:{ready:Promise.resolve({user:{id:'me',name:'Court Player'},profile}),saveProfile:async value=>counters.saves.push(structuredClone(value))},addEventListener:(type,fn)=>{const events=windowEvents.get(type)||[];events.push(fn);windowEvents.set(type,events);},scrollTo(){}};
 const modules={
  './wardrobe.js':wardrobe,'./hairstyles.js':hair,'./render-cache.js':renderCache,
  './profile-saver.js':{createProfileSaver:()=>({save:async(snapshot,options)=>{counters.saves.push({snapshot:structuredClone(snapshot),options});return true;},flush:async()=>{counters.flushes++;return true;}})},
  './pixel-player.js':{
   drawAvatar:(ctx,_x,_y,_scale,look)=>counters.avatar.push({id:ctx.canvas.id,profile:structuredClone(look)}),
   drawHairThumbnail:(canvas,look)=>counters.hair.push({canvas,profile:structuredClone(look)}),
   drawClothingThumbnail:(canvas,item,category)=>counters.clothing.push({canvas,id:item.id,category})
  },
  './player-links.js':{parseDuoInvite:()=>null},
  './play.js':{initPlay:async options=>{playOptions=options;await options.onStats({rating:1200,games:0,wins:0,history:[]});return{handleNavigation:async()=>{}};}}
 };
 window.testImport=async name=>{counters.imports.push(name);if(!(name in modules))throw new Error('Unexpected import '+name);return modules[name];};
 const context={window,document:doc,location,history:{replaceState(_state,_title,value){current=new URL(value,current);}},URL,URLSearchParams,structuredClone,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:fn=>{const id=++nextFrame;frames.set(id,fn);return id;}};
 return{context,counters,nodes,node,document:doc,window,modules,windowEvents,documentEvents,
  navigate:async page=>{current.hash='#'+page;for(const fn of windowEvents.get('hashchange')||[])await fn();},
  stats:async value=>playOptions.onStats({rating:1200,games:0,wins:0,history:[],...value}),
  duo:(...players)=>playOptions.onDuoFormed(...players),opponents:(...players)=>playOptions.onOpponentFound(...players),
  flushFrames(){const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();},
  get frameCount(){return frames.size;},profile
 };
}
async function appPage({avatarCreated=true}={}){
 const page=fakePage();page.profile.avatarCreated=avatarCreated;
 const source=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/import\(('\.\/[^']+')\)/g,'window.testImport($1)');
 await vm.runInNewContext(source,page.context);return page;
}

test('Friends restore starts a new controller while an earlier request is pending',async()=>{
 const page=await appPage();let creates=0,destroys=0,finishFirst;
 page.modules['./friends.js']={initFriends:()=>{const own=++creates;return{handleNavigation:()=>own===1?new Promise(resolve=>{finishFirst=resolve;}):Promise.resolve(),destroy(){destroys++;}};}};
 await page.navigate('friends');await Promise.resolve();await Promise.resolve();
 assert.equal(creates,1);
 for(const fn of page.windowEvents.get('pagehide')||[])await fn();
 for(const fn of page.windowEvents.get('pageshow')||[])await fn({persisted:true});
 await Promise.resolve();await Promise.resolve();assert.equal(creates,2);assert.equal(destroys,1);
 finishFirst();await Promise.resolve();await page.navigate('profile');await page.navigate('friends');
 assert.equal(creates,2,'late completion cannot replace the restored controller');
});

test('Friends import that completes after pagehide cannot initialize a stale controller',async()=>{
 const page=await appPage();let creates=0,finishImport;
 page.modules['./friends.js']=new Promise(resolve=>{finishImport=resolve;});
 await page.navigate('friends');
 for(const fn of page.windowEvents.get('pagehide')||[])await fn();
 finishImport({initFriends:()=>{creates++;return{handleNavigation:async()=>{},destroy(){}};}});
 await Promise.resolve();await Promise.resolve();assert.equal(creates,0);
 for(const fn of page.windowEvents.get('pageshow')||[])await fn({persisted:true});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(creates,1);
});

test('Hosting loads on demand and old court links open the same reusable controller',async()=>{
 const page=await appPage();let creates=0;const navigations=[];
 page.modules['./hosting.js']={initHosting:()=>{creates++;return{handleNavigation:async value=>navigations.push(value),destroy(){}};}};
 assert.equal(page.counters.imports.includes('./hosting.js'),false);
 await page.navigate('courts');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(page.context.location.hash,'#hosting');
 assert.equal(page.node('hosting').hidden,false);assert.equal(creates,1);
 await page.navigate('profile');await page.navigate('hosting');
 assert.equal(creates,1);assert.deepEqual(navigations,['hosting','profile','hosting']);
 assert.equal(page.counters.imports.filter(name=>name==='./hosting.js').length,1);
 assert.equal(page.counters.imports.includes('./bookings.js'),false);
});

test('Hosting restore replaces a pending controller without accepting its late completion',async()=>{
 const page=await appPage();let creates=0,destroys=0,finishFirst;
 page.modules['./hosting.js']={initHosting:()=>{const own=++creates;return{handleNavigation:()=>own===1?new Promise(resolve=>{finishFirst=resolve;}):Promise.resolve(),destroy(){destroys++;}};}};
 await page.navigate('hosting');await Promise.resolve();await Promise.resolve();
 assert.equal(creates,1);
 for(const fn of page.windowEvents.get('pagehide')||[])await fn();
 for(const fn of page.windowEvents.get('pageshow')||[])await fn({persisted:true});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(creates,2);assert.equal(destroys,1);
 finishFirst();await Promise.resolve();await page.navigate('profile');await page.navigate('hosting');
 assert.equal(creates,2,'late completion cannot replace the restored Hosting controller');
});

test('Hosting import finishing after pagehide waits for a new page lifetime',async()=>{
 const page=await appPage();let creates=0,finishImport;
 page.modules['./hosting.js']=new Promise(resolve=>{finishImport=resolve;});
 await page.navigate('hosting');
 for(const fn of page.windowEvents.get('pagehide')||[])await fn();
 finishImport({initHosting:()=>{creates++;return{handleNavigation:async()=>{},destroy(){}};}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(creates,0);
 for(const fn of page.windowEvents.get('pageshow')||[])await fn({persisted:true});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(creates,1);
});

test('Membership loads on navigation with the signed-in profile and reuses its controller',async()=>{
 const page=await appPage();let creates=0,options;const navigations=[];
 page.modules['./membership.js']={initMembership:input=>{creates++;options=input;return{handleNavigation:async value=>navigations.push(value),destroy(){}};}};
 assert.equal(page.counters.imports.includes('./membership.js'),false,'profile startup must not import plan dialogs');
 await page.navigate('membership');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(page.context.location.hash,'#membership');assert.equal(page.node('membership').hidden,false);assert.equal(creates,1);
 assert.equal(options.profile.name,page.profile.name);assert.equal(typeof options.onNavigate,'function');
 await page.navigate('profile');await page.navigate('membership');
 assert.equal(creates,1);assert.deepEqual(navigations,['membership','profile','membership']);
 assert.equal(page.counters.imports.filter(name=>name==='./membership.js').length,1);
});

test('Get verified lazily opens the player plan with its focus-return trigger',async()=>{
 const page=await appPage(),opened=[];
 page.modules['./membership.js']={initMembership:()=>({handleNavigation(){},openPlan:(plan,trigger)=>opened.push({plan,trigger}),destroy(){}})};
 assert.equal(page.counters.imports.includes('./membership.js'),false);
 await page.node('profile-get-verified').click();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(opened,[{plan:'player',trigger:page.node('profile-get-verified')}]);
 assert.equal(page.counters.imports.filter(name=>name==='./membership.js').length,1);
});

test('a delayed Get verified import cannot reopen a plan after the player navigates away',async()=>{
 const page=await appPage();let finishImport,opened=0;
 page.modules['./membership.js']=new Promise(resolve=>{finishImport=resolve;});
 const opening=page.node('profile-get-verified').click();
 await page.navigate('locker');
 finishImport({initMembership:options=>({handleNavigation(){},openPlan(){opened++;options.onNavigate('membership');},destroy(){}})});
 await opening;await new Promise(resolve=>setImmediate(resolve));
 assert.equal(opened,0);assert.equal(page.context.location.hash,'#locker');
 assert.equal(page.node('locker').hidden,false);assert.equal(page.node('membership').hidden,true);
});

test('Membership restore creates a fresh controller and discards imports from the previous page lifetime',async()=>{
 const page=await appPage();let creates=0,destroys=0,finishImport;
 const module={initMembership:()=>{creates++;return{handleNavigation:async()=>{},destroy(){destroys++;}};}};
 page.modules['./membership.js']=new Promise(resolve=>{finishImport=resolve;});
 await page.navigate('membership');
 for(const fn of page.windowEvents.get('pagehide')||[])await fn();
 finishImport(module);await new Promise(resolve=>setImmediate(resolve));assert.equal(creates,0);
 for(const fn of page.windowEvents.get('pageshow')||[])await fn({persisted:true});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(creates,1);
 for(const fn of page.windowEvents.get('pagehide')||[])await fn();
 assert.equal(destroys,1);
 for(const fn of page.windowEvents.get('pageshow')||[])await fn({persisted:true});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(creates,2);
});

test('profile startup draws one visible avatar and defers locker, setup, story and effects work',async()=>{
 const page=await appPage();
 assert.deepEqual(page.counters.avatar.map(draw=>draw.id),['hero-avatar']);
 assert.equal(page.counters.hair.length,0);assert.equal(page.counters.clothing.length,0);
 for(const module of ['story-editor.js','story-card.js','story-share.js','duo-celebration.js','matchup-preview.js'])assert.equal(page.counters.imports.some(name=>name.endsWith(module)),false,module);
 await page.stats({rating:1280,games:5,wins:3});await page.stats({rating:1280,games:5,wins:3});
 assert.equal(page.counters.avatar.length,1,'rating updates cannot redraw an unchanged outfit');
});

test('saved My rating links open the player profile that now contains the rating',async()=>{
 const page=await appPage();await page.navigate('rating');
 assert.equal(page.context.location.hash,'#profile');assert.equal(page.node('profile').hidden,false);
 assert.equal(page.document.querySelector('.nav-button[data-page="rating"]'),null);
});

test('locker keeps canvas/button nodes across polls and choices, then refreshes changed hidden avatars on navigation',async()=>{
 const page=await appPage();await page.navigate('locker');
 assert.equal(page.counters.avatar.length,2);assert.equal(page.counters.hair.length,6);assert.equal(page.counters.clothing.length,10);
 const wardrobe=page.node('wardrobe-grid'),cards=[...wardrobe.children],styles=page.node('locker-hair-options'),buttons=[...styles.children];
 assert.equal(page.node('setup-hair-options').children.length,0);
 const before=page.counters.avatar.length;await page.stats({rating:1280,games:5,wins:3});
 assert.equal(page.counters.avatar.length,before);assert.equal(page.counters.hair.length,6);assert.equal(page.counters.clothing.length,10);
 assert.deepEqual(wardrobe.children,cards);assert.deepEqual(styles.children,buttons);
 await cards[1].click();assert.equal(cards[1].attributes['aria-pressed'],'true');assert.equal(cards[0].attributes['aria-pressed'],'false');assert.equal(page.counters.clothing.length,10);
 const hairDraws=page.counters.hair.length;await buttons[1].click();
 assert.equal(buttons[1].attributes['aria-pressed'],'true');assert.equal(buttons[0].attributes['aria-pressed'],'false');assert.equal(page.counters.hair.length,hairDraws);
 assert.equal(wardrobe.children[1],cards[1]);assert.equal(styles.children[1],buttons[1]);
 const count=page.counters.avatar.length;await page.navigate('profile');assert.equal(page.counters.avatar.length,count+1);
 assert.equal(page.counters.avatar.at(-1).id,'hero-avatar');assert.equal(page.counters.avatar.at(-1).profile.capId,cards[1].dataset.itemId);assert.equal(page.counters.avatar.at(-1).profile.hairStyle,buttons[1].dataset.hairChoice);
 await page.navigate('locker');assert.equal(page.counters.avatar.length,count+1,'unchanged revisits reuse existing pixels');
});

test('height slider draws its latest value once per frame and character changes refresh the available styles',async()=>{
 const page=await appPage({avatarCreated:false});
 assert.deepEqual(page.counters.avatar.map(draw=>draw.id),['setup-avatar']);assert.equal(page.counters.clothing.length,0);
 for(const height of [172,175,181]){page.node('setup-height-range').value=height;await page.node('setup-height-range').emit('input');}
 assert.equal(page.frameCount,1);assert.equal(page.counters.avatar.length,1);page.flushFrames();
 assert.equal(page.counters.avatar.length,2);assert.equal(page.counters.avatar.at(-1).profile.height,181);
 await page.node('setup-character-options').children[1].click();
 assert.deepEqual(page.node('setup-hair-options').children.map(button=>button.dataset.hairChoice),hair.hairstylesFor('female').map(style=>style.id));
 assert.equal(page.node('setup-hair-options').children.filter(button=>button.attributes['aria-pressed']==='true').length,1);
});

test('rated totals remain correct after the compact history is removed and saves flush in the background',async()=>{
 const page=await appPage();
 for(const key of ['rating','games','wins','winrate'])page.node('test-'+key).dataset[key]='';
 await page.navigate('rating');
 await page.stats({rating:1280,games:5,wins:3});await page.stats({rating:1280,games:5,wins:3});
 assert.equal(page.node('test-rating').textContent,'1280');assert.equal(page.node('test-games').textContent,'5');assert.equal(page.node('test-wins').textContent,'3');assert.equal(page.node('test-winrate').textContent,'60%');
 page.document.hidden=true;await page.documentEvents.get('visibilitychange')();assert.equal(page.counters.flushes,1);
 for(const fn of page.windowEvents.get('pagehide')||[])await fn();assert.equal(page.counters.flushes,2);
 await page.navigate('locker');await page.node('save-look').click();assert.equal(page.counters.saves.at(-1).options.immediate,true);
 const match={teams:{a:[{id:'me',name:'Court Player',rating:1200},{id:'partner',name:'Partner',rating:1200}],b:[{id:'foe-1',name:'Rally Friend',rating:1220},{id:'foe-2',name:'Net Friend',rating:1180}]},winnerSide:'a',completedAt:'2026-10-17T08:00:00Z',deltas:[{playerId:'me',delta:30,after:1230}]};
 await page.stats({rating:1230,games:1,wins:1,history:[match]});await page.navigate('profile');
 assert.equal(page.node('test-rating').textContent,'1230');assert.equal(page.node('test-games').textContent,'1');assert.equal(page.node('test-winrate').textContent,'100%');
 assert.equal(page.nodes.has('history'),false,'the app must not reconstruct the retired compact My rating history');
});

test('story and effect modules load on demand, reuse controllers and discard delayed effects after pagehide',async()=>{
 const page=await appPage();let creates=0,opens=0,shown=0,hidden=0,finishImport;
 page.modules['./story-editor.js']={createStoryEditor:()=>{creates++;return{open:async()=>{opens++;},refresh(){}};}};
 await page.node('share-open').click();await page.node('share-open').click();
 assert.equal(creates,1);assert.equal(opens,2);assert.equal(page.counters.imports.filter(name=>name==='./story-editor.js').length,1);
 page.modules['./duo-celebration.js']=new Promise(resolve=>{finishImport=resolve;});
 page.modules['./matchup-preview.js']={createMatchupPreview:()=>({show(){shown++;},hide(){hidden++;},whenHidden:()=>Promise.resolve()})};
 const pending=page.duo({id:'me'},{id:'duo'});
 for(const fn of page.windowEvents.get('pagehide')||[])await fn();
 finishImport({createDuoCelebration:()=>({show(){shown++;},hide(){hidden++;}})});await pending;
 assert.equal(shown,0,'an event from the previous page lifetime cannot open an overlay');
 await page.opponents({id:'me'},{id:'own'},{id:'opponents'});assert.equal(shown,1);assert.ok(hidden>=2);
 assert.equal(page.counters.imports.filter(name=>name==='./duo-celebration.js').length,1);
});

test('failed optional imports can be retried without breaking page navigation',async()=>{
 const page=await appPage();
 await page.node('share-open').click();assert.equal(page.node('share-open').disabled,false);assert.match(page.node('toast').textContent,/Could not open/);
 let opened=0,shown=0;
 page.modules['./story-editor.js']={createStoryEditor:()=>({open:async()=>{opened++;},refresh(){}})};
 await page.node('share-open').click();assert.equal(opened,1);
 await assert.rejects(page.duo({id:'me'},{id:'duo'}),/Unexpected import/);
 page.modules['./duo-celebration.js']={createDuoCelebration:()=>({show(){shown++;},hide(){}})};
 page.modules['./matchup-preview.js']={createMatchupPreview:()=>({show(){},hide(){},whenHidden:()=>Promise.resolve()})};
 await page.duo({id:'me'},{id:'duo'});assert.equal(shown,1);
 await page.navigate('locker');assert.equal(page.counters.clothing.length,10);
});

test('story template selection renders one full card and refreshes only on relevant open-editor changes',async()=>{
 const page=fakePage();let profile=page.profile,stats={rating:1200,games:0,wins:0},prepares=0,shares=0;
 const storySource=(await readFile(new URL('../dist/story-editor.js',import.meta.url),'utf8'))
  .replace(/^import .* from '\.\/story-card\.js';/m,'const {STORY_TEMPLATES,drawStoryCard,storyFilename,getStoryDetails}=window.storyCard;')
  .replace(/^import .* from '\.\/story-share\.js';/m,'const {createStoryShare}=window.storyShare;')
  .replace(/^import .* from '\.\/render-cache\.js';/m,'const {createRenderCache,avatarAppearance}=window.renderCache;')
  .replace('export function createStoryEditor','window.createStoryEditor=function');
 page.window.storyCard={STORY_TEMPLATES,getStoryDetails,storyFilename,drawStoryCard:(canvas,details)=>{page.counters.story.push({canvas,details:structuredClone(details)});return canvas;}};
 page.window.storyShare={createStoryShare:()=>({prepare(){prepares++;},invalidate(){},share(){shares++;}})};page.window.renderCache=renderCache;
 vm.runInNewContext(storySource,page.context);
 const editor=page.window.createStoryEditor({getProfile:()=>profile,getStats:()=>stats,defaultName:'Player',toast(){}});
 editor.refresh();assert.equal(page.counters.story.length,0);await editor.open();assert.equal(page.counters.story.length,4);
 const templates=page.node('story-templates').children;await templates[1].click();assert.equal(page.counters.story.length,5);assert.equal(templates[1].attributes['aria-pressed'],'true');
 await templates[1].click();assert.equal(page.counters.story.length,5);
 editor.refresh();assert.equal(page.counters.story.length,5);assert.equal(prepares,2,'unchanged refresh must not encode the PNG again');
 stats={...stats,history:[{ignored:'story cards show totals only'}]};editor.refresh();assert.equal(page.counters.story.length,5);
 stats={...stats,rating:1230};editor.refresh();assert.equal(page.counters.story.length,9);
 await page.node('share-story').click();assert.equal(shares,1);assert.ok(prepares>=3);
 await page.node('story-dialog').close();profile={...profile,skin:'#704630'};editor.refresh();assert.equal(page.counters.story.length,9);
 await editor.open();assert.equal(page.counters.story.length,13);
});
