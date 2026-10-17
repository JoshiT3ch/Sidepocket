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

test('Google sign-in keeps a canonical duo invite alongside a player lookup and strips all other input',async()=>{
  const {service,calls}=fixture({href:`https://sideout.example/?duo=${id.toUpperCase()}&player=${playerCode}&redirectTo=https%3A%2F%2Fevil.example&token=private#signup`});
  await service.request('/api/auth/google',post({redirectTo:'https://evil.example',duo:'ignored'}));
  assert.deepEqual(calls.at(-1),['signInWithOAuth',{provider:'google',options:{redirectTo:`https://sideout.example/?player=${playerCode}&duo=${id}`}}]);
  const onlyDuo=fixture({href:`https://sideout.example/?duo=${id}#login`});
  await onlyDuo.service.request('/api/auth/google',post({}));
  assert.equal(onlyDuo.calls.at(-1)[1].options.redirectTo,`https://sideout.example/?duo=${id}`);
});

test('malformed and ambiguous duo intents cannot survive OAuth or replace a valid player lookup',async()=>{
  for(const query of [
    'duo=https%3A%2F%2Fevil.example',
    `duo=${id}%2F..`,
    `duo=%20${id}`,
    `duo=${id}&duo=${id}`,
    `duo=${id}&duo=invalid`,
    'duo=',
    `duo=${id.replaceAll('-','')}`
  ]){
    const {service,calls}=fixture({href:`https://sideout.example/?${query}&player=${playerCode}#signup`});
    await service.request('/api/auth/google',post({}));
    assert.equal(calls.at(-1)[1].options.redirectTo,`https://sideout.example/?player=${playerCode}`);
  }
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
  for(const href of ['https://sideout.example/#login',`https://sideout.example/?player=${playerCode}#signup`,`https://sideout.example/?duo=${id}#login`,`https://sideout.example/?player=${playerCode}&duo=${id}#signup`]){
    const {service,calls}=fixture({href});
    await service.request('/api/auth/google',post({}));
    const redirect=calls.at(-1)[1].options.redirectTo;
    // This is Auth's AsRedirectURL behavior, using synthetic tokens only.
    const callback=new URL(redirect+'#access_token=synthetic-access&refresh_token=synthetic-refresh&expires_in=3600&token_type=bearer');
    const params=Object.fromEntries(new URLSearchParams(callback.hash.slice(1)));
    assert.equal(sdk.AuthClient.prototype._isImplicitGrantCallback.call({detectSessionInUrl:true},params),true);
    assert.equal(params.access_token,'synthetic-access');
    assert.equal(callback.searchParams.get('player'),href.includes('?player=')?playerCode:null);
    assert.equal(callback.searchParams.get('duo'),href.includes('duo=')?id:null);
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
    ['/api/duos/link',post({ownerId:'ignored',playerCode}),'sideout_duo_link_create',{}],
    ['/api/duos/join',post({token:id,ownerId:'ignored',rating:9999}),'sideout_duo_link_join',{p_token:id}],
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

test('court actions use fixed RPC arguments and never forward client-chosen ownership, rating or presence times',async()=>{
  const courts={courts:[{id:'paddle-grove',name:'Paddle Grove',players:[]}],me:null};
  const {service,calls}=fixture({rpcData:courts});
  const forged={userId:'another-player',rating:9999,checkedInAt:'2099-01-01',expiresAt:'2099-12-31',p_user_id:'another-player'};
  for(const [path,options,name,args] of [
    ['/api/courts',{body:forged},'sideout_courts',{p_court_id:null}],
    ['/api/courts/paddle-grove',{body:forged},'sideout_courts',{p_court_id:'paddle-grove'}],
    ['/api/courts/check-in',post({...forged,courtId:'paddle-grove',status:'playing',openPlay:true}),'sideout_court_check_in',{p_court_id:'paddle-grove',p_status:'playing',p_open_play:true}],
    ['/api/courts/check-in',post({...forged,courtId:'the-bodega',status:'practice',openPlay:false}),'sideout_court_check_in',{p_court_id:'the-bodega',p_status:'practice',p_open_play:false}],
    ['/api/courts/leave',post({...forged,courtId:'paddle-grove'}),'sideout_court_leave',{p_court_id:'paddle-grove'}],
    ['/api/courts/leave',post(forged),'sideout_court_leave',{p_court_id:null}]
  ]){
    assert.deepEqual(await service.request(path,options),courts);
    assert.deepEqual(calls.at(-1),['rpc',name,args]);
  }
  // The transport must not coerce invalid input into an apparently valid presence.
  await service.request('/api/courts/check-in',post({courtId:'paddle-grove',status:'invalid',openPlay:'false'}));
  assert.deepEqual(calls.at(-1),['rpc','sideout_court_check_in',{p_court_id:'paddle-grove',p_status:'invalid',p_open_play:'false'}]);
});

test('court routes reject query injection, encoded traversal, malformed slugs and unsupported methods before RPC access',async()=>{
  const {service,calls}=fixture();
  for(const [path,options={}] of [
    ['/api/courts?userId=another-player'],
    ['/api/courts/paddle-grove?expires=never'],
    ['/api/courts/paddle-grove#other-player'],
    ['/api/courts/%2e%2e'],
    ['/api/courts/paddle-grove%2F..'],
    ['/api/courts/../profile'],
    ['/api/courts/Paddle-Grove'],
    ['/api/courts/-paddle-grove'],
    ['/api/courts/paddle--grove'],
    ['/api/courts/paddle-grove/'],
    [`/api/courts/${'a'.repeat(81)}`],
    ['/api/courts',post({})],
    ['/api/courts/paddle-grove',post({})],
    ['/api/courts/check-in'],
    ['/api/courts/leave'],
    ['/api/courts/check-in',{method:'PUT',body:'{}'}],
    ['/api/courts/leave',{method:'DELETE'}]
  ])await assert.rejects(service.request(path,options),{status:404});
  assert.equal(calls.length,1);
  const valid=fixture();
  await valid.service.request(`/api/courts/${'a'.repeat(80)}`);
  assert.deepEqual(valid.calls.at(-1),['rpc','sideout_courts',{p_court_id:'a'.repeat(80)}]);
});

test('local court transport keeps the same routes, origin credentials and mutation headers',async()=>{
  const calls=[];
  const service=createService({provider:'local'},{fetchImpl:async(...input)=>{calls.push(input);return{ok:true,status:200,json:async()=>({courts:[]})};}});
  for(const [path,options] of [
    ['/api/courts',{}],
    ['/api/courts/paddle-grove',{}],
    ['/api/courts/check-in',post({courtId:'paddle-grove',status:'idle',openPlay:true})],
    ['/api/courts/leave',post({courtId:'paddle-grove'})]
  ]){
    assert.deepEqual(await service.request(path,options),{courts:[]});
    const observed=calls.at(-1);
    assert.equal(observed[0],path);
    assert.equal(observed[1].credentials,'same-origin');
    assert.equal(observed[1].headers['X-Sideout-Request'],'1');
    assert.equal(observed[1].body,options.body);
  }
  await assert.rejects(service.request('/api/courts?userId=another-player'),{status:404});
  await assert.rejects(service.request('/api/courts/check-in',{method:'DELETE'}),{status:404});
  assert.equal(calls.length,4);
});

test('friends routes map only to authenticated friend gateways with explicit arguments',async()=>{
  const data={friends:[],incoming:[],outgoing:[]};
  const {service,calls}=fixture({rpcData:data});
  for(const [path,options,rpc,args]of [
    ['/api/friends',{},'sideout_friends',{}],
    ['/api/friends/request',post({playerCode}),'sideout_friend_request',{p_code:playerCode}],
    [`/api/friends/${id}/respond`,post({accept:true}),'sideout_friend_respond',{p_id:id,p_accept:true}],
    [`/api/friends/${id}/cancel`,post({}),'sideout_friend_cancel',{p_id:id}],
    [`/api/friends/${id}/remove`,post({}),'sideout_friend_remove',{p_id:id}]
  ]){
    assert.deepEqual(await service.request(path,options),data);
    assert.deepEqual(calls.at(-1),['rpc',rpc,args]);
  }
  const before=calls.length;
  for(const path of ['/api/friends/not-a-uuid/remove',`/api/friends/${id}/delete`,'/api/friends/request?user=other'])await assert.rejects(service.request(path,post({})),{status:404});
  await assert.rejects(service.request(`/api/friends/${id}/remove`,{method:'DELETE'}),{status:404});
  assert.equal(calls.length,before);
});

test('friend sharing transport forwards only choices and preserves strict validation inputs',async()=>{
  const {service,calls}=fixture();
  const forged={userId:'other',expiresAt:'2099-01-01',updatedAt:0,latitude:8,longitude:125};
  await service.request('/api/friends/presence',post({...forged,status:'available',courtId:'paddle-grove',shareStatus:true,shareLocation:false}));
  assert.deepEqual(calls.at(-1),['rpc','sideout_presence_update',{p_status:'available',p_court_id:'paddle-grove',p_share_status:true,p_share_location:false}]);
  await service.request('/api/friends/presence',post({status:'invalid',courtId:null,shareStatus:'false',shareLocation:0}));
  assert.deepEqual(calls.at(-1),['rpc','sideout_presence_update',{p_status:'invalid',p_court_id:null,p_share_status:'false',p_share_location:0}]);
  await service.request('/api/friends/presence/hide',post(forged));
  assert.deepEqual(calls.at(-1),['rpc','sideout_presence_hide',{}]);
  const before=calls.length;
  for(const [path,options] of [
    ['/api/friends/presence',{}],['/api/friends/presence/hide',{}],
    ['/api/friends/presence',{method:'PUT',body:'{}'}],
    ['/api/friends/presence?user=other',post({})],['/api/friends/presence/hide/other',post({})]
  ])await assert.rejects(service.request(path,options),{status:404});
  assert.equal(calls.length,before);
});

test('local friend sharing uses the same origin-restricted endpoints',async()=>{
  const calls=[];
  const service=createService({provider:'local'},{fetchImpl:async(...input)=>{calls.push(input);return{ok:true,status:200,json:async()=>({friends:[]})};}});
  for(const path of ['/api/friends/presence','/api/friends/presence/hide']){
    await service.request(path,post({}));
    assert.equal(calls.at(-1)[0],path);
    assert.equal(calls.at(-1)[1].credentials,'same-origin');
    assert.equal(calls.at(-1)[1].headers['X-Sideout-Request'],'1');
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
