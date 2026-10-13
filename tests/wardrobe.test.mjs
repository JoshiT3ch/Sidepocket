import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WARDROBE,DEFAULT_EQUIPMENT,getItem,equipmentError} from '../dist/wardrobe.js';

test('the requested wardrobe contains 10 distinct pieces in each category',()=>{
 const ids=new Set();for(const [category,items]of Object.entries(WARDROBE)){assert.equal(items.length,10,category);assert.equal(items.filter(item=>item.brand==='Nike').length,5);assert.equal(items.filter(item=>item.brand==='Adidas').length,5);for(const item of items){assert.ok(!ids.has(item.id),'Duplicate ID '+item.id);ids.add(item.id);assert.equal(getItem(item.id).category,category);}}
 assert.equal(ids.size,40);
});
test('outfit category validation prevents equipping an item in the wrong slot',()=>{
 assert.equal(equipmentError(DEFAULT_EQUIPMENT),null);
 assert.ok(equipmentError({...DEFAULT_EQUIPMENT,capId:WARDROBE.shirts[0].id}));
 assert.ok(equipmentError({...DEFAULT_EQUIPMENT,shirtId:WARDROBE.caps[0].id}));
 assert.ok(equipmentError({...DEFAULT_EQUIPMENT,bottomId:WARDROBE.caps[0].id}));
 assert.ok(equipmentError({...DEFAULT_EQUIPMENT,bottomId:'unknown-item'}));
});
