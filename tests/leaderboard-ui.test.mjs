import test from 'node:test';
import assert from 'node:assert/strict';
import {initLeaderboard} from '../dist/leaderboard.js';

// A small DOM contract double keeps these interaction tests independent of a browser.
class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.listeners={};this.hidden=false;this.disabled=false;this._text='';this.className='';this.classList={toggle:(value,on)=>{const classes=new Set(this.className.split(' ').filter(Boolean));if(on)classes.add(value);else classes.delete(value);this.className=[...classes].join(' ');}};}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this._text='';this.children=[...children];}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(key,listener){this.listeners[key]=listener;}
  get firstElementChild(){return this.children[0];}
  get lastElementChild(){return this.children.at(-1);}
  getContext(){throw new Error('Canvas rendering is verified separately in the browser.');}
  click(){return this.listeners.click?.();}
}
const ids=['leaderboard','refresh-leaderboard','retry-leaderboard','leader-notice','leader-own-person','leader-own-rank','leader-own-note','leader-total','leader-total-label','leader-overview','leader-rows','leader-empty','leader-table-wrap','leader-list-note','leader-error','leader-error-message','leader-first-game','leader-rating-rules'];
const player=(id,changes={})=>({id,code:`SO-${id.padStart(12,'0')}`,name:`Court ${id}`,rating:1200,games:1,wins:1,avatar:{avatarCreated:true},...changes});
const board=(entries=[],me={rank:null,player:player('me',{games:0,wins:0})},rankedPlayers=entries.length)=>({entries,me,rankedPlayers,limit:100});
async function withDom(run){const previous=globalThis.document;const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));globalThis.document={createElement:tag=>new Element(tag),getElementById:id=>nodes[id]};try{await run(nodes);}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}}

test('leaderboard shows an honest unranked profile and empty board before a first game',()=>withDom(async nodes=>{
  const routes=[],calls=[];const controller=initLeaderboard({request:async path=>{calls.push(path);return board();},onNavigate:page=>routes.push(page)});
  await controller.refresh();
  assert.deepEqual(calls,['/api/leaderboard']);assert.equal(nodes['leader-empty'].hidden,false);assert.equal(nodes['leader-table-wrap'].hidden,true);
  assert.equal(nodes['leader-own-rank'].textContent,'Unranked');assert.equal(nodes['leader-total'].textContent,'0');assert.equal(nodes['leader-rows'].children.length,0);
  nodes['leader-first-game'].click();nodes['leader-rating-rules'].click();assert.deepEqual(routes,['play','rating']);
}));

test('leaderboard preserves shared ranks and shows an own row omitted by the tied cutoff',()=>withDom(async nodes=>{
  const top=player('top',{rating:1500,games:8,wins:6}),mine=player('mine',{name:'<img src=x onerror=alert(1)>',rating:1250,games:4,wins:3,email:'private@example.invalid'});
  const controller=initLeaderboard({request:async()=>board([{rank:1,player:top}],{rank:99,player:mine},101)});await controller.refresh();
  const rows=nodes['leader-rows'].children;assert.equal(rows.length,3);assert.equal(rows[0].firstElementChild.textContent,'#1');assert.equal(rows[2].firstElementChild.textContent,'#99');
  assert.equal(rows[2].className,'leader-row leader-row-mine');assert.equal(rows[2].children[1].textContent,'<img src=x onerror=alert(1)>You');assert.equal(rows[2].children[5].textContent,'75%');
  assert.equal(nodes['leader-own-rank'].textContent,'#99');assert.match(nodes['leader-list-note'].textContent,/Your position is included below/);
  assert.ok(!Object.values(nodes).map(node=>node.textContent).join('').includes('private@example.invalid'));
}));

test('leaderboard keeps own row once when already visible and shares equal-rating ranks',()=>withDom(async nodes=>{
  const mine=player('mine'),other=player('other');const controller=initLeaderboard({request:async()=>board([{rank:1,player:other},{rank:1,player:mine}],{rank:1,player:mine})});await controller.refresh();
  assert.equal(nodes['leader-rows'].children.length,2);assert.deepEqual(nodes['leader-rows'].children.map(row=>row.firstElementChild.textContent),['#1','#1']);
  assert.equal(nodes['leader-rows'].children[0].className,'leader-row');assert.equal(nodes['leader-rows'].children[1].className,'leader-row leader-row-mine');
}));

test('leaderboard deduplicates in-flight requests, retries failures and refreshes current data',()=>withDom(async nodes=>{
  let calls=0,release;const request=()=>{calls++;if(calls===1)return new Promise(resolve=>{release=resolve;});if(calls===2)throw new Error('Network down');return Promise.resolve(board([{rank:1,player:player('fresh',{rating:1240})}],{rank:null,player:player('me',{games:0,wins:0})}));};
  const controller=initLeaderboard({request});const first=controller.refresh();assert.equal(controller.refresh(),first);assert.equal(nodes.leaderboard.attributes['aria-busy'],'true');assert.equal(nodes['refresh-leaderboard'].disabled,true);
  await Promise.resolve();release(board());await first;assert.equal(calls,1);
  await nodes['refresh-leaderboard'].click();assert.equal(nodes['leader-error'].hidden,false);assert.equal(nodes['leader-overview'].hidden,true);assert.equal(nodes['retry-leaderboard'].disabled,false);assert.equal(nodes.leaderboard.attributes['aria-busy'],'false');
  await nodes['retry-leaderboard'].click();assert.equal(calls,3);assert.equal(nodes['leader-error'].hidden,true);assert.equal(nodes['leader-table-wrap'].hidden,false);assert.equal(nodes['leader-rows'].children[0].children[2].textContent,'1,240');
}));
