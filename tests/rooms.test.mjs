import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createPlayStore} from '../play-store.mjs';
import {createRoomStore} from '../room-store.mjs';
import {roomLink,parseRoomLink} from '../dist/player-links.js';
import {createService} from '../dist/service.js';

test('room links accept a single room on this origin and never navigate to scanned origins',()=>{
 const id=randomUUID(),base='https://sideout.example/';
 assert.equal(parseRoomLink(roomLink(id,base),base.slice(0,-1)),id);
 for(const value of [`https://other.example/?room=${id}`,`${base}?room=${id}&room=${id}`,`${base}?room=no`, `javascript:alert(1)`,`${base.replace('https://','https://user@')}?room=${id}`])assert.equal(parseRoomLink(value,'https://sideout.example'),null);
});

test('room actions use one authenticated RPC and preserve room intent during Google sign-in',async()=>{
 const calls=[],id=randomUUID();
 const client={rpc:async(...args)=>{calls.push(args);return{data:{room:null},error:null};},auth:{signInWithOAuth:async input=>{calls.push(input);return{data:{},error:null};}}};
 const service=createService({provider:'supabase',url:'https://test.supabase.co',publishableKey:'sb_publishable_test'},{createClient:()=>client,location:{href:`https://sideout.example/?room=${id}&discard=1#login`},fetchImpl:async()=>({ok:true,json:async()=>({external:{google:true}})})});
 await service.request('/api/rooms');await service.request(`/api/rooms/${id}/slot`,{method:'POST',body:JSON.stringify({slot:4,id:randomUUID()})});
 assert.deepEqual(calls[0],['sideout_room',{p_action:'get',p_data:{}}]);assert.deepEqual(calls[1],['sideout_room',{p_action:'slot',p_data:{slot:4,id}}]);
 await service.request('/api/auth/google',{method:'POST'});assert.equal(calls[2].options.redirectTo,`https://sideout.example/?room=${id}`);
 await assert.rejects(service.request(`/api/rooms/${id}/close`),/not available/);
});

test('one room leader, contested slots, waiting rotation and rated match lifecycle',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT);');
  class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
  const options={db,session:req=>req.user,body:async req=>req.data||{},send:(res,status,json)=>Object.assign(res,{status,json}),HttpError,storedProfile:(_name,data)=>JSON.parse(data)};
  const play=createPlayStore(options),rooms=createRoomStore({...options,players:play.players});
  const actors=Array.from({length:8},(_,i)=>({id:randomUUID(),name:`Room Player ${i}`}));
  for(const actor of actors){db.prepare('INSERT INTO users VALUES(?,?)').run(actor.id,actor.name);db.prepare('INSERT INTO profiles VALUES(?,?)').run(actor.id,JSON.stringify({name:actor.name,avatarCreated:true}));play.players.player(actor.id);}
  const [a,b,c,d,e,f,g,h]=actors,format={bestOf:1,pointsToWin:11,winBy:2};
  async function request(user,path,data){const res={};try{await (path.startsWith('/api/rooms')?rooms:play)({user,method:data===undefined?'GET':'POST',data},res,new URL(path,'http://localhost'));return res;}catch(error){return{status:error.status||500,json:{error:error.message}};}}
  const post=async(user,path,data={})=>{const result=await request(user,path,data);assert.ok(result.status<300,JSON.stringify(result));return result.json;};
  assert.equal((await request(null,'/api/rooms')).status,401);
  const initial=await post(a,'/api/rooms'),id=initial.room.id,path=`/api/rooms/${id}`;
  assert.equal(initial.room.leaderId,a.id);assert.equal(initial.room.slots.length,6);
  assert.equal((await request(b,path)).json.room.slots.filter(Boolean).length,1,'reading QR does not join');
  assert.equal((await request(a,'/api/rooms',{})).status,409);
  await post(b,path+'/slot',{slot:1});await post(c,path+'/slot',{slot:2});await post(d,path+'/slot',{slot:3});await post(e,path+'/slot',{slot:4});await post(f,path+'/slot',{slot:5});
  assert.equal((await request(b,path+'/start',{format})).status,403);
  assert.equal((await request(b,path+'/waiting',{})).status,403);assert.equal((await request(b,path+'/close',{})).status,403);
  assert.equal((await request(e,path+'/slot',{slot:1})).status,409);assert.equal((await request(e,path)).json.room.slots[4].id,e.id,'a failed move retains old slot');
  await post(a,path+'/waiting');await post(a,path+'/slot',{slot:6});await post(g,path+'/slot',{slot:0});
  const started=await post(a,path+'/start',{format}),matchId=started.room.matchId;
  assert.equal(started.room.matchActive,true);assert.equal(db.prepare('SELECT created_by FROM play_matches WHERE id=?').get(matchId).created_by,a.id,'waiting leader owns match creation');
  assert.equal((await request(a,path+'/start',{format})).status,409);assert.equal((await request(b,path+'/slot',{slot:7})).status,400);
  assert.equal((await request(b,path+'/slot',{slot:4})).status,409);assert.equal((await request(a,path+'/close',{})).status,409);
  await post(a,path+'/waiting');await post(e,path+'/slot',{slot:7});
  assert.equal((await request(b,path+'/leave',{})).status,409);assert.equal((await request(h,`/api/matches/${matchId}/result`,{scores:[{a:11,b:7}]})).status,403);
  const completed=await post(b,`/api/matches/${matchId}/result`,{scores:[{a:11,b:7}]});assert.equal(completed.history[0].status,'completed');
  assert.equal(play.players.player(e.id).games,0,'waiting players do not get ratings');assert.equal(play.players.player(a.id).games,0,'waiting leader does not get ratings');
  assert.equal((await request(b,`/api/matches/${matchId}/result`,{scores:[{a:11,b:7}]})).status,409);
  await post(b,path+'/slot',{slot:4});await post(e,path+'/slot',{slot:1});
  const race=await Promise.all([request(c,path+'/slot',{slot:7}),request(d,path+'/slot',{slot:7})]);assert.deepEqual(race.map(result=>result.status).sort(),[200,409]);
  const snapshot=(await request(a,path)).json.room;assert.equal(snapshot.slots.filter(Boolean).length,7);assert.equal(new Set(snapshot.slots.filter(Boolean).map(player=>player.id)).size,7);
  await post(c,path+'/leave');await post(a,path+'/close');assert.equal((await request(f,'/api/rooms')).json.room,null);assert.equal((await request(f,path)).status,404);
  const second=await post(h,'/api/rooms');await post(b,`/api/rooms/${second.room.id}/slot`,{slot:1});assert.equal((await request(b,'/api/rooms',{})).status,409);
 }finally{db.close();}
});
