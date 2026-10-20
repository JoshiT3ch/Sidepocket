import {test} from 'node:test';
import assert from 'node:assert/strict';
import {teamAverage,winAward,ratingPreview,matchDeltas} from '../rating.mjs';

test('doubles ratings use both partners and reward an upset more than an expected win',()=>{
 assert.equal(teamAverage([1400,1000]),1200);
 assert.equal(teamAverage([{rating:1700},{rating:1500}]),1600);
 assert.equal(winAward(1200,1200),30);
 assert.equal(winAward(1600,1200),20);
 assert.equal(winAward(1200,1600),40);
 assert.equal(winAward(5000,100),20);
 assert.equal(winAward(100,5000),40);
 assert.deepEqual(ratingPreview({a:[{rating:1700},{rating:1500}],b:[{rating:1000},{rating:1400}]}),{a:20,b:40});
 for(let difference=-3000;difference<=3000;difference+=50){const award=winAward(3500+difference,3500);assert.ok(award>=20&&award<=40);}
});

test('a 100 MMR gap reaches the 20/40 bounds and smaller gaps scale from 30',()=>{
 for(const [opponent,award]of [[100,20],[1100,20],[1125,23],[1150,25],[1175,28],[1200,30],[1225,33],[1250,35],[1275,38],[1300,40],[5000,40]])assert.equal(winAward(1200,opponent),award,`1200 beating ${opponent}`);
 for(let gap=-100;gap<=100;gap++)assert.ok(winAward(1200,1200+gap)<=winAward(1200,1201+gap),'a stronger opponent never lowers the win award');
 assert.equal(winAward(1200,1300),winAward(2200,2300),'only the gap changes the award');
});

test('both players determine each average before rounding the final positive award',()=>{
 assert.deepEqual(ratingPreview({a:[{rating:1100},{rating:1300}],b:[{rating:1250},{rating:1350}]}),{a:40,b:20});
 // A 4.5-point gap earns 30, but rounding team averages first would incorrectly earn 31.
 assert.deepEqual(ratingPreview({a:[1200,1200],b:[1204,1205]}),{a:30,b:30});
 assert.deepEqual(ratingPreview({a:[1200,1200],b:[1205,1205]}),{a:31,b:30});
 assert.deepEqual(ratingPreview({a:[1200,1201],b:[1299,1300]}),{a:40,b:20});
});

test('one result awards 20–40 to both teammates with a rating floor and no 5000 ceiling',()=>{
 const teams={a:[{id:'a',rating:1700},{id:'b',rating:1500}],b:[{id:'c',rating:1000},{id:'d',rating:1400}]};
 assert.deepEqual(matchDeltas(teams,'b'),[
  {playerId:'a',before:1700,after:1660,delta:-40},{playerId:'b',before:1500,after:1460,delta:-40},
  {playerId:'c',before:1000,after:1040,delta:40},{playerId:'d',before:1400,after:1440,delta:40}
 ]);
 const extremes={a:[{id:'a',rating:5000},{id:'b',rating:4999}],b:[{id:'c',rating:100},{id:'d',rating:101}]};
 assert.deepEqual(matchDeltas(extremes,'a').map(player=>player.after),[5020,5019,100,100]);
 assert.throws(()=>teamAverage([1200]),TypeError);
 assert.throws(()=>teamAverage([1200,NaN]),TypeError);
 assert.throws(()=>winAward(1200,Infinity),TypeError);
 assert.throws(()=>matchDeltas(teams,'c'),TypeError);
});
