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

test('four players rearrange through two transfer slots and play one scored set to 11',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT);');
  class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
  const options={db,session:req=>req.user,body:async req=>req.data||{},send:(res,status,json)=>Object.assign(res,{status,json}),HttpError,storedProfile:(_name,data)=>JSON.parse(data)};
  const play=createPlayStore(options),rooms=createRoomStore({...options,players:play.players});
  const actors=Array.from({length:6},(_,i)=>({id:randomUUID(),name:`Room Player ${i}`}));
  for(const actor of actors){db.prepare('INSERT INTO users VALUES(?,?)').run(actor.id,actor.name);db.prepare('INSERT INTO profiles VALUES(?,?)').run(actor.id,JSON.stringify({name:actor.name,avatarCreated:true}));play.players.player(actor.id);}
  const [a,b,c,d,e,f]=actors,format={bestOf:1,pointsToWin:11,winBy:2};
  async function request(user,path,data){const res={};try{await (path.startsWith('/api/rooms')?rooms:play)({user,method:data===undefined?'GET':'POST',data},res,new URL(path,'http://localhost'));return res;}catch(error){return{status:error.status||500,json:{error:error.message}};}}
  const post=async(user,path,data={})=>{const result=await request(user,path,data);assert.ok(result.status<300,JSON.stringify(result));return result.json;};
  assert.equal((await request(null,'/api/rooms')).status,401);
  const initial=await post(a,'/api/rooms'),id=initial.room.id,path=`/api/rooms/${id}`;
  assert.equal(initial.room.leaderId,a.id);assert.equal(initial.room.slots.length,6);assert.equal(initial.room.transferSlots,2);
  assert.equal((await request(b,path)).json.room.slots.filter(Boolean).length,1,'reading QR does not join');
  assert.equal((await request(a,'/api/rooms',{})).status,409);
  assert.match((await request(e,path+'/slot',{slot:4})).json.error,/only for players moving/);
  await post(b,path+'/slot',{slot:1});await post(c,path+'/slot',{slot:2});await post(d,path+'/slot',{slot:3});
  assert.equal((await request(b,path+'/start',{format})).status,403);assert.equal((await request(b,path+'/close',{})).status,403);
  for(const user of [a,b])assert.equal((await request(user,path+'/waiting',{})).status,404,'extra slots cannot be added');
  assert.equal((await request(a,path+'/slot',{slot:6})).status,400);
  assert.equal((await request(b,path+'/slot',{slot:0})).status,409);assert.equal((await request(b,path)).json.room.slots[1].id,b.id,'a failed move retains its old slot');
  await post(a,path+'/slot',{slot:4});
  assert.match((await request(e,path+'/slot',{slot:0})).json.error,/already has four players/,'a QR visitor cannot take a slot freed during a transfer');
  assert.equal((await request(a,path+'/start',{format})).status,409,'all four playing positions must be filled');
  await post(c,path+'/slot',{slot:5});
  assert.deepEqual((await request(a,path)).json.room.slots.slice(4).map(player=>player.id),[a.id,c.id]);
  await post(c,path+'/slot',{slot:0});await post(a,path+'/slot',{slot:2});
  let snapshot=(await request(a,path)).json.room;
  assert.deepEqual(snapshot.slots.slice(0,4).map(player=>player.id),[c.id,b.id,a.id,d.id]);assert.deepEqual(snapshot.slots.slice(4),[null,null]);
  const race=await Promise.all([request(a,path+'/slot',{slot:4}),request(b,path+'/slot',{slot:4})]);assert.deepEqual(race.map(result=>result.status).sort(),[200,409]);
  const moved=race[0].status===200?a:b;await post(moved,path+'/slot',{slot:moved===a?2:1});
  const started=await post(a,path+'/start',{format:{bestOf:5,pointsToWin:21,winBy:1}}),matchId=started.room.matchId;
  assert.equal(started.room.matchActive,true);assert.equal(db.prepare('SELECT created_by FROM play_matches WHERE id=?').get(matchId).created_by,a.id);
  assert.deepEqual(JSON.parse(db.prepare('SELECT format FROM play_matches WHERE id=?').get(matchId).format),format,'client input cannot change room scoring');
  assert.equal((await request(a,path+'/start',{})).status,409);assert.equal((await request(b,path+'/slot',{slot:4})).status,409);assert.equal((await request(a,path+'/close',{})).status,409);
  assert.equal((await request(b,path+'/leave',{})).status,409);assert.equal((await request(f,`/api/matches/${matchId}/result`,{scores:[{a:11,b:7}]})).status,403);
  for(const scores of [[{a:11,b:10}],[{a:10,b:8}],[{a:11,b:7},{a:11,b:8}]])assert.equal((await request(b,`/api/matches/${matchId}/result`,{scores})).status,400);
  const completed=await post(b,`/api/matches/${matchId}/result`,{scores:[{a:12,b:10}]});assert.equal(completed.history[0].status,'completed');
  assert.equal(play.players.player(e.id).games,0);assert.equal(play.players.player(f.id).games,0);
  for(const actor of [a,b,c,d])assert.equal(play.players.player(actor.id).games,1,'each of the four participants is rated exactly once');
  assert.equal((await request(b,`/api/matches/${matchId}/result`,{scores:[{a:12,b:10}]})).status,409);
  const next=await post(a,path+'/start');assert.deepEqual(JSON.parse(db.prepare('SELECT format FROM play_matches WHERE id=?').get(next.room.matchId).format),format,'omitted format still uses the standard');
  await post(b,`/api/matches/${next.room.matchId}/cancel`);await post(c,path+'/leave');await post(a,path+'/close');
  assert.equal((await request(d,'/api/rooms')).json.room,null);assert.equal((await request(d,path)).status,404);
  const second=await post(f,'/api/rooms');await post(b,`/api/rooms/${second.room.id}/slot`,{slot:1});assert.equal((await request(b,'/api/rooms',{})).status,409);
 }finally{db.close();}
});

test('legacy rooms require rearrangement before initialization without losing memberships',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT);');
  const options={db,session:()=>null,body:async()=>({}),send:()=>{},HttpError:Error,storedProfile:(_name,data)=>JSON.parse(data)};
  const play=createPlayStore(options);createRoomStore({...options,players:play.players});
  const ids=Array.from({length:5},()=>randomUUID()),id=randomUUID();
  for(const user of ids)db.prepare('INSERT INTO users VALUES(?,?)').run(user,'Legacy player');
  db.prepare('INSERT INTO play_rooms(id,leader_id,waiting_slots,created_at) VALUES(?,?,12,0)').run(id,ids[0]);
  db.prepare('INSERT INTO play_room_members VALUES(?,?,7)').run(ids[0],id);
  assert.throws(()=>createRoomStore({...options,players:play.players}),/Existing rooms exceed four players/);
  assert.equal(db.prepare('SELECT slot FROM play_room_members WHERE user_id=?').get(ids[0]).slot,7);
  db.prepare('UPDATE play_room_members SET slot=0').run();
  ids.slice(1).forEach((user,index)=>db.prepare('INSERT INTO play_room_members VALUES(?,?,?)').run(user,id,index+1));
  assert.throws(()=>createRoomStore({...options,players:play.players}),/Existing rooms exceed four players/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM play_room_members').get().count,5);
  db.prepare('DELETE FROM play_room_members WHERE user_id=?').run(ids[4]);
  createRoomStore({...options,players:play.players});
  assert.equal(db.prepare('SELECT waiting_slots FROM play_rooms WHERE id=?').get(id).waiting_slots,2);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM play_room_members').get().count,4);
 }finally{db.close();}
});
