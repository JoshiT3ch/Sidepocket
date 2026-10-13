import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HAIRSTYLES,HAIR_COLORS,normalizeHair,hairError} from '../dist/hairstyles.js';

test('hair choices are distinct and each catalog combination is accepted',()=>{
 assert.equal(HAIRSTYLES.length,10);
 assert.equal(HAIR_COLORS.length,6);
 assert.equal(new Set(HAIRSTYLES.map(item=>item.id)).size,10);
 assert.equal(new Set(HAIR_COLORS.map(item=>item.color)).size,6);
 for(const {id} of HAIRSTYLES)for(const {color} of HAIR_COLORS){
  const profile={hairStyle:id,hairColor:color};
  assert.equal(hairError(profile),null);
  assert.deepEqual(normalizeHair(profile),profile);
 }
});

test('legacy hair normalization keeps valid choices and supplies safe defaults',()=>{
 assert.deepEqual(normalizeHair({}),{hairStyle:'short',hairColor:'#43352f'});
 assert.deepEqual(normalizeHair({characterType:'female'}),{hairStyle:'ponytail',hairColor:'#43352f'});
 assert.deepEqual(normalizeHair({characterType:'female',hairStyle:'buzz',hairColor:'#292727'}),{hairStyle:'buzz',hairColor:'#292727'});
 assert.deepEqual(normalizeHair({characterType:'female',hairStyle:'unavailable',hairColor:'bad'}),{hairStyle:'ponytail',hairColor:'#43352f'});
});
