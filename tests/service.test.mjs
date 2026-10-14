import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createService} from '../dist/service.js';

const configuration={provider:'supabase',url:'https://test-sideout.supabase.co',publishableKey:'sb_publishable_browser_test'};
const id='d29e97d9-37c0-4d27-ab22-02adbdbd6bc8';
const playerCode='SO-012345ABCDEF';
const user={id,email:'player@example.invalid',user_metadata:{name:'Court Player'}};
function fixture({session=null,authError=null,rpcError=null,rpcData={},account=user,href=`https://sideout.example/?player=${playerCode}&discard=1#signup`,settings={external:{google:true}},settingsStatus=200,fetchError=null,jsonError=null}={}){
  const calls=[];
  const client={
    auth:{
      async getSession(){calls.push(['getSession']);return{data:{session},error:null};},
      async getUser(){calls.push(['getUser']);return{data:{user:account},error:authError};},
      async signUp(input){calls.push(['signUp',input]);return{data:{user,session},error:authError};},
      async signInWithPassword(input){calls.push(['signInWithPassword',input]);return{data:{user,session},error:authError};},
      async signInWithOAuth(input){calls.push(['signInWithOAuth',input]);return{data:{provider:'google',url:'https://account-service.example/authorize?secret=not-returned'},error:authError};},
      async signOut(input){calls.push(['signOut',input]);return{error:null};},
      onAuthStateChange(callback){calls.push(['subscriber',callback]);return{data:{subscription:{unsubscribe(){}}}};}
    },
    async rpc(name,args){calls.push(['rpc',name,args]);return{data:rpcData,error:rpcError};}
  };
  const service=createService(configuration,{
    createClient:(...input)=>{calls.push(['createClient',...input]);return client;},location:{href},
    fetchImpl:async(...input)=>{
      calls.push(['settings',...input]);if(fetchError)throw fetchError;
      return{ok:settingsStatus>=200&&settingsStatus<300,status:settingsStatus,json:async()=>{if(jsonError)throw jsonError;return settings;}};
    }
  });
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

test('Google sign-in uses only the configured provider and a same-origin player redirect',async()=>{
  const {service,calls}=fixture();
  const result=await service.request('/api/auth/google',post({provider:'github',redirectTo:'https://evil.example',queryParams:{access_type:'offline'}}));
  assert.deepEqual(result,{redirecting:true});
  assert.deepEqual(calls.slice(1),[
    ['settings',configuration.url+'/auth/v1/settings',{method:'GET',headers:{apikey:configuration.publishableKey},credentials:'omit',cache:'no-store',redirect:'error'}],
    ['signInWithOAuth',{provider:'google',options:{redirectTo:`https://sideout.example/?player=${playerCode}`}}]
  ]);
});

test('an unfinished Google provider stays on Sideout without opening an OAuth error page',async()=>{
  const {service,calls}=fixture({settings:{external:{google:false}}});
  await assert.rejects(service.request('/api/auth/google',post({})),{status:503,message:'Google sign-in is still being set up. Please try again later.'});
  assert.deepEqual(calls.map(call=>call[0]),['createClient','settings']);
});

test('unavailable or malformed Auth settings fail closed before Google navigation',async()=>{
  for(const options of [
    {fetchError:new Error('Network contains access_token=private')},
    {settingsStatus:401},
    {settingsStatus:503},
    {jsonError:new SyntaxError('Not JSON')},
    {settings:null},
    {settings:{}},
    {settings:{external:{google:'true'}}}
  ]){
    const {service,calls}=fixture(options);
    await assert.rejects(service.request('/api/auth/google',post({})),{status:503,message:'Google sign-in is unavailable right now. Please try again shortly.'});
    assert.deepEqual(calls.map(call=>call[0]),['createClient','settings']);
  }
});

test('invalid player links and injected destinations are removed before Google sign-in',async()=>{
  for(const href of [
    'https://sideout.example/?player=https%3A%2F%2Fevil.example&redirectTo=https%3A%2F%2Fevil.example#signup',
    'https://sideout.example/?player=SO-012345ABCDEF%2F..&token=private#access_token=private'
  ]){
    const {service,calls}=fixture({href});
    await service.request('/api/auth/google',post({redirectTo:'https://evil.example'}));
    assert.deepEqual(calls.at(-1),['signInWithOAuth',{provider:'google',options:{redirectTo:'https://sideout.example/'}}]);
  }
  const legacy=fixture({href:`https://sideout.example/#connect/${playerCode.toLowerCase()}`});
  await legacy.service.request('/api/auth/google',post({}));
  assert.equal(legacy.calls.at(-1)[1].options.redirectTo,`https://sideout.example/?player=${playerCode}`);
});

test('Supabase implicit callback remains recognizable to the bundled SDK after its token fragment is appended',async()=>{
  const source=await readFile(new URL('../dist/vendor/supabase-2.117.3.js',import.meta.url),'utf8');
  const sdk=vm.runInNewContext(source.replace(/export const createClient = supabase\.createClient;/,'')+';supabase;');
  for(const href of ['https://sideout.example/#login',`https://sideout.example/?player=${playerCode}#signup`]){
    const {service,calls}=fixture({href});
    await service.request('/api/auth/google',post({}));
    const redirect=calls.at(-1)[1].options.redirectTo;
    // This is Auth's AsRedirectURL behavior, using synthetic tokens only.
    const callback=new URL(redirect+'#access_token=synthetic-access&refresh_token=synthetic-refresh&expires_in=3600&token_type=bearer');
    const params=Object.fromEntries(new URLSearchParams(callback.hash.slice(1)));
    assert.equal(sdk.AuthClient.prototype._isImplicitGrantCallback.call({detectSessionInUrl:true},params),true);
    assert.equal(params.access_token,'synthetic-access');
    assert.equal(callback.searchParams.get('player'),href.includes('?player=')?playerCode:null);
  }
});

test('cloud email and password submissions are rejected without sending an email or password request',async()=>{
  const {service,calls}=fixture();
  for(const path of ['/api/auth/signup','/api/auth/login'])await assert.rejects(service.request(path,post({email:user.email,password:'strong-password'})),{status:400,message:'Use Continue with Google to join or log in to Sideout.'});
  assert.equal(calls.length,1);
});

test('local email accounts stay available and Google sign-in never calls a nonexistent local API',async()=>{
  const calls=[];
  const service=createService({provider:'local'},{fetchImpl:async(...input)=>{calls.push(input);return{ok:true,status:200,json:async()=>({user})};}});
  for(const path of ['/api/auth/signup','/api/auth/login'])assert.deepEqual(await service.request(path,post({email:user.email,password:'strong-password'})),{user});
  await assert.rejects(service.request('/api/auth/google',post({})),{status:400,message:'Google sign-in is available on the hosted Sideout website.'});
  assert.deepEqual(calls.map(call=>call[0]),['/api/auth/signup','/api/auth/login']);
});

test('Google errors remain readable without exposing provider URLs or credentials',async()=>{
  const failed=fixture({authError:{status:400,message:'OAuth URL contains access_token=private'}});
  await assert.rejects(failed.service.request('/api/auth/google',post({})),{status:400,message:'Google sign-in could not start. Please try again shortly.'});
  const offline=fixture();
  offline.client.auth.signInWithOAuth=async()=>{throw new Error('Secret provider failure');};
  await assert.rejects(offline.service.request('/api/auth/google',post({})),{status:503,message:'Google sign-in is unavailable right now. Please try again shortly.'});
});

test('verified Google profile names provide the initial player name without exposing account tokens',async()=>{
  const {service}=fixture({session:{access_token:'not-exposed'},account:{...user,user_metadata:{full_name:'Google Court Player'}}});
  assert.deepEqual(await service.request('/api/auth/session'),{user:{id,email:user.email,name:'Google Court Player'}});
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

test('leaderboard uses only the authenticated fixed RPC and ignores client-chosen ratings or identity',async()=>{
  const leaderboard={entries:[],me:{rank:null,player:{id,rating:1200,games:0}},rankedPlayers:0,limit:100};
  const {service,calls}=fixture({rpcData:leaderboard});
  assert.deepEqual(await service.request('/api/leaderboard',{body:{userId:'another-player',rating:9000,limit:1000}}),leaderboard);
  assert.deepEqual(calls.at(-1),['rpc','sideout_leaderboard',{}]);
  const before=calls.length;
  await assert.rejects(service.request('/api/leaderboard',post({rating:9999})),{status:404});
  await assert.rejects(service.request('/api/leaderboard?userId=another-player'),{status:404});
  assert.equal(calls.length,before);
  const expired=fixture({rpcError:{code:'PGRST301',message:'JWT expired'}});
  await assert.rejects(expired.service.request('/api/leaderboard'),{status:401,message:'Please log in to continue.'});
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
