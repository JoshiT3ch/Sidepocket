import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMatchFormat,validateMatchScores} from '../dist/match-format.js';

const standard={bestOf:3,pointsToWin:11,winBy:2};

test('match settings accept every supported combination without changing the input',()=>{
 for(const bestOf of [1,3,5])for(const pointsToWin of [11,15,21])for(const winBy of [1,2]){
  const input=Object.freeze({bestOf,pointsToWin,winBy}),format=normalizeMatchFormat(input);
  assert.deepEqual(format,input);assert.notEqual(format,input);
 }
});

test('match settings require all exact numeric choices with no defaults or extra fields',()=>{
 const invalid=[undefined,null,[],3,'3',{}, {...standard,bestOf:2},{...standard,bestOf:'3'}, {...standard,bestOf:true}, {...standard,pointsToWin:10},{...standard,pointsToWin:'11'}, {...standard,winBy:3},{...standard,winBy:'2'}, {...standard,winBy:1.5},{bestOf:3,pointsToWin:11},{...standard,extra:true}];
 for(const input of invalid)assert.throws(()=>normalizeMatchFormat(input),TypeError,JSON.stringify(input));
});

test('each points target supports normal wins and win-by-two overtime on either side',()=>{
 for(const pointsToWin of [11,15,21]){
  const format={bestOf:1,pointsToWin,winBy:2};
  assert.equal(validateMatchScores(format,[{a:pointsToWin,b:0}]),'a');
  assert.equal(validateMatchScores(format,[{a:pointsToWin-2,b:pointsToWin}]),'b');
  assert.equal(validateMatchScores(format,[{a:pointsToWin+1,b:pointsToWin-1}]),'a');
  assert.equal(validateMatchScores(format,[{a:pointsToWin+3,b:pointsToWin+5}]),'b');
 }
 assert.equal(validateMatchScores({bestOf:1,pointsToWin:11,winBy:2},[{a:99,b:97}]),'a');
});

test('win-by-one games stop at their target and cannot enter overtime',()=>{
 for(const pointsToWin of [11,15,21]){
  const format={bestOf:1,pointsToWin,winBy:1};
  assert.equal(validateMatchScores(format,[{a:pointsToWin,b:pointsToWin-1}]),'a');
  assert.equal(validateMatchScores(format,[{a:0,b:pointsToWin}]),'b');
  assert.throws(()=>validateMatchScores(format,[{a:pointsToWin+1,b:pointsToWin}]),TypeError);
  assert.throws(()=>validateMatchScores(format,[{a:pointsToWin+1,b:0}]),TypeError);
 }
});

test('best-of series derive the winning duo from completed sets, stopping at the majority',()=>{
 assert.equal(validateMatchScores(standard,[{a:11,b:7},{a:10,b:12},{a:15,b:13}]),'a');
 assert.equal(validateMatchScores(standard,[{a:2,b:11},{a:9,b:11}]),'b');
 const five={bestOf:5,pointsToWin:15,winBy:2};
 assert.equal(validateMatchScores(five,[{a:15,b:3},{a:15,b:4},{a:15,b:5}]),'a');
 assert.equal(validateMatchScores(five,[{a:15,b:5},{a:4,b:15},{a:15,b:8},{a:9,b:15},{a:15,b:17}]),'b');
 const scores=Object.freeze([Object.freeze({a:11,b:7}),Object.freeze({a:11,b:8})]);
 assert.equal(validateMatchScores(Object.freeze(standard),scores),'a');assert.deepEqual(scores,[{a:11,b:7},{a:11,b:8}]);
});

test('unfinished, tied, overshot and insufficient-margin sets cannot be recorded',()=>{
 const format={bestOf:1,pointsToWin:11,winBy:2};
 for(const score of [{a:10,b:8},{a:11,b:10},{a:11,b:11},{a:12,b:8},{a:13,b:10},{a:14,b:14},{a:99,b:98}])assert.throws(()=>validateMatchScores(format,[score]),TypeError,JSON.stringify(score));
});

test('scores must be bounded integers for both sides without coercion or extra fields',()=>{
 const format={bestOf:1,pointsToWin:11,winBy:2};
 for(const score of [null,undefined,[],11,{a:11},{a:'11',b:0},{a:11,b:false},{a:11.5,b:0},{a:11,b:-1},{a:100,b:98},{a:11,b:NaN},{a:11,b:0,extra:true}])assert.throws(()=>validateMatchScores(format,[score]),TypeError);
 for(const scores of [undefined,null,{},'11-0',[]])assert.throws(()=>validateMatchScores(format,scores),TypeError);
});

test('a series rejects incomplete scores, too many sets and sets played after the match ended',()=>{
 for(const scores of [[{a:11,b:7}],[{a:11,b:7},{a:9,b:11}],[{a:11,b:7},{a:11,b:9},{a:0,b:11}],[{a:11,b:7},{a:9,b:11},{a:11,b:8},{a:0,b:11}]])assert.throws(()=>validateMatchScores(standard,scores),TypeError);
 assert.throws(()=>validateMatchScores({bestOf:5,pointsToWin:11,winBy:2},[{a:11,b:0},{a:11,b:0},{a:11,b:0},{a:0,b:11}]),TypeError);
});
