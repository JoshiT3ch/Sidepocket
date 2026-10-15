import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createPlayStore} from '../play-store.mjs';
import {COURTS} from '../dist/courts-data.js';

function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec(`PRAGMA foreign_keys=ON;
  CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,email TEXT,password_hash TEXT,salt TEXT);
  CREATE TABLE profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT NOT NULL);`);
 class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
 let current=null;
 const handle=createPlayStore({db,session:()=>current,body:async req=>req.data,
  send:(res,status,data)=>Object.assign(res,{status,data}),HttpError,storedProfile:(name,data)=>({name,...JSON.parse(data)})});
 function seed({ready=true,name='Court Player',rating=1200}={}){
  const id=randomUUID(),code='SO-'+id.replaceAll('-','').slice(0,12).toUpperCase();
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,name,'private@example.invalid','private-hash','private-salt');
  db.prepare('INSERT INTO profiles VALUES(?,?)').run(id,JSON.stringify({name,avatarCreated:ready,height:170,bodyType:'regular',characterType:'male',hairStyle:'short',skin:'#cf986c',shirt:'#ed795d',paddle:'#7286bb',hat:'cap',hairColor:'#43352f',capId:'nike-court-cap',shirtId:'custom',bottomId:'nike-field-shorts',email:'private@example.invalid',token:'private-token',rating:4999,games:999,wins:999}));
  db.prepare('INSERT INTO play_players VALUES(?,?,?,?,?)').run(id,code,rating,0,0);
  return{id,code};
 }
 async function request(actor,pathname='/api/courts',{method='GET',data={}}={}){
  current=actor;const res={};assert.equal(await handle({method,data},res,new URL(pathname,'http://localhost')),true);return res.data;
 }
 const check=(actor,courtId='paddle-grove',status='idle',openPlay=true,extra={})=>request(actor,'/api/courts/check-in',{method:'POST',data:{courtId,status,openPlay,...extra}});
 const leave=(actor,courtId=null,extra={})=>request(actor,'/api/courts/leave',{method:'POST',data:{courtId,...extra}});
 return{db,seed,request,check,leave};
}

test('court directory has eight owner supplied listings with Maps search links and no listing API data',async t=>{
 const {seed,request}=fixture(t),a=seed({ready:false});const snapshot=await request(a);
 assert.equal(snapshot.courts.length,8);assert.deepEqual(snapshot.courts.map(c=>c.id),COURTS.map(c=>c.id));
 assert.equal(snapshot.selectedCourtId,null);assert.deepEqual(snapshot.players,[]);assert.equal(snapshot.me.checkIn,null);
 assert.equal(snapshot.ttlMinutes,120);assert.equal(snapshot.rosterLimit,100);
 for(const c of snapshot.courts){const url=new URL(c.mapsUrl);assert.equal(url.origin,'https://www.google.com');assert.equal(url.searchParams.get('api'),'1');assert.equal(url.searchParams.get('query'),c.name+' '+c.address+', Valencia City, Bukidnon, Philippines');assert.equal(c.playerCount,0);assert.equal(c.openPlayCount,0);assert.deepEqual(Object.keys(c).sort(),['address','id','mapsUrl','name','openPlayCount','playerCount']);}
});

test('courts require authentication and avatar completion only for check-in',async t=>{
 const {seed,request,check,leave}=fixture(t),a=seed({ready:false});
 for(const [route,options] of [['/api/courts',{}],['/api/courts/paddle-grove',{}],['/api/courts/check-in',{method:'POST',data:{}}],['/api/courts/leave',{method:'POST'}]])await assert.rejects(request(null,route,options),{status:401});
 assert.equal((await request(a,'/api/courts/the-bodega')).players.length,0);await assert.rejects(check(a),{status:409});assert.equal((await leave(a)).me.checkIn,null);
 await assert.rejects(request(a,'/api/courts',{method:'POST'}),{status:404});
});

test('check-in exposes current avatars and MMR while keeping account and cosmetic statistics private',async t=>{
 const {seed,request,check}=fixture(t),a=seed({name:'<script>literal</script>',rating:1460}),b=seed({rating:1230});
 const before=Date.now(),mine=await check(a,'paddle-grove','practice',false,{userId:b.id,rating:9000,checkedInAt:0,updatedAt:0,expiresAt:99999999999999});
 assert.equal(mine.me.checkIn.courtId,'paddle-grove');assert.equal(mine.me.checkIn.status,'practice');assert.equal(mine.me.checkIn.openPlay,false);
 assert.ok(mine.me.checkIn.checkedInAt>=before);assert.equal(mine.me.checkIn.updatedAt,mine.serverTime);assert.equal(mine.me.checkIn.expiresAt-mine.me.checkIn.updatedAt,7200000);
 const seen=await request(b,'/api/courts/paddle-grove');assert.equal(seen.players.length,1);assert.equal(seen.players[0].player.id,a.id);assert.equal(seen.players[0].player.rating,1460);assert.equal(seen.players[0].player.name,'<script>literal</script>');assert.equal(seen.players[0].player.avatar.height,170);assert.equal(seen.me.checkIn,null);
 assert.deepEqual(Object.keys(seen.players[0]).sort(),['checkedInAt','expiresAt','openPlay','player','status','updatedAt']);
 assert.doesNotMatch(JSON.stringify(seen),/private-|password|salt|token|email|history|avatarCreated/);
 assert.equal((await request(a,'/api/play')).player.rating,1460);assert.equal((await request(a,'/api/play')).player.games,0);
});

test('court counts, status updates, atomic moves and self-only leave are shared between accounts',async t=>{
 const {db,seed,request,check,leave}=fixture(t),a=seed(),b=seed();
 await check(a,'paddle-grove','playing',true);await check(b,'paddle-grove','idle',false);
 let result=await request(a,'/api/courts/paddle-grove');assert.equal(result.courts[0].playerCount,2);assert.equal(result.courts[0].openPlayCount,1);assert.equal(result.players[0].player.id,a.id);
 const original=result.me.checkIn.checkedInAt;result=await check(a,'paddle-grove','practice',false);assert.equal(result.me.checkIn.checkedInAt,original);assert.equal(result.courts[0].openPlayCount,0);
 result=await check(a,'the-bodega','idle',true);assert.equal(result.courts[0].playerCount,1);assert.equal(result.courts.at(-1).playerCount,1);assert.equal(result.players[0].player.id,a.id);assert.equal(db.prepare('SELECT COUNT(*) total FROM court_checkins WHERE user_id=?').get(a.id).total,1);
 await leave(a,'paddle-grove',{userId:b.id});assert.equal((await request(a,'/api/courts/paddle-grove')).players[0].player.id,b.id);assert.equal((await request(a)).me.checkIn,null);
 assert.equal((await leave(a)).me.checkIn,null);
});

test('expiry hides people from directory, roster and own presence without reads renewing it',async t=>{
 const {db,seed,request,check}=fixture(t),a=seed(),b=seed();await check(a);await check(b);
 const stored={...db.prepare('SELECT * FROM court_checkins WHERE user_id=?').get(a.id)};
 await request(a);await request(a,'/api/courts/paddle-grove');assert.deepEqual({...db.prepare('SELECT * FROM court_checkins WHERE user_id=?').get(a.id)},stored);
 const old=Date.now()-10800000;db.prepare('UPDATE court_checkins SET checked_in_at=?,updated_at=?,expires_at=? WHERE user_id=?').run(old,old,old+7200000,a.id);
 const hidden=await request(a,'/api/courts/paddle-grove');assert.equal(hidden.me.checkIn,null);assert.equal(hidden.courts[0].playerCount,1);assert.equal(hidden.players.length,1);assert.equal(hidden.players[0].player.id,b.id);
 const refreshed=await check(a);assert.ok(refreshed.me.checkIn.checkedInAt>old);assert.equal(refreshed.courts[0].playerCount,2);
});

test('invalid courts, statuses and non-boolean open-play values cannot replace an existing check-in',async t=>{
 const {db,seed,request,check,leave}=fixture(t),a=seed();await check(a);
 const before={...db.prepare('SELECT * FROM court_checkins WHERE user_id=?').get(a.id)};
 for(const status of ['Playing','practicing','',null,7,{},[]])await assert.rejects(check(a,'paddle-grove',status),{status:400});
 for(const openPlay of ['true','false',1,0,null,{},[]])await assert.rejects(check(a,'paddle-grove','idle',openPlay),{status:400});
 await assert.rejects(request(a,'/api/courts/check-in',{method:'POST',data:{courtId:'paddle-grove',status:'idle'}}),{status:400});
 for(const id of ['unknown','',null,17])await assert.rejects(check(a,id),{status:404});
 await assert.rejects(leave(a,'unknown'),{status:404});await assert.rejects(request(a,'/api/courts/unknown'),{status:404});
 assert.deepEqual({...db.prepare('SELECT * FROM court_checkins WHERE user_id=?').get(a.id)},before);
});

test('roster caps at 100, includes the current player first, then orders by update and stable ID while counts remain total',async t=>{
 const {db,seed,request,check}=fixture(t),actors=[];
 for(let i=0;i<102;i++){const a=seed();actors.push(a);await check(a);}
 const stamp=Date.now()-1000;db.prepare('UPDATE court_checkins SET checked_in_at=?,updated_at=?,expires_at=?').run(stamp,stamp,stamp+7200000);
 const actor=actors.at(-1);const result=await request(actor,'/api/courts/paddle-grove');assert.equal(result.courts[0].playerCount,102);assert.equal(result.courts[0].openPlayCount,102);assert.equal(result.players.length,100);assert.equal(result.players[0].player.id,actor.id);
 assert.deepEqual(result.players.slice(1).map(p=>p.player.id),actors.slice(0,-1).map(a=>a.id).sort().slice(0,99));
 assert.deepEqual((await request(actor)).players,[]);
});
