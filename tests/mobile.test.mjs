import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeRuntime,gameDestination,callbackCode,AUTH_REDIRECT,PUBLIC_ORIGIN} from '../mobile/src/runtime.js';
import {createService} from '../dist/service.js';
import {playerLink,duoLink,parseDuoInvite} from '../dist/player-links.js';

const player='SO-012345ABCDEF',duo='d29e97d9-37c0-4d27-ab22-02adbdbd6bc8';
const configuration={provider:'supabase',url:'https://test-sideout.supabase.co',publishableKey:'sb_publishable_test'};
const oauthUrl=configuration.url+'/auth/v1/authorize?provider=google&redirect_to='+encodeURIComponent(AUTH_REDIRECT);

test('native room links preserve a single validated room through game navigation',()=>{
 assert.equal(gameDestination(`${PUBLIC_ORIGIN}/?room=${duo}#play`),`/?room=${duo}#play`);
 assert.equal(gameDestination(`${PUBLIC_ORIGIN}/?room=${duo}&room=${duo}`),null);
 assert.equal(gameDestination(`${PUBLIC_ORIGIN}/?room=no`),null);
 assert.equal(gameDestination(`https://other.example/?room=${duo}`),null);
});
function fixture({launch,clock=1_000_000,stored,exchange=async()=>{}}={}){
  const events={},calls=[],values=new Map(stored||[]),nodes=new Map();let current=new URL('https://localhost/#login'),reloads=0;
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const window={location:{get href(){return current.href;},get origin(){return current.origin;},get hash(){return current.hash;},set hash(value){current.hash=value;},replace(value){current=new URL(value,current);},reload(){reloads++;}},history:{replaceState(_a,_b,value){current=new URL(value,current);}}};
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,{hidden:true,textContent:''});return nodes.get(id);},querySelectorAll:()=>[]};
  const App={async addListener(name,handler){events[name]=handler;},async getLaunchUrl(){return launch?{url:launch}:undefined;},async minimizeApp(){calls.push('minimize');}};
  const Browser={async open(value){calls.push(['browser',value]);},async close(){calls.push(['close']);}};
  const runtime=createNativeRuntime({App,Browser,window,document,storage,now:()=>clock});
  const service={async completeNativeSignIn(code){calls.push(['exchange',code]);await exchange(code);}};
  return{runtime,service,calls,events,values,nodes,window,Browser,get reloads(){return reloads;},get href(){return current.href;},async connect(){await runtime.connect(service);},async open(){await runtime.openSignIn(oauthUrl,{providerOrigin:configuration.url,returnTo:`https://localhost/?player=${player}&duo=${duo}#play`});},async deliver(url){events.appUrlOpen({url});await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));}};
}

test('mobile links accept only the canonical website and validated, unambiguous game intent',()=>{
  assert.equal(gameDestination(`${PUBLIC_ORIGIN}/?player=${player.toLowerCase()}&duo=${duo}&redirectTo=https://evil.invalid#login`),`/?player=${player}&duo=${duo}#play`);
  for(const url of [`https://evil.invalid/?player=${player}`,`${PUBLIC_ORIGIN}.evil.invalid/?duo=${duo}`,`${PUBLIC_ORIGIN}/?duo=${duo}&duo=${duo}`,`${PUBLIC_ORIGIN}/?player=bad`,`${PUBLIC_ORIGIN}/privacy.html?player=${player}`,`${PUBLIC_ORIGIN}/`])assert.equal(gameDestination(url),null);
});

test('callback handling rejects token fragments, duplicate codes and misleading schemes/hosts',()=>{
  assert.equal(callbackCode(AUTH_REDIRECT+'?code=one-time-code'),'one-time-code');
  for(const url of [AUTH_REDIRECT+'?code=a&code=b',AUTH_REDIRECT+'?code=a#access_token=stolen',AUTH_REDIRECT+'?code=a&error=denied',AUTH_REDIRECT+'-other?code=a','https://auth/callback?code=a','com.sideout.valencia://auth.evil/callback?code=a','com.sideout.valencia://someone@auth/callback?code=a'])assert.equal(callbackCode(url),null);
});

test('mobile sign-in selects PKCE, suppresses WebView redirects and exchanges the callback code',async()=>{
  const calls=[],native={isNative:true,authRedirect:AUTH_REDIRECT,clearSignIn(){},async openSignIn(...input){calls.push(['open',...input]);}};
  const auth={async signInWithOAuth(input){calls.push(['oauth',input]);return{data:{url:oauthUrl},error:null};},async exchangeCodeForSession(code){calls.push(['exchange',code]);return{data:{},error:null};}};
  const service=createService(configuration,{native,location:{href:`https://localhost/?duo=${duo}#login`},createClient:(_url,_key,options)=>{calls.push(['client',options]);return{auth};},fetchImpl:async()=>({ok:true,json:async()=>({external:{google:true}})})});
  assert.deepEqual(calls[0][1].auth,{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce'});
  await service.request('/api/auth/google',{method:'POST'});
  assert.deepEqual(calls[1],['oauth',{provider:'google',options:{redirectTo:AUTH_REDIRECT,skipBrowserRedirect:true}}]);
  assert.equal(calls[2][2].returnTo,`https://localhost/?duo=${duo}`);
  await service.completeNativeSignIn('test-code');assert.deepEqual(calls.at(-1),['exchange','test-code']);
});

test('a warm callback restores the saved duo intent, exchanges once and clears it before reload',async()=>{
  const page=fixture();await page.connect();await page.open();
  await page.deliver(AUTH_REDIRECT+'?code=once');
  assert.deepEqual(page.calls.filter(call=>call[0]==='exchange'),[['exchange','once']]);
  assert.equal(page.href,`https://localhost/?player=${player}&duo=${duo}#play`);
  assert.equal(page.values.size,0);assert.equal(page.reloads,1);
  await page.deliver(AUTH_REDIRECT+'?code=once');assert.equal(page.reloads,1);
});

test('cold-start callbacks retain intent while expired and unsolicited callbacks cannot sign in',async()=>{
  const first=fixture();await first.connect();await first.open();
  const cold=fixture({launch:AUTH_REDIRECT+'?code=cold',stored:[...first.values]});await cold.connect();
  assert.equal(cold.reloads,1);assert.match(cold.href,new RegExp('duo='+duo));
  const expired=fixture({launch:AUTH_REDIRECT+'?code=expired',stored:[...first.values],clock:2_000_000});await expired.connect();
  assert.equal(expired.reloads,0);assert.equal(expired.values.size,0);
  const unsolicited=fixture({launch:AUTH_REDIRECT+'?code=unsolicited'});await unsolicited.connect();assert.equal(unsolicited.reloads,0);
});

test('failed exchanges clear the attempt and display a recoverable message without leaking errors',async()=>{
  const page=fixture({exchange:async()=>{throw new Error('private token detail');}});await page.connect();await page.open();await page.deliver(AUTH_REDIRECT+'?code=failed');
  assert.equal(page.reloads,0);assert.equal(page.values.size,0);
  assert.match(page.runtime.authError,/Please try again/);assert.doesNotMatch(page.runtime.authError,/private/);
  await page.open();assert.equal(page.values.size,1);
});

test('external browser destinations are restricted to our configured Google authorization endpoint',async()=>{
  const page=fixture();await page.connect();
  for(const input of ['https://evil.invalid/auth/v1/authorize',configuration.url+'/other',oauthUrl.replace('google','github'),oauthUrl.replace(encodeURIComponent(AUTH_REDIRECT),encodeURIComponent('https://evil.invalid'))]){
    await assert.rejects(page.runtime.openSignIn(input,{providerOrigin:configuration.url,returnTo:'https://localhost/'}));
  }
  assert.equal(page.values.size,0);assert.equal(page.calls.length,0);
});

test('mobile QR links stay public and canonical instead of advertising https://localhost',()=>{
  const previousWindow=globalThis.window,previousLocation=globalThis.location;
  try{
    globalThis.location={href:'https://localhost/#play',origin:'https://localhost'};
    globalThis.window={sideoutNative:{isNative:true,publicOrigin:PUBLIC_ORIGIN}};
    assert.equal(playerLink(player),`${PUBLIC_ORIGIN}/?player=${player}#play`);
    assert.equal(duoLink(duo),`${PUBLIC_ORIGIN}/?duo=${duo}#play`);
    assert.equal(parseDuoInvite(duoLink(duo)),duo);
    assert.equal(parseDuoInvite(`https://evil.invalid/?duo=${duo}`),null);
  }finally{
    if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
    if(previousLocation===undefined)delete globalThis.location;else globalThis.location=previousLocation;
  }
});
