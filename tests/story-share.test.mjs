import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoryShare} from '../dist/story-share.js';

const png=()=>new Blob(['fictional story PNG'],{type:'image/png'});
const canvas={toBlob(callback,type){assert.equal(type,'image/png');callback(png());}};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const nativeError=name=>Object.assign(new Error(name),{name});

test('share invokes the native sheet synchronously with only the prepared PNG file',async()=>{
  let payload,invoked=false;
  const states=[];
  const helper=createStoryShare({navigator:{canShare:value=>value.files[0].type==='image/png',share:value=>{invoked=true;payload=value;return Promise.resolve();}},onState:value=>states.push(value)});
  assert.deepEqual(await helper.prepare(canvas,'sideout-rally-story.png'),{phase:'ready',ready:true});
  const result=helper.share();
  assert.equal(invoked,true,'native share must run before the click handler yields');
  assert.deepEqual(Object.keys(payload),['files']);
  assert.equal(payload.files.length,1);
  assert.equal(payload.files[0].name,'sideout-rally-story.png');
  assert.equal(await payload.files[0].text(),'fictional story PNG');
  assert.deepEqual(await result,{phase:'handed-off',ready:true});
  assert.deepEqual(states.map(value=>value.phase),['preparing','ready','sharing','handed-off']);
});

test('missing file-sharing support and rejected capability checks stay unsupported',async()=>{
  for(const navigator of [{},{share(){}},{canShare(){return true;}},{share(){},canShare(){return false;}},{share(){},canShare(){throw new TypeError('Unsupported file');}}]){
    const helper=createStoryShare({navigator});
    assert.deepEqual(await helper.prepare(canvas,'story.png'),{phase:'unsupported',ready:false});
    assert.deepEqual(await helper.share(),{phase:'unsupported',ready:false});
  }
  const helper=createStoryShare({navigator:{share(){},canShare(){return true;}},File:null});
  assert.equal((await helper.prepare(canvas)).phase,'unsupported');
});

test('an older PNG callback cannot replace a newer prepared template',async()=>{
  const callbacks=[];let shared;
  const helper=createStoryShare({navigator:{canShare:()=>true,share:value=>{shared=value.files[0];}}});
  const slowCanvas={toBlob:callback=>callbacks.push(callback)};
  const old=helper.prepare(slowCanvas,'old.png');
  const latest=helper.prepare(slowCanvas,'latest.png');
  callbacks[1](png());
  assert.equal((await latest).phase,'ready');
  callbacks[0](png());
  assert.equal((await old).stale,true);
  await helper.share();
  assert.equal(shared.name,'latest.png');
});

test('invalidate rejects pending preparation and removes an earlier prepared file',async()=>{
  let callback,shareCalls=0;
  const helper=createStoryShare({navigator:{canShare:()=>true,share(){shareCalls++;}}});
  await helper.prepare(canvas,'old.png');
  const pending=helper.prepare({toBlob:value=>{callback=value;}},'new.png');
  helper.invalidate();
  callback(png());
  assert.equal((await pending).stale,true);
  assert.equal((await helper.share()).phase,'unsupported');
  assert.equal(shareCalls,0);
});

test('native cancellation keeps the PNG for a deliberate retry without a download',async()=>{
  let calls=0,encodes=0;
  const helper=createStoryShare({navigator:{canShare:()=>true,share(){calls++;return calls===1?Promise.reject(nativeError('AbortError')):Promise.resolve();}}});
  await helper.prepare({toBlob(callback){encodes++;callback(png());}},'story.png');
  assert.deepEqual(await helper.share(),{phase:'canceled',ready:true});
  assert.deepEqual(await helper.share(),{phase:'handed-off',ready:true});
  assert.equal(encodes,1);
  assert.equal(calls,2);
});

test('synchronous and asynchronous native errors retain the prepared file for retry',async()=>{
  const failures=[nativeError('NotAllowedError'),nativeError('DataError')];let calls=0;
  const helper=createStoryShare({navigator:{canShare:()=>true,share(){const attempt=calls++;if(attempt===0)throw failures[0];if(attempt===1)return Promise.reject(failures[1]);return Promise.resolve();}}});
  await helper.prepare(canvas,'story.png');
  for(const failure of failures){const result=await helper.share();assert.equal(result.phase,'error');assert.equal(result.ready,true);assert.equal(result.error,failure);}
  assert.equal((await helper.share()).phase,'handed-off');
  assert.equal(calls,3);
});

test('new preparation cannot unlock a second sheet while a native share is pending',async()=>{
  const native=deferred(),states=[],files=[];
  const helper=createStoryShare({navigator:{canShare:()=>true,share:value=>{files.push(value.files[0]);return native.promise;}},onState:value=>states.push(value)});
  await helper.prepare(canvas,'first.png');
  const first=helper.share();
  await helper.prepare(canvas,'second.png');
  const repeated=helper.share();
  assert.equal(first,repeated);
  assert.equal(files.length,1);
  assert.equal(states.at(-1).phase,'sharing');
  native.resolve();
  assert.deepEqual(await first,{phase:'handed-off',ready:true});
  await helper.share();
  assert.equal(files[1].name,'second.png');
});

test('invalidate preserves the in-flight lock until the existing sheet settles',async()=>{
  const native=deferred();let calls=0;
  const helper=createStoryShare({navigator:{canShare:()=>true,share(){calls++;return native.promise;}}});
  await helper.prepare(canvas,'story.png');
  const first=helper.share();
  assert.deepEqual(helper.invalidate(),{phase:'sharing',ready:false});
  assert.equal(helper.share(),first);
  native.reject(nativeError('AbortError'));
  assert.deepEqual(await first,{phase:'canceled',ready:false});
  assert.equal((await helper.share()).phase,'unsupported');
  assert.equal(calls,1);
});

test('the UI stays preparing when a native sheet settles before the next template encodes',async()=>{
  for(const outcome of ['handed-off','canceled','error']){
    const native=deferred(),states=[],files=[];let encode;
    const helper=createStoryShare({navigator:{canShare:()=>true,share:value=>{files.push(value.files[0]);return files.length===1?native.promise:Promise.resolve();}},onState:value=>states.push(value)});
    await helper.prepare(canvas,'first.png');
    const first=helper.share();
    const next=helper.prepare({toBlob:callback=>{encode=callback;}},'next.png');
    assert.equal(states.at(-1).phase,'sharing');
    if(outcome==='handed-off')native.resolve();
    else native.reject(nativeError(outcome==='canceled'?'AbortError':'DataError'));
    assert.equal((await first).phase,outcome);
    assert.deepEqual(states.at(-1),{phase:'preparing',ready:false});
    assert.equal(states.at(-2).phase,outcome,'share feedback is delivered before preparation resumes');
    encode(png());
    assert.deepEqual(await next,{phase:'ready',ready:true});
    assert.equal(states.at(-1).phase,'ready');
    await helper.share();
    assert.equal(files[1].name,'next.png');
  }
});

test('null blobs and encoding exceptions fail without exposing a stale PNG',async()=>{
  let shareCalls=0;
  const helper=createStoryShare({navigator:{canShare:()=>true,share(){shareCalls++;}}});
  for(const failedCanvas of [{toBlob:callback=>callback(null)},{toBlob(){throw nativeError('SecurityError');}}]){
    await helper.prepare(canvas,'old.png');
    const result=await helper.prepare(failedCanvas,'new.png');
    assert.equal(result.phase,'error');
    assert.equal(result.ready,false);
    assert.ok(result.error instanceof Error);
    assert.equal((await helper.share()).phase,'unsupported');
  }
  assert.equal(shareCalls,0);
});
