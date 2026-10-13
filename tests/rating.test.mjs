import {test} from 'node:test';
import assert from 'node:assert/strict';
import {teamAverage,winAward,ratingPreview,matchDeltas} from '../rating.mjs';

test('doubles ratings use both partners and reward an upset more than an expected win',()=>{
 assert.equal(teamAverage([1400,1000]),1200);
 assert.equal(teamAverage([{rating:1700},{rating:1500}]),1600);
 assert.equal(winAward(1200,1200),30);
 assert.equal(winAward(1600,1200),22);
 assert.equal(winAward(1200,1600),38);
 assert.equal(winAward(5000,100),20);
 assert.equal(winAward(100,5000),40);
 assert.deepEqual(ratingPreview({a:[{rating:1700},{rating:1500}],b:[{rating:1000},{rating:1400}]}),{a:22,b:38});
 for(let difference=-3000;difference<=3000;difference+=50){const award=winAward(3500+difference,3500);assert.ok(award>=20&&award<=40);}
});

test('one result awards 20–40 to both teammates with a rating floor and no 5000 ceiling',()=>{
 const teams={a:[{id:'a',rating:1700},{id:'b',rating:1500}],b:[{id:'c',rating:1000},{id:'d',rating:1400}]};
 assert.deepEqual(matchDeltas(teams,'b'),[
  {playerId:'a',before:1700,after:1662,delta:-38},{playerId:'b',before:1500,after:1462,delta:-38},
  {playerId:'c',before:1000,after:1038,delta:38},{playerId:'d',before:1400,after:1438,delta:38}
 ]);
 const extremes={a:[{id:'a',rating:5000},{id:'b',rating:4999}],b:[{id:'c',rating:100},{id:'d',rating:101}]};
 assert.deepEqual(matchDeltas(extremes,'a').map(player=>player.after),[5020,5019,100,100]);
 assert.throws(()=>teamAverage([1200]),TypeError);
 assert.throws(()=>teamAverage([1200,NaN]),TypeError);
 assert.throws(()=>winAward(1200,Infinity),TypeError);
 assert.throws(()=>matchDeltas(teams,'c'),TypeError);
});
