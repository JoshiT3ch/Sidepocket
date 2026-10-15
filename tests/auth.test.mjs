import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {DatabaseSync} from 'node:sqlite';
import {WARDROBE,DEFAULT_EQUIPMENT} from '../dist/wardrobe.js';
import {HAIRSTYLES,HAIR_COLORS} from '../dist/hairstyles.js';

// Execute the real auth controller with a DOM/transport double; only dynamic module loading is replaced.
async function authPage({href,provider='local',signedIn=false,avatarCreated=false}={}){
 const source=(await readFile(new URL('../dist/auth.js',import.meta.url),'utf8'))
  .replace("import('./service.js')","Promise.resolve({getService:()=>window.testService})")
  .replace("import('./pixel-player.js')","Promise.reject(new Error('Sprite rendering is checked separately.'))");
 class Element{
  constructor(){this.hidden=false;this.disabled=false;this.value='';this.dataset={};this.listeners={};this.children=[];this.attributes={};this.classList={remove(){},add(){}};}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(name,handler){this.listeners[name]=handler;}
  querySelectorAll(){return [];}
  replaceChildren(...children){this.children=children;}
  append(...children){this.children.push(...children);}
  reportValidity(){return true;}
  focus(){}
  async emit(name,event={}){await this.listeners[name]?.(event);}
 }
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const tabs=['login','signup'].map(mode=>{const item=new Element();item.dataset.authMode=mode;return item;});
 const calls=[],destinations=[];let current=new URL(href),reloads=0;
 const location={get href(){return current.href;},get search(){return current.search;},get hash(){return current.hash;},get protocol(){return current.protocol;},replace(value){destinations.push(value);current=new URL(value,current);},reload(){reloads++;}};
 const profile={name:'New Player',avatarCreated};const user={id:'fixture-player',name:'New Player'};
 const service={provider,onAuthStateChange(){return{unsubscribe(){}};},async request(path,options={}){calls.push([path,options]);if(path==='/api/auth/session')return{user:signedIn?user:null};if(path==='/api/profile')return{profile};if(path==='/api/auth/google')return{redirecting:true};return{user};}};
 const window={testService:service,addEventListener(){}};
 const document={getElementById:node,querySelector:selector=>node(selector),querySelectorAll:selector=>selector==='[data-auth-mode]'||selector==='.auth-tabs button'?tabs:[],createElement:()=>new Element(),createTextNode:text=>({textContent:text}),body:{classList:{remove(){}}}};
 vm.runInNewContext(source,{window,document,location,history:{replaceState(_state,_title,value){current=new URL(value,current);}},URL,URLSearchParams,setTimeout});
 const account=await window.sideoutAuth.ready;
 return{nodes,node,tabs,calls,destinations,account,location,get reloads(){return reloads;}};
}

const duoToken='a2790e87-4509-4625-9dad-c3acc267c2f7';
test('local login and signup retain only the current valid duo intent through auth mode switches',async()=>{
 for(const mode of ['login','signup']){
  const page=await authPage({href:`https://sideout.example/?duo=${duoToken.toUpperCase()}&redirectTo=https%3A%2F%2Fevil.example#${mode}`});
  await page.tabs.find(tab=>tab.dataset.authMode!==mode).emit('click');
  await page.tabs.find(tab=>tab.dataset.authMode===mode).emit('click');
  assert.equal(new URL(page.location.href).searchParams.get('duo'),duoToken.toUpperCase());
  assert.match(page.node('auth-subtitle').textContent,/join this duo/);
  page.node('auth-email').value='new@example.invalid';page.node('auth-name').value='New Player';page.node('auth-password').value='Example-password';page.node('auth-confirm').value='Example-password';
  await page.node('auth-form').emit('submit',{preventDefault(){}});
  assert.equal(page.calls.at(-1)[0],'/api/auth/'+mode);
  assert.equal(page.destinations.at(-1),`/?duo=${duoToken}#play`);assert.equal(page.reloads,1);
 }
});

test('new Google accounts keep their duo link after the verified session while still needing avatar setup',async()=>{
 const page=await authPage({href:`https://sideout.example/?player=SO-012345ABCDEF&duo=${duoToken}#login`,provider:'supabase',signedIn:true});
 assert.equal(page.account.profile.avatarCreated,false);
 assert.equal(page.location.href,`https://sideout.example/?player=SO-012345ABCDEF&duo=${duoToken}#play`);
 assert.equal(page.node('auth-view').hidden,true);assert.equal(page.node('player-app').hidden,false);
 assert.deepEqual(page.calls.map(call=>call[0]),['/api/auth/session','/api/profile']);
});

test('invalid or duplicated duo query values do not create a post-login join intent',async()=>{
 for(const query of [`duo=${duoToken}&duo=${duoToken}`,`duo=${duoToken}%2F..`,'duo=https%3A%2F%2Fevil.example','duo=']){
  const page=await authPage({href:`https://sideout.example/?${query}#login`,signedIn:true});
  assert.equal(page.location.href,'https://sideout.example/#profile');
 }
 const player=await authPage({href:`https://sideout.example/?player=SO-012345ABCDEF&duo=invalid#signup`,signedIn:true});
 assert.equal(player.location.href,'https://sideout.example/?player=SO-012345ABCDEF#play');
 const fresh=await authPage({href:'https://sideout.example/#login',signedIn:true});
 assert.equal(fresh.location.href,'https://sideout.example/#profile');
});

test('cancelled Google sign-in preserves the current duo URL for a retry without retaining OAuth errors',async()=>{
 const page=await authPage({href:`https://sideout.example/?duo=${duoToken}&error=access_denied#error_description=Cancelled`,provider:'supabase'});
 assert.equal(new URL(page.location.href).searchParams.get('duo'),duoToken);
 assert.equal(new URL(page.location.href).searchParams.has('error'),false);
 assert.equal(new URL(page.location.href).hash,'#login');assert.match(page.node('auth-error').textContent,/canceled/);
 assert.match(page.node('auth-subtitle').textContent,/join this duo/);
 await page.node('auth-google').emit('click');assert.equal(page.calls.at(-1)[0],'/api/auth/google');
 assert.equal(new URL(page.location.href).searchParams.get('duo'),duoToken);
});

test('accounts, authenticated profiles, and session protections',{timeout:30000},async t=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'sideout-auth-test-'));
 const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,[path.join(root,'server.mjs')],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',SIDEOUT_DATA_DIR:dataDir,PUBLIC_ORIGIN:'',COOKIE_SECURE:'false'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{const exit=new Promise(resolve=>child.once('exit',resolve));child.kill();await exit;await rm(dataDir,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error('Server exited '+code)));});
 async function request(route,{method='GET',data,cookie,foreignOrigin,requestHeader=true}={}){const headers={};if(cookie)headers.Cookie=cookie;if(data!==undefined){headers['Content-Type']='application/json';headers.Origin=foreignOrigin||origin;if(requestHeader)headers['X-Sideout-Request']='1';}const response=await fetch(origin+route,{method,headers,body:data!==undefined?JSON.stringify(data):undefined});return{response,status:response.status,json:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
 const credentials={name:'Test Player',email:'player@example.invalid',password:'TestPassword-2026'};
 await t.test('anonymous profile access is blocked',async()=>{assert.equal((await request('/api/profile')).status,401);assert.equal((await request('/api/auth/session')).json.user,null);});
 await t.test('cross-site and malformed registration are blocked',async()=>{assert.equal((await request('/api/auth/signup',{method:'POST',data:credentials,foreignOrigin:'https://untrusted.invalid'})).status,403);assert.equal((await request('/api/auth/signup',{method:'POST',data:credentials,requestHeader:false})).status,403);assert.equal((await request('/api/auth/signup',{method:'POST',data:{...credentials,password:'short'}})).status,400);});
 let a;
 await t.test('signup creates a session without exposing credentials',async()=>{a=await request('/api/auth/signup',{method:'POST',data:credentials});assert.equal(a.status,201);assert.ok(a.cookie);assert.match(a.response.headers.get('set-cookie'),/HttpOnly/);assert.match(a.response.headers.get('set-cookie'),/SameSite=Lax/);assert.equal(a.json.user.email,credentials.email);assert.equal(a.json.user.password_hash,undefined);assert.equal((await request('/api/auth/session',{cookie:a.cookie})).json.user.id,a.json.user.id);});
 await t.test('duplicate signup and incorrect passwords are rejected',async()=>{assert.equal((await request('/api/auth/signup',{method:'POST',data:credentials})).status,409);assert.equal((await request('/api/auth/login',{method:'POST',data:{...credentials,password:'WrongPassword-2026'}})).status,401);});
 let profile;
 await t.test('authenticated profile changes persist',async()=>{profile=(await request('/api/profile',{cookie:a.cookie})).json.profile;assert.equal(profile.name,credentials.name);assert.equal(profile.avatarCreated,false);assert.equal(profile.height,170);assert.equal(profile.bodyType,'regular');assert.equal(profile.characterType,'male');assert.equal(profile.hairStyle,'short');assert.equal(profile.hairColor,'#43352f');profile.characterType='female';profile.height=188;profile.bodyType='broad';profile.avatarCreated=true;profile.hairStyle='bob';profile.hairColor='#87583c';profile.shirt='#b59fc6';profile.rating=1216;profile.games=1;profile.wins=1;profile.history=[{win:true,opponent:1200,delta:16,after:1216}];assert.equal((await request('/api/profile',{method:'PUT',data:profile,cookie:a.cookie})).status,200);assert.deepEqual((await request('/api/profile',{cookie:a.cookie})).json.profile,profile);assert.equal((await request('/api/profile',{method:'PUT',data:{...profile,rating:-1},cookie:a.cookie})).status,400);});
 await t.test('every compatible hairstyle and color persists without altering other player data',async()=>{
  const choices=[...HAIRSTYLES.map(({id,characterType})=>({characterType,hairStyle:id})),...HAIR_COLORS.map(({color})=>({hairColor:color}))];
  for(const choice of choices){const next={...profile,...choice};assert.equal((await request('/api/profile',{method:'PUT',data:choice,cookie:a.cookie})).status,200,JSON.stringify(choice));assert.deepEqual((await request('/api/profile',{cookie:a.cookie})).json.profile,next);assert.equal((await request('/api/profile',{method:'PUT',data:profile,cookie:a.cookie})).status,200);}
 });
 await t.test('changing character type alone selects compatible hair while retaining color and progress',async()=>{
  assert.equal((await request('/api/profile',{method:'PUT',data:{characterType:'male'},cookie:a.cookie})).status,200);
  assert.deepEqual((await request('/api/profile',{cookie:a.cookie})).json.profile,{...profile,characterType:'male',hairStyle:'short'});
  assert.equal((await request('/api/profile',{method:'PUT',data:{characterType:'female'},cookie:a.cookie})).status,200);
  assert.deepEqual((await request('/api/profile',{cookie:a.cookie})).json.profile,{...profile,hairStyle:'ponytail'});
  assert.equal((await request('/api/profile',{method:'PUT',data:profile,cookie:a.cookie})).status,200);
 });
 await t.test('explicit hairstyles for the opposite character type are rejected in both directions',async()=>{
  for(const {id,characterType} of HAIRSTYLES){const incompatible={characterType:characterType==='female'?'male':'female',hairStyle:id};assert.equal((await request('/api/profile',{method:'PUT',data:incompatible,cookie:a.cookie})).status,400,JSON.stringify(incompatible));assert.deepEqual((await request('/api/profile',{cookie:a.cookie})).json.profile,profile);}
  assert.equal((await request('/api/profile',{method:'PUT',data:{characterType:'male',hairColor:'#ffffff'},cookie:a.cookie})).status,400);
  assert.deepEqual((await request('/api/profile',{cookie:a.cookie})).json.profile,profile);
 });
 await t.test('invalid hairstyle and color inputs are rejected without changing the saved avatar',async()=>{for(const invalid of [{hairStyle:'unknown'},{hairStyle:null},{hairStyle:3},{hairStyle:[]},{hairColor:'#ffffff'},{hairColor:null},{hairColor:42},{hairColor:{color:'#43352f'}}])assert.equal((await request('/api/profile',{method:'PUT',data:invalid,cookie:a.cookie})).status,400,JSON.stringify(invalid));assert.deepEqual((await request('/api/profile',{cookie:a.cookie})).json.profile,profile);});
 await t.test('all 40 wardrobe pieces can be saved and restored without changing MMR',async()=>{for(const [category,items]of Object.entries(WARDROBE))for(const item of items){const next={...profile};if(category==='caps'){next.capId=item.id;next.hat='cap';}else if(category==='shirts'){next.shirtId=item.id;next.shirt=item.color;}else next.bottomId=item.id;assert.equal((await request('/api/profile',{method:'PUT',data:next,cookie:a.cookie})).status,200,item.id);const restored=(await request('/api/profile',{cookie:a.cookie})).json.profile;assert.deepEqual(restored,next);assert.equal(restored.rating,profile.rating);}assert.equal((await request('/api/profile',{method:'PUT',data:profile,cookie:a.cookie})).status,200);});
 await t.test('invalid avatar proportions and equipment are rejected',async()=>{for(const invalid of [{height:119},{height:221},{height:170.5},{bodyType:'unknown'},{characterType:'invalid'},{avatarCreated:'yes'},{capId:WARDROBE.shirts[0].id},{shirtId:WARDROBE.caps[0].id},{bottomId:'not-real'}])assert.equal((await request('/api/profile',{method:'PUT',data:{...profile,...invalid},cookie:a.cookie})).status,400);assert.deepEqual((await request('/api/profile',{cookie:a.cookie})).json.profile,profile);});
 await t.test('two accounts have separate profiles',async()=>{const b=await request('/api/auth/signup',{method:'POST',data:{...credentials,name:'Second Player',email:'second@example.invalid'}});assert.equal(b.status,201);const own=(await request('/api/profile',{cookie:b.cookie})).json.profile;assert.equal(own.name,'Second Player');assert.equal(own.rating,1200);assert.equal(own.games,0);assert.equal(own.avatarCreated,false);assert.equal(own.height,170);assert.equal(own.bodyType,'regular');assert.equal(own.characterType,'male');assert.equal(own.hairStyle,'short');assert.equal(own.hairColor,'#43352f');assert.equal((await request('/api/profile',{method:'PUT',data:{hairStyle:'afro',hairColor:'#d6b66b'},cookie:b.cookie})).status,200);assert.deepEqual((await request('/api/profile',{cookie:b.cookie})).json.profile,{...own,hairStyle:'afro',hairColor:'#d6b66b'});assert.deepEqual((await request('/api/profile',{cookie:a.cookie})).json.profile,profile);});
 await t.test('older profiles receive avatar setup without losing their previous data',async()=>{const legacy=await request('/api/auth/signup',{method:'POST',data:{...credentials,name:'Legacy Player',email:'legacy@example.invalid'}});assert.equal(legacy.status,201);const saved={...profile,name:'Legacy Player'};delete saved.height;delete saved.bodyType;delete saved.avatarCreated;delete saved.characterType;delete saved.capId;delete saved.shirtId;delete saved.bottomId;const db=new DatabaseSync(path.join(dataDir,'sideout.sqlite'));try{db.prepare('UPDATE profiles SET data=? WHERE user_id=?').run(JSON.stringify(saved),legacy.json.user.id);}finally{db.close();}const migrated=(await request('/api/profile',{cookie:legacy.cookie})).json.profile;assert.equal(migrated.height,170);assert.equal(migrated.bodyType,'regular');assert.equal(migrated.characterType,'male');assert.equal(migrated.capId,DEFAULT_EQUIPMENT.capId);assert.equal(migrated.shirtId,'custom');assert.equal(migrated.bottomId,DEFAULT_EQUIPMENT.bottomId);assert.equal(migrated.avatarCreated,false);assert.equal(migrated.shirt,profile.shirt);assert.equal(migrated.rating,profile.rating);assert.deepEqual(migrated.history,profile.history);});
 await t.test('legacy missing or incompatible hair migrates without losing saved colors or progress',async()=>{
  for(const characterType of ['male','female']){
   const legacy=await request('/api/auth/signup',{method:'POST',data:{...credentials,name:'Hair Legacy',email:`legacy-hair-${characterType}@example.invalid`}});assert.equal(legacy.status,201);
   const saved={...profile,name:'Hair Legacy',characterType};delete saved.hairStyle;delete saved.hairColor;
   const writeLegacy=value=>{const db=new DatabaseSync(path.join(dataDir,'sideout.sqlite'));try{db.prepare('UPDATE profiles SET data=? WHERE user_id=?').run(JSON.stringify(value),legacy.json.user.id);}finally{db.close();}};
   writeLegacy(saved);
   const expected={...saved,hairStyle:characterType==='female'?'ponytail':'short',hairColor:'#43352f'};
   assert.deepEqual((await request('/api/profile',{cookie:legacy.cookie})).json.profile,expected);
   assert.equal((await request('/api/profile',{method:'PUT',data:{name:'Hair Updated'},cookie:legacy.cookie})).status,200);
   assert.deepEqual((await request('/api/profile',{cookie:legacy.cookie})).json.profile,{...expected,name:'Hair Updated'});
   writeLegacy({...saved,hairStyle:characterType==='female'?'spiky':'bun',hairColor:'#b7b8ba'});
   const fixed={...expected,hairColor:'#b7b8ba'};
   assert.deepEqual((await request('/api/profile',{cookie:legacy.cookie})).json.profile,fixed);
   assert.equal((await request('/api/profile',{method:'PUT',data:{name:'Hair Fixed'},cookie:legacy.cookie})).status,200);
   assert.deepEqual((await request('/api/profile',{cookie:legacy.cookie})).json.profile,{...fixed,name:'Hair Fixed'});
  }
 });
 await t.test('logout revokes the cookie and login restores the correct profile',async()=>{assert.equal((await request('/api/auth/logout',{method:'POST',data:{},cookie:a.cookie})).status,200);assert.equal((await request('/api/profile',{cookie:a.cookie})).status,401);const login=await request('/api/auth/login',{method:'POST',data:{...credentials,email:credentials.email.toUpperCase()}});assert.equal(login.status,200);assert.notEqual(login.cookie,a.cookie);assert.deepEqual((await request('/api/profile',{cookie:login.cookie})).json.profile,profile);a=login;});
 await t.test('private database files cannot be served',async()=>{assert.equal((await fetch(origin+'/.data/sideout.sqlite')).status,404);assert.equal((await fetch(origin+'/server.mjs')).status,404);});
 await t.test('password and session tokens are hashed in the database',async()=>{const db=new DatabaseSync(path.join(dataDir,'sideout.sqlite'));try{const stored=db.prepare('SELECT password_hash,salt FROM users WHERE id=?').get(a.json.user.id);assert.notEqual(stored.password_hash,credentials.password);assert.match(stored.password_hash,/^[a-f0-9]{128}$/);assert.match(stored.salt,/^[a-f0-9]{32}$/);const tokens=db.prepare('SELECT token_hash FROM sessions WHERE user_id=?').all(a.json.user.id);assert.ok(tokens.every(row=>row.token_hash!==a.cookie.split('=')[1]));db.prepare('UPDATE sessions SET expires_at=0 WHERE user_id=?').run(a.json.user.id);}finally{db.close();}assert.equal((await request('/api/profile',{cookie:a.cookie})).status,401);});
 await t.test('repeated failed attempts are limited',async()=>{let status=0;for(let i=0;i<21;i++){status=(await request('/api/auth/login',{method:'POST',data:{email:credentials.email,password:'short'}})).status;if(status===429)break;}assert.equal(status,429);});
});
