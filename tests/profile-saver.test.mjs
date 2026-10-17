import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfileSaver} from '../dist/profile-saver.js';

function fixture(saveProfile) {
  const timers=new Map(),writes=[],errors=[];
  let id=0;
  const saver=createProfileSaver({
    saveProfile:saveProfile||(async profile=>{writes.push(profile);}),
    onError:error=>errors.push(error),
    setTimeout:callback=>{timers.set(++id,callback);return id;},
    clearTimeout:key=>timers.delete(key)
  });
  return {saver,writes,errors,timers,async tick(){for(const [id,callback]of [...timers]){timers.delete(id);callback();}await new Promise(resolve=>setImmediate(resolve));}};
}
test('typing 20 quick edits writes only the latest immutable profile snapshot', async () => {
  const f=fixture(),results=[];
  const profile={name:'',avatar:{hair:'black'}};
  for(let i=0;i<20;i++){profile.name='Player '+i;results.push(f.saver.save(profile));}
  profile.name='unsaved mutation';profile.avatar.hair='unsaved mutation';
  assert.equal(f.writes.length,0);
  assert.equal(f.timers.size,1);
  await f.tick();
  assert.equal(f.writes.length,1);
  assert.deepEqual(f.writes[0],{name:'Player 19',avatar:{hair:'black'}});
  assert.ok((await Promise.all(results)).every(Boolean));
});
test('flush saves pending edits immediately and waits before allowing logout', async () => {
  const f=fixture();
  const save=f.saver.save({name:'Court Player'});
  assert.equal(await f.saver.flush(),true);
  assert.equal(await save,true);
  assert.equal(f.timers.size,0);
  assert.deepEqual(f.writes,[{name:'Court Player'}]);
});
test('edits during a slow save are serialized and only the latest next state is written', async () => {
  const writes=[],releases=[];
  const f=fixture(profile=>new Promise(resolve=>{writes.push(profile);releases.push(resolve);}));
  const first=f.saver.save({name:'First'},{immediate:true});
  await Promise.resolve();
  const second=f.saver.save({name:'Second'});
  const latest=f.saver.save({name:'Latest'});
  let finished=false;
  const flush=f.saver.flush().then(result=>{finished=true;return result;});
  await Promise.resolve();assert.equal(writes.length,1);assert.equal(finished,false);
  releases.shift()();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(writes,[{name:'First'},{name:'Latest'}]);
  assert.equal(finished,false);
  releases.shift()();
  assert.equal(await flush,true);
  assert.deepEqual(await Promise.all([first,second,latest]),[true,true,true]);
});
test('a failed save blocks flush until an explicit retry succeeds', async () => {
  let fail=true;
  const f=fixture(async()=>{if(fail)throw new Error('offline');});
  const save=f.saver.save({name:'Player'});
  assert.equal(await f.saver.flush(),false);
  assert.equal(await save,false);
  assert.equal(f.errors.length,1);
  assert.equal(await f.saver.flush(),false);
  fail=false;
  const retry=f.saver.save({name:'Player'},{immediate:true});
  assert.equal(await retry,true);
  assert.equal(await f.saver.flush(),true);
});
