import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HAIRSTYLES,HAIR_COLORS,hairstylesFor,normalizeHair,hairError} from '../dist/hairstyles.js';

test('hair choices are distinct and each catalog combination is accepted',()=>{
 assert.equal(HAIRSTYLES.length,10);
 assert.equal(HAIR_COLORS.length,6);
 assert.equal(new Set(HAIRSTYLES.map(item=>item.id)).size,10);
 assert.equal(new Set(HAIR_COLORS.map(item=>item.color)).size,6);
 for(const {id,characterType} of HAIRSTYLES)for(const {color} of HAIR_COLORS){
  const profile={characterType,hairStyle:id,hairColor:color};
  assert.equal(hairError(profile),null);
  assert.deepEqual(normalizeHair(profile),{hairStyle:id,hairColor:color});
 }
});

test('male and female hairstyle groups are complete and disjoint',()=>{
 const male=hairstylesFor('male');const female=hairstylesFor('female');
 assert.deepEqual(male.map(item=>item.id),['short','buzz','side-part','spiky','curly','afro']);
 assert.deepEqual(female.map(item=>item.id),['bob','long','ponytail','bun']);
 assert.equal(male.length+female.length,HAIRSTYLES.length);
 assert.ok(male.every(item=>item.characterType==='male'));
 assert.ok(female.every(item=>item.characterType==='female'));
 for(const style of male)assert.notEqual(hairError({characterType:'female',hairStyle:style.id,hairColor:'#43352f'}),null);
 for(const style of female)assert.notEqual(hairError({characterType:'male',hairStyle:style.id,hairColor:'#43352f'}),null);
});

test('legacy hair normalization keeps valid choices and supplies safe defaults',()=>{
 assert.deepEqual(normalizeHair({}),{hairStyle:'short',hairColor:'#43352f'});
 assert.deepEqual(normalizeHair({characterType:'female'}),{hairStyle:'ponytail',hairColor:'#43352f'});
 assert.deepEqual(normalizeHair({characterType:'female',hairStyle:'bun',hairColor:'#292727'}),{hairStyle:'bun',hairColor:'#292727'});
 assert.deepEqual(normalizeHair({characterType:'female',hairStyle:'buzz',hairColor:'#292727'}),{hairStyle:'ponytail',hairColor:'#292727'});
 assert.deepEqual(normalizeHair({characterType:'male',hairStyle:'bob',hairColor:'#b7b8ba'}),{hairStyle:'short',hairColor:'#b7b8ba'});
 assert.deepEqual(normalizeHair({characterType:'female',hairStyle:'unavailable',hairColor:'bad'}),{hairStyle:'ponytail',hairColor:'#43352f'});
});
