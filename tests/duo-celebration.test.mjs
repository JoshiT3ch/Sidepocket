import test from 'node:test';
import assert from 'node:assert/strict';
import {createDuoCelebration} from '../dist/duo-celebration.js';

// Time and the DOM are controlled so the three-second effect can be checked
// without wall-clock sleeps or rendering fictional avatars into the real app.
function clock(){
 let now=0,nextId=0;const timers=new Map();
 return{
  setTimeout(callback,delay){const id=++nextId;timers.set(id,{callback,at:now+delay});return id;},
  clearTimeout(id){timers.delete(id);},
  get pending(){return timers.size;},
  advance(milliseconds){
   const until=now+milliseconds;
   for(;;){const next=[...timers].filter(([,timer])=>timer.at<=until).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].callback();}
   now=until;
  }
 };
}

class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.attributes={};this.hidden=false;this.className='';this.style={};this._text='';this.offsetWidth=0;this.context={clearRect(){}};
  this.classList={add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...names])].join(' ');},remove:(...names)=>{this.className=this.className.split(/\s+/).filter(name=>!names.includes(name)).join(' ');}};
 }
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 set innerHTML(_value){throw new Error('Player names must be rendered as text.');}
 append(...children){for(const child of children){child.parentNode=this;this.children.push(child);}}
 setAttribute(name,value){this.attributes[name]=String(value);}
 getContext(kind){assert.equal(kind,'2d');return this.context;}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}
}
function descendants(node){return node.children.flatMap(child=>[child,...descendants(child)]);}
function setup(){
 const body=new Element('body'),documentElement=new Element('html'),document={body,documentElement,createElement:tag=>new Element(tag)},timer=clock(),draws=[];
 const effect=createDuoCelebration({document,setTimeout:timer.setTimeout,clearTimeout:timer.clearTimeout,drawAvatar:(...args)=>draws.push(args)});
 return{body,timer,draws,effect,scrollLocked:()=>documentElement.className.split(/\s+/).includes('sideout-duo-celebrating'),find:className=>descendants(body).find(node=>node.className.split(/\s+/).includes(className)),findAll:className=>descendants(body).filter(node=>node.className.split(/\s+/).includes(className))};
}
const mine={id:'me',code:'SO-012345ABCDEF',name:'My Player',avatar:{gender:'male',height:188,bodyType:'athletic',hairStyle:'spiky',hat:0,shirt:4,shorts:2,hairColor:'#332211'}};
const partner={id:'partner',code:'SO-111111111111',name:'Court Friend',avatar:{gender:'female',height:164,bodyType:'slim',hairStyle:'long',hat:3,shirt:7,pants:6,hairColor:'#221133'}};
const duo={id:'duo-1',players:[partner,mine]};

test('the duo popup renders the current player then their partner with both saved outfits and safe names',()=>{
 const {effect,draws,find,findAll,timer}=setup();
 const unsafeName='<img src=x onerror=alert(1)> & Court Friend',namedPartner={...partner,name:unsafeName};
 const original=structuredClone({mine,partner:namedPartner});
 assert.equal(effect.show(mine,{...duo,players:[namedPartner,mine]}),true);
 const overlay=find('duo-celebration'),title=find('duo-celebration-title');
 assert.equal(overlay.hidden,false);assert.equal(overlay.attributes.role,'status');assert.equal(overlay.attributes['aria-live'],'polite');assert.equal(overlay.attributes['aria-atomic'],'true');
 assert.equal(title.textContent,`Duo with ${unsafeName}`);
 assert.equal(findAll('duo-celebration-avatar').length,2);
 assert.equal(draws.length,2);
 assert.deepEqual(draws.map(args=>args.at(-1)),[{...mine.avatar,name:mine.name},{...partner.avatar,name:unsafeName}]);
 assert.deepEqual({mine,partner:namedPartner},original,'rendering must not change either saved player profile');
 assert.equal(timer.pending,1);
 effect.destroy();
});

test('the popup remains visible for 2999 milliseconds and hides at exactly three seconds',()=>{
 const {effect,timer,find,scrollLocked}=setup();assert.equal(scrollLocked(),false);effect.show(mine,duo);assert.equal(scrollLocked(),true);
 const overlay=find('duo-celebration');
 timer.advance(2999);assert.equal(overlay.hidden,false);assert.equal(timer.pending,1);assert.equal(scrollLocked(),true);
 timer.advance(1);assert.equal(overlay.hidden,true);assert.equal(timer.pending,0);assert.equal(scrollLocked(),false);
 timer.advance(5000);assert.equal(overlay.hidden,true);
 effect.destroy();
});

test('a new duo replaces the old names and avatars and restarts the full three-second lifetime',()=>{
 const {effect,timer,find,findAll,draws,scrollLocked}=setup();effect.show(mine,duo);timer.advance(2500);
 const nextPartner={...partner,id:'next',code:'SO-222222222222',name:'Next Teammate',avatar:{...partner.avatar,shirt:9}};
 assert.equal(effect.show(mine,{id:'duo-2',players:[mine,nextPartner]}),true);
 assert.equal(findAll('duo-celebration').length,1,'replacement must reuse the transient overlay');
 assert.equal(find('duo-celebration-title').textContent,'Duo with Next Teammate');
 assert.deepEqual(draws.at(-1).at(-1),{...nextPartner.avatar,name:nextPartner.name});
 assert.equal(timer.pending,1,'the superseded hide timer must be cancelled');
 assert.equal(scrollLocked(),true,'replaying must keep the temporary scrolling lock active');
 timer.advance(500);assert.equal(find('duo-celebration').hidden,false,'the old deadline must not hide the new pairing');assert.equal(scrollLocked(),true);
 timer.advance(2499);assert.equal(find('duo-celebration').hidden,false);
 timer.advance(1);assert.equal(find('duo-celebration').hidden,true);assert.equal(scrollLocked(),false);
 effect.destroy();
});

test('hide cancels the timer, replay can start again, and destroy removes the overlay permanently',()=>{
 const {effect,timer,find,body,scrollLocked}=setup();effect.show(mine,duo);const overlay=find('duo-celebration');assert.equal(scrollLocked(),true);
 timer.advance(200);effect.hide();assert.equal(overlay.hidden,true);assert.equal(timer.pending,0);assert.equal(scrollLocked(),false);
 assert.equal(effect.show(mine,duo),true);assert.equal(overlay.hidden,false);assert.equal(timer.pending,1);assert.equal(scrollLocked(),true);
 effect.destroy();assert.equal(body.children.length,0);assert.equal(timer.pending,0);assert.equal(scrollLocked(),false);
 timer.advance(10000);assert.equal(effect.show(mine,duo),false);assert.equal(body.children.length,0);
 effect.hide();effect.destroy();assert.equal(timer.pending,0);
});

test('missing, incomplete or unrelated player data never displays a false pairing',()=>{
 for(const [player,team]of [[null,duo],[mine,null],[mine,{players:[]}],[mine,{players:[mine]}],[mine,{players:[partner,{...partner,id:'someone-else',code:'SO-333333333333'}]}],[{name:'No identity'},{players:[{name:'No identity'},partner]}]]){
  const {effect,timer,body,draws}=setup();
  assert.equal(effect.show(player,team),false);assert.equal(body.children.length,0);assert.equal(timer.pending,0);assert.equal(draws.length,0);effect.destroy();
 }
});
