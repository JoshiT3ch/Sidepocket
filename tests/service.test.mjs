import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../dist/service.js';

const configuration={provider:'supabase',url:'https://test-sideout.supabase.co',publishableKey:'sb_publishable_browser_test'};
const id='d29e97d9-37c0-4d27-ab22-02adbdbd6bc8';
const playerCode='SO-012345ABCDEF';
const user={id,email:'player@example.invalid',user_metadata:{name:'Court Player'}};
function fixture({session=null,authError=null,rpcError=null,rpcData={}}={}){
  const calls=[];
  const client={
    auth:{
      async getSession(){calls.push(['getSession']);return{data:{session},error:null};},
      async getUser(){calls.push(['getUser']);return{data:{user},error:authError};},
      async signUp(input){calls.push(['signUp',input]);return{data:{user,session},error:authError};},
      async signInWithPassword(input){calls.push(['signInWithPassword',input]);return{data:{user,session},error:authError};},
      async signOut(input){calls.push(['signOut',input]);return{error:null};},
      onAuthStateChange(callback){calls.push(['subscriber',callback]);return{data:{subscription:{unsubscribe(){}}}};}
    },
    async rpc(name,args){calls.push(['rpc',name,args]);return{data:rpcData,error:rpcError};}
  };
  const service=createService(configuration,{createClient:(...input)=>{calls.push(['createClient',...input]);return client;},location:{href:`https://sideout.example/?player=${playerCode}&discard=1#signup`}});
  return{service,calls,client};
}
const post=body=>({method:'POST',body:JSON.stringify(body)});

test('local preview preserves the account API, origin credentials and mutation headers',async()=>{
  let observed;
  const service=createService({provider:'local'},{fetchImpl:async(...input)=>{observed=input;return{ok:true,status:200,json:async()=>({ok:true})};}});
  assert.deepEqual(await service.request('/api/profile',{method:'PUT',body:'{"name":"Me"}'}),{ok:true});
  assert.equal(observed[0],'/api/profile');
  assert.equal(observed[1].credentials,'same-origin');
  assert.equal(observed[1].headers['X-Sideout-Request'],'1');
  assert.equal(observed[1].body,'{"name":"Me"}');
  await assert.rejects(service.request('https://other.example/api/profile'),{status:404});
});

test('remote configuration accepts only HTTPS public connections and delegates refresh to the SDK',()=>{
  const {calls}=fixture();
  assert.deepEqual(calls[0],['createClient',configuration.url,configuration.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}}]);
  for(const config of [
    {...configuration,publishableKey:'sb_secret_private'},
    {...configuration,publishableKey:'eyJhbGciOiJIUzI1NiJ9.service_role.signature'},
    {...configuration,url:'http://test-sideout.supabase.co'},
    {...configuration,url:'https://test-sideout.supabase.co.evil.example'},
    {...configuration,url:'https://secret@test-sideout.supabase.co'},
    {...configuration,url:'https://test-sideout.supabase.co/?token=secret'}
  ])assert.throws(()=>createService(config,{createClient:()=>assert.fail('Privileged credentials must never reach the SDK.')}),{status:503});
});

test('unconfirmed signup returns an explicit pending state and preserves the player link in its confirmation redirect',async()=>{
  const {service,calls}=fixture();
  const result=await service.request('/api/auth/signup',post({email:' PLAYER@example.invalid ',password:'strong-password',name:' Court Player '}));
  assert.equal(result.requiresConfirmation,true);
  assert.deepEqual(calls[1],['signUp',{email:'player@example.invalid',password:'strong-password',options:{data:{name:'Court Player'},emailRedirectTo:`https://sideout.example/?player=${playerCode}#play`}}]);
});

test('confirmed signup and password login return the verified account shape',async()=>{
  const {service,calls}=fixture({session:{access_token:'not-exposed'}});
  const signup=await service.request('/api/auth/signup',post({email:user.email,password:'strong-password',name:'Court Player'}));
  assert.equal(signup.requiresConfirmation,false);
  assert.deepEqual(signup.user,{id,email:user.email,name:'Court Player'});
  const login=await service.request('/api/auth/login',post({email:' PLAYER@example.invalid ',password:'strong-password',userId:'ignored'}));
  assert.deepEqual(login,{user:{id,email:user.email,name:'Court Player'}});
  assert.deepEqual(calls.at(-1),['signInWithPassword',{email:user.email,password:'strong-password'}]);
});

test('session check waits for initialization then verifies the stored identity with Auth',async()=>{
  const {service,calls}=fixture({session:{user:{...user,id:'forged-local-id'},access_token:'not-exposed'}});
  assert.deepEqual(await service.request('/api/auth/session'),{user:{id,email:user.email,name:'Court Player'}});
  assert.deepEqual(calls.slice(1),[['getSession'],['getUser']]);
});

test('anonymous session never makes profile or authenticated identity calls',async()=>{
  const {service,calls}=fixture();
  assert.deepEqual(await service.request('/api/auth/session'),{user:null});
  assert.deepEqual(calls.slice(1),[['getSession']]);
});

test('revoked sessions clear the current device and return to the unauthenticated state',async()=>{
  const {service,calls}=fixture({session:{access_token:'expired'},authError:{status:401,message:'JWT invalid'}});
  assert.deepEqual(await service.request('/api/auth/session'),{user:null});
  assert.deepEqual(calls.at(-1),['signOut',{scope:'local'}]);
});

test('profile changes use the authenticated profile RPC without allowing client-chosen account IDs',async()=>{
  const profile={name:'Updated',rating:1200};
  const {service,calls}=fixture({rpcData:profile});
  assert.deepEqual(await service.request('/api/profile'),{profile});
  assert.deepEqual(calls.at(-1),['rpc','sideout_profile',{}]);
  assert.deepEqual(await service.request('/api/profile',{method:'PUT',body:JSON.stringify(profile)}),{ok:true});
  assert.deepEqual(calls.at(-1),['rpc','sideout_save_profile',{p_profile:profile}]);
});

test('duo and match actions preserve server-authoritative rating and ownership contracts',async()=>{
  const play={player:{code:playerCode,rating:1200},matches:[]};
  const {service,calls}=fixture({rpcData:play});
  const actions=[
    ['/api/play',{},'sideout_play',{}],
    [`/api/players/${playerCode}`,{},'sideout_player',{p_code:playerCode}],
    ['/api/duos',post({playerCode,rating:9999}),'sideout_duo_invite',{p_code:playerCode}],
    [`/api/duos/${id}/respond`,post({accept:true,userId:'ignored'}),'sideout_duo_respond',{p_id:id,p_accept:true}],
    ['/api/duos/leave',post({}),'sideout_duo_leave',{}],
    ['/api/matches',post({playerCode}),'sideout_match_create',{p_code:playerCode}],
    [`/api/matches/${id}/respond`,post({accept:false}),'sideout_match_respond',{p_id:id,p_accept:false}],
    [`/api/matches/${id}/result`,post({winnerSide:'a',delta:9999}),'sideout_match_result',{p_id:id,p_winner:'a'}],
    [`/api/matches/${id}/cancel`,post({}),'sideout_match_cancel',{p_id:id}]
  ];
  for(const [path,options,name,args] of actions){
    assert.deepEqual(await service.request(path,options),play);
    assert.deepEqual(calls.at(-1),['rpc',name,args]);
  }
});

test('unsupported routes and methods never call arbitrary database functions',async()=>{
  const {service,calls}=fixture();
  for(const [path,options] of [
    ['/api/rpc/admin_delete_all',post({})],
    ['/api/profile',{method:'DELETE'}],
    ['/api/auth/login',{}],
    [`/api/duos/${id}/result`,post({})],
    ['/api/players/SO-INVALID',{}],
    ['/api/profile?userId=someone-else',{}]
  ])await assert.rejects(service.request(path,options),{status:404});
  await assert.rejects(service.request('/api/profile',{method:'PUT',body:'{broken'}),{status:400});
  assert.equal(calls.length,1);
});

test('RPC authorization errors are exposed as login failures and ordinary validation remains actionable',async()=>{
  const expired=fixture({rpcError:{code:'PGRST301',message:'JWT expired'}});
  await assert.rejects(expired.service.request('/api/play'),{status:401,message:'Please log in to continue.'});
  const invalid=fixture({rpcError:{code:'P0001',message:'Both players need a duo before you can challenge them.'}});
  await assert.rejects(invalid.service.request('/api/matches',post({playerCode})),{status:400,message:'Both players need a duo before you can challenge them.'});
});

test('logout revokes the current browser session and exposes no access or refresh tokens',async()=>{
  const {service,calls}=fixture();
  assert.deepEqual(await service.request('/api/auth/logout',post({})),{ok:true});
  assert.deepEqual(calls.at(-1),['signOut',{scope:'local'}]);
});
