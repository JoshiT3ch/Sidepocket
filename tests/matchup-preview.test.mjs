import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchupPreview} from '../dist/matchup-preview.js';

function clock(){
 let now=0,nextId=0;const timers=new Map();
 return{
  setTimeout(callback,delay){const id=++nextId;timers.set(id,{callback,at:now+delay});return id;},
  clearTimeout(id){timers.delete(id);},
  get pending(){return timers.size;},
  advance(milliseconds){const until=now+milliseconds;for(;;){const next=[...timers].filter(([,timer])=>timer.at<=until).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].callback();}now=until;}
 };
}
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.attributes={};this.hidden=false;this.className='';this._text='';this.offsetWidth=0;this.context={clearRect(){}};
  this.classList={add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...names])].join(' ');},remove:(...names)=>{this.className=this.className.split(/\s+/).filter(name=>!names.includes(name)).join(' ');}};
 }
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 set innerHTML(_value){throw new Error('Names must be rendered as text.');}
 append(...children){for(const child of children){child.parentNode=this;this.children.push(child);}}
 setAttribute(name,value){this.attributes[name]=String(value);}
 getContext(kind){assert.equal(kind,'2d');return this.context;}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}
}
const descendants=node=>node.children.flatMap(child=>[child,...descendants(child)]);
function setup({drawAvatar,createElement}={}){
 const body=new Element('body'),documentElement=new Element('html'),document={body,documentElement,createElement:createElement||(tag=>new Element(tag))},timer=clock(),draws=[];
 const effect=createMatchupPreview({document,setTimeout:timer.setTimeout,clearTimeout:timer.clearTimeout,drawAvatar:drawAvatar||((...args)=>draws.push(args))});
 return{effect,timer,body,draws,scrollLocked:()=>documentElement.className.split(/\s+/).includes('sideout-matchup-previewing'),find:className=>descendants(body).find(node=>node.className.split(/\s+/).includes(className)),findAll:className=>descendants(body).filter(node=>node.className.split(/\s+/).includes(className))};
}
const mine={id:'me',code:'SO-012345ABCDEF',name:'My Player',rating:1241,avatar:{gender:'male',height:188,bodyType:'athletic',hairStyle:'spiky',hat:0,shirt:4,shorts:2,hairColor:'#332211'}};
const teammate={id:'teammate',code:'SO-111111111111',name:'Court Friend',rating:1350,avatar:{gender:'female',height:164,bodyType:'slim',hairStyle:'long',hat:3,shirt:7,pants:6,hairColor:'#221133'}};
const opponent1={id:'opponent-1',code:'SO-222222222222',name:'Net Runner',rating:1479,avatar:{gender:'female',height:170,bodyType:'regular',hairStyle:'longWaves',hat:1,shirt:2,shorts:8}};
const opponent2={id:'opponent-2',code:'SO-333333333333',name:'Kitchen King',rating:1200,avatar:{gender:'male',height:180,bodyType:'regular',hairStyle:'buzz',hat:9,shirt:6,pants:4}};
const own={id:'own-duo',players:[teammate,mine]},opposing={id:'opposing-duo',players:[opponent1,opponent2]};

test('the red 2v2 introduction renders four saved avatars, safe names, individual MMR and rounded team averages',()=>{
 const {effect,draws,find,findAll,timer}=setup();
 const unsafe='<img src=x onerror=alert(1)> & Net Runner',namedOpponent={...opponent1,name:unsafe},enemy={...opposing,players:[namedOpponent,opponent2]};
 const original=structuredClone({mine,own,enemy});
 assert.equal(effect.show(mine,own,enemy),true);
 const overlay=find('matchup-preview');assert.equal(overlay.hidden,false);assert.equal(overlay.attributes.role,'status');assert.equal(overlay.attributes['aria-live'],'polite');assert.equal(overlay.attributes['aria-atomic'],'true');
 assert.equal(find('matchup-preview-title').textContent,'2v2');assert.equal(find('matchup-preview-versus').textContent,'VS');
 assert.deepEqual(findAll('matchup-preview-name').map(node=>node.textContent),[mine.name,teammate.name,unsafe,opponent2.name]);
 assert.deepEqual(findAll('matchup-preview-rating').map(node=>node.textContent),['1241 MMR','1350 MMR','1479 MMR','1200 MMR']);
 assert.deepEqual(findAll('matchup-preview-team-average').map(node=>node.textContent),['1296 AVG. MMR','1340 AVG. MMR']);
 assert.deepEqual(findAll('matchup-preview-team-label').map(node=>node.textContent),['YOUR DUO','OPPONENT DUO']);
 assert.equal(findAll('matchup-preview-avatar').length,4);assert.equal(draws.length,4);
 assert.deepEqual(draws.map(args=>args.at(-1)),[mine,teammate,namedOpponent,opponent2].map(member=>({...member.avatar,name:member.name})));
 assert.deepEqual({mine,own,enemy},original,'rendering must not modify saved profiles or roster order');assert.equal(timer.pending,1);effect.destroy();
});

test('current player can be identified by their public code and is always first on their team',()=>{
 const {effect,findAll}=setup();assert.equal(effect.show({code:mine.code},own,opposing),true);
 assert.deepEqual(findAll('matchup-preview-name').slice(0,2).map(node=>node.textContent),[mine.name,teammate.name]);effect.destroy();
});

test('the red effect locks scrolling until exactly 3000 milliseconds',()=>{
 const {effect,timer,find,scrollLocked}=setup();assert.equal(scrollLocked(),false);effect.show(mine,own,opposing);assert.equal(scrollLocked(),true);
 const overlay=find('matchup-preview');timer.advance(2999);assert.equal(overlay.hidden,false);assert.equal(timer.pending,1);assert.equal(scrollLocked(),true);
 timer.advance(1);assert.equal(overlay.hidden,true);assert.equal(timer.pending,0);assert.equal(scrollLocked(),false);timer.advance(5000);assert.equal(overlay.hidden,true);effect.destroy();
});

test('replacing an opponent reuses the overlay and resets the full lifetime without a stale timer',()=>{
 const {effect,timer,find,findAll,scrollLocked}=setup();effect.show(mine,own,opposing);timer.advance(2500);
 const nextOpponent={...opponent1,id:'next',code:'SO-444444444444',name:'Next Challenger',rating:1520};
 assert.equal(effect.show(mine,own,{players:[nextOpponent,opponent2]}),true);assert.equal(findAll('matchup-preview').length,1);assert.equal(timer.pending,1);assert.equal(scrollLocked(),true);
 assert.equal(findAll('matchup-preview-name')[2].textContent,'Next Challenger');assert.equal(findAll('matchup-preview-team-average')[1].textContent,'1360 AVG. MMR');
 timer.advance(500);assert.equal(find('matchup-preview').hidden,false,'the first timer must not hide the replacement');timer.advance(2499);assert.equal(find('matchup-preview').hidden,false);timer.advance(1);assert.equal(find('matchup-preview').hidden,true);assert.equal(scrollLocked(),false);effect.destroy();
});

test('hide and destroy cancel timers and remove the temporary scrolling lock',()=>{
 const {effect,timer,find,body,scrollLocked}=setup();effect.show(mine,own,opposing);const overlay=find('matchup-preview');timer.advance(100);effect.hide();
 assert.equal(overlay.hidden,true);assert.equal(timer.pending,0);assert.equal(scrollLocked(),false);assert.equal(effect.show(mine,own,opposing),true);assert.equal(scrollLocked(),true);
 effect.destroy();assert.equal(body.children.length,0);assert.equal(timer.pending,0);assert.equal(scrollLocked(),false);timer.advance(10000);assert.equal(effect.show(mine,own,opposing),false);effect.hide();effect.destroy();assert.equal(body.children.length,0);
});

test('incomplete, duplicate, unrelated or invalid-rating rosters cannot introduce a false 2v2',()=>{
 const invalid=[
  [null,own,opposing],[mine,null,opposing],[mine,own,null],[mine,{players:[]},opposing],[mine,{players:[mine]},opposing],[mine,own,{players:[opponent1]}],
  [mine,{players:[mine,mine]},opposing],[mine,own,{players:[opponent1,opponent1]}],[mine,own,{players:[opponent1,{...opponent2,id:mine.id}]}],
  [mine,own,{players:[opponent1,{...opponent2,code:teammate.code}]}],[mine,{players:[teammate,opponent1]},{players:[opponent2,{...mine,id:'someone',code:'SO-555555555555'}]}],
  [{name:'Missing identity'},own,opposing],[mine,own,{players:[{name:'Unknown',rating:1200},opponent2]}],
  [mine,own,{players:[{...opponent1,rating:NaN},opponent2]}],[mine,own,{players:[{...opponent1,rating:Infinity},opponent2]}],[mine,own,{players:[{...opponent1,rating:-1},opponent2]}],
  [mine,own,{players:[{...opponent1,rating:null},opponent2]}],[mine,own,{players:[{...opponent1,rating:''},opponent2]}],
  [mine,own,{players:[{...opponent1,rating:'   '},opponent2]}],[mine,own,{players:[{...opponent1,rating:false},opponent2]}],
  [{id:mine.id,code:teammate.code},own,opposing]
 ];
 for(const args of invalid){const {effect,body,timer,draws,scrollLocked}=setup();assert.equal(effect.show(...args),false);assert.equal(body.children.length,0);assert.equal(timer.pending,0);assert.equal(draws.length,0);assert.equal(scrollLocked(),false);effect.destroy();}
});

test('an invalid replacement leaves the valid introduction and its original deadline intact',()=>{
 const {effect,timer,find,scrollLocked}=setup();effect.show(mine,own,opposing);timer.advance(1000);assert.equal(effect.show(mine,own,{players:[opponent1]}),false);
 assert.equal(find('matchup-preview').hidden,false);assert.equal(timer.pending,1);assert.equal(scrollLocked(),true);timer.advance(2000);assert.equal(find('matchup-preview').hidden,true);assert.equal(scrollLocked(),false);effect.destroy();
});

test('avatar draw and missing canvas contexts do not prevent names, MMR or three-second cleanup',()=>{
 let calls=0;
 const {effect,timer,find,findAll,scrollLocked}=setup({createElement:tag=>{const node=new Element(tag);if(tag==='canvas'&&++calls===2)node.context=null;return node;},drawAvatar:()=>{throw new Error('bad avatar');}});
 assert.equal(effect.show(mine,own,opposing),true);assert.equal(find('matchup-preview').hidden,false);assert.equal(findAll('matchup-preview-avatar').every(canvas=>canvas.hidden),true);
 assert.deepEqual(findAll('matchup-preview-name').map(node=>node.textContent),[mine.name,teammate.name,opponent1.name,opponent2.name]);assert.equal(findAll('matchup-preview-rating').length,4);assert.equal(scrollLocked(),true);
 timer.advance(3000);assert.equal(find('matchup-preview').hidden,true);assert.equal(timer.pending,0);assert.equal(scrollLocked(),false);effect.destroy();
});

test('a browser canvas exception is contained and the next opponent can draw again',()=>{
 let canvases=0;
 const {effect,timer,findAll,draws}=setup({createElement:tag=>{const node=new Element(tag);if(tag==='canvas'&&++canvases===1){let first=true;node.getContext=()=>{if(first){first=false;throw new Error('unavailable');}return node.context;};}return node;}});
 assert.equal(effect.show(mine,own,opposing),true);assert.equal(findAll('matchup-preview-avatar')[0].hidden,true);assert.equal(draws.length,3);
 assert.equal(effect.show(mine,own,opposing),true);assert.equal(findAll('matchup-preview-avatar')[0].hidden,false);assert.equal(draws.length,7);assert.equal(timer.pending,1);effect.destroy();
});
