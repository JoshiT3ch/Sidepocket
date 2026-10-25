import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createPlayStore} from '../play-store.mjs';
import {createHostingStore} from '../hosting-store.mjs';

const baseTime=Date.parse('2026-10-25T08:00:00+08:00');
const fields={title:'Doubles Men Only',category:'men',capacity:30,date:'2026-10-26',startTime:'19:00',endTime:'22:00',venue:'Valencia Pickleball Court',address:'Valencia City, Bukidnon',fee:130,notes:'Bring water and your paddle.'};
function setup(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT);');
 class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
 const options={db,session:req=>req.user,body:async req=>req.data,send:(res,status,json)=>Object.assign(res,{status,json}),HttpError,storedProfile:(_name,data)=>JSON.parse(data)};
 const play=createPlayStore(options);let time=baseTime;const hosting=createHostingStore({...options,players:play.players,now:()=>time});
 const actors=Array.from({length:6},(_,i)=>({id:randomUUID(),name:i===0?'Fixture Host':`Fixture Player ${i}`}));
 for(const user of actors){db.prepare('INSERT INTO users VALUES(?,?)').run(user.id,user.name);db.prepare('INSERT INTO profiles VALUES(?,?)').run(user.id,JSON.stringify({name:user.name,avatarCreated:true,isVerified:true,verifiedUntil:'2099-01-01',email:'secret@fixture.invalid',token:'private-token',rating:9999}));play.players.player(user.id);}
 async function request(user,action='list',data={},method='POST'){const res={};try{await hosting({user,method,data:{action,data}},res,new URL('http://localhost/api/hosting'));return res;}catch(error){return{status:error.status||500,json:{error:error.message}};}}
 async function ok(user,action,data){const r=await request(user,action,data);assert.equal(r.status,200,JSON.stringify(r));return r.json;}
 const verify=user=>db.prepare('INSERT INTO player_verifications VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET verified_until=excluded.verified_until').run(user.id,time+86400000);
 const create=async(user=actors[0],data={})=>{verify(user);return(await ok(user,'create',{...fields,...data})).selectedEvent;};
 return{db,actors,request,ok,verify,create,setTime:value=>{time=value;}};
}

test('hosting authenticates, derives protected verification and never publishes fixture events automatically',async t=>{
 const c=setup(t),[a,b]=c.actors;
 assert.equal((await c.request(null)).status,401);assert.equal((await c.request(a,'list',{},'GET')).status,404);
 const empty=await c.ok(a,'list',{scope:'upcoming'});assert.deepEqual(empty.events,[]);assert.equal(empty.selectedEvent,null);assert.equal(empty.me.isVerified,false);assert.equal(empty.me.player.isVerified,false);
 assert.equal((await c.request(a,'create',fields)).status,403,'profile flag cannot verify');
 c.verify(a);const event=(await c.ok(a,'create',{...fields,hostId:b.id,isVerified:true,confirmedCount:30})).selectedEvent;
 assert.equal(event.host.id,a.id);assert.equal(event.confirmedCount,1);assert.equal(event.capacity,30);assert.equal(event.myStatus,'confirmed');assert.equal(event.fee,130);
 assert.deepEqual(event.participants.map(p=>p.id),[a.id]);assert.equal(event.host.isVerified,true);assert.equal(event.startsAt,'2026-10-26T11:00:00.000Z');assert.equal(event.endsAt,'2026-10-26T14:00:00.000Z');
 const serialized=JSON.stringify(await c.ok(b,'list',{eventId:event.id}));assert.doesNotMatch(serialized,/secret@fixture|private-token|verifiedUntil/);assert.doesNotMatch(serialized,/9999/);
 for(const data of [{eventId:null},{eventId:{}},{eventId:'bad'},{scope:'everyone'}])assert.equal((await c.request(a,'list',data)).status,400);
 assert.equal((await c.request(a,'invent',{})).status,404);assert.equal((await c.request(a,'list',[])).status,400);
});

test('join requests stay private, repeat safely and require host approval',async t=>{
 const c=setup(t),[a,b,d]=c.actors,event=await c.create();
 let own=await c.ok(b,'request',{eventId:event.id,userId:d.id,status:'confirmed'});assert.equal(own.selectedEvent.myStatus,'requested');assert.equal(own.selectedEvent.confirmedCount,1);assert.deepEqual(own.selectedEvent.requests,[]);
 await c.ok(b,'request',{eventId:event.id});assert.equal(c.db.prepare('SELECT COUNT(*) count FROM hosting_participants WHERE event_id=? AND user_id=?').get(event.id,b.id).count,1);
 assert.deepEqual((await c.ok(d,'list',{eventId:event.id})).selectedEvent.requests,[]);
 const host=await c.ok(a,'list',{eventId:event.id});assert.equal(host.selectedEvent.requests.length,1);assert.equal(host.selectedEvent.requests[0].player.id,b.id);
 assert.equal((await c.request(d,'respond',{eventId:event.id,userId:b.id,accept:true})).status,403);
 assert.equal((await c.request(a,'respond',{eventId:event.id,userId:b.id,accept:'true'})).status,400);
 own=await c.ok(a,'respond',{eventId:event.id,userId:b.id,accept:true});assert.equal(own.selectedEvent.confirmedCount,2);assert.deepEqual(own.selectedEvent.requests,[]);
 await c.ok(a,'respond',{eventId:event.id,userId:b.id,accept:true});assert.equal((await c.ok(b,'request',{eventId:event.id})).selectedEvent.myStatus,'confirmed');
 assert.equal((await c.request(a,'respond',{eventId:event.id,userId:a.id,accept:false})).status,409);
 const mine=await c.ok(b,'list',{scope:'mine'});assert.deepEqual(mine.events.map(e=>e.id),[event.id]);assert.deepEqual((await c.ok(d,'list',{scope:'mine'})).events,[]);
});

test('atomic approval protects the last seat and withdrawal releases it without leaving another account',async t=>{
 const c=setup(t),[a,b,d,e]=c.actors,event=await c.create(a,{capacity:2});
 await c.ok(b,'request',{eventId:event.id});await c.ok(d,'request',{eventId:event.id});
 const race=await Promise.all([c.request(a,'respond',{eventId:event.id,userId:b.id,accept:true}),c.request(a,'respond',{eventId:event.id,userId:d.id,accept:true})]);
 assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal(c.db.prepare("SELECT COUNT(*) count FROM hosting_participants WHERE event_id=? AND status='confirmed'").get(event.id).count,2);
 assert.equal((await c.request(e,'request',{eventId:event.id})).status,409);
 await c.ok(b,'request',{eventId:event.id});await c.ok(d,'request',{eventId:event.id});
 const withdrawn=await c.ok(b,'rsvp',{eventId:event.id,status:'declined',userId:d.id});assert.equal(withdrawn.selectedEvent.myStatus,'declined');assert.equal(withdrawn.selectedEvent.confirmedCount,1);
 assert.equal(c.db.prepare('SELECT status FROM hosting_participants WHERE event_id=? AND user_id=?').get(event.id,d.id).status,'requested');
 await c.ok(a,'respond',{eventId:event.id,userId:d.id,accept:true});assert.equal((await c.ok(d,'rsvp',{eventId:event.id,status:'maybe'})).selectedEvent.confirmedCount,1);
 assert.equal((await c.request(a,'rsvp',{eventId:event.id,status:'declined'})).status,409);assert.equal((await c.request(e,'rsvp',{eventId:event.id,status:'confirmed'})).status,400);
});

test('host can decline requests, users can change RSVP and re-request with no leaked applicants',async t=>{
 const c=setup(t),[a,b,d]=c.actors,event=await c.create();
 await c.ok(b,'request',{eventId:event.id});await c.ok(a,'respond',{eventId:event.id,userId:b.id,accept:false});await c.ok(a,'respond',{eventId:event.id,userId:b.id,accept:false});
 assert.equal((await c.ok(b,'list',{eventId:event.id})).selectedEvent.myStatus,'declined');await c.ok(b,'request',{eventId:event.id});
 assert.equal((await c.ok(b,'rsvp',{eventId:event.id,status:'maybe'})).selectedEvent.myStatus,'maybe');await c.ok(b,'request',{eventId:event.id});
 const visitor=await c.ok(d,'list',{eventId:event.id});assert.equal(visitor.selectedEvent.myStatus,null);assert.deepEqual(visitor.selectedEvent.requests,[]);assert.deepEqual(visitor.selectedEvent.participants.map(p=>p.id),[a.id]);
});

test('edits require current verified ownership and cannot lower capacity below confirmed players',async t=>{
 const c=setup(t),[a,b,d]=c.actors,event=await c.create();c.verify(d);
 await c.ok(b,'request',{eventId:event.id});await c.ok(a,'respond',{eventId:event.id,userId:b.id,accept:true});
 assert.equal((await c.request(d,'edit',{...fields,eventId:event.id})).status,403);
 await c.ok(d,'request',{eventId:event.id});await c.ok(a,'respond',{eventId:event.id,userId:d.id,accept:true});
 assert.equal((await c.request(a,'edit',{...fields,eventId:event.id,capacity:2})).status,409);
 await c.ok(d,'rsvp',{eventId:event.id,status:'declined'});
 const edited=await c.ok(a,'edit',{...fields,eventId:event.id,title:'Mixed doubles evening',category:'mixed',capacity:2,fee:0});assert.equal(edited.selectedEvent.title,'Mixed doubles evening');assert.equal(edited.selectedEvent.confirmedCount,2);
 assert.equal((await c.request(d,'request',{eventId:event.id})).status,409);
 c.db.prepare('UPDATE player_verifications SET verified_until=? WHERE user_id=?').run(baseTime-1,a.id);
 assert.equal((await c.request(a,'edit',{...fields,eventId:event.id})).status,403);assert.equal((await c.request(a,'create',fields)).status,403);
 const cancelled=await c.ok(a,'cancel',{eventId:event.id});assert.equal(cancelled.selectedEvent.status,'cancelled');assert.equal(cancelled.scope,'mine');await c.ok(a,'cancel',{eventId:event.id});
 assert.equal((await c.request(b,'cancel',{eventId:event.id})).status,403);assert.equal((await c.request(d,'request',{eventId:event.id})).status,409);assert.deepEqual((await c.ok(b,'list',{})).events,[]);
});

test('host approval and cancellation remain accessible after verification expiry',async t=>{
 const c=setup(t),[a,b]=c.actors,event=await c.create();await c.ok(b,'request',{eventId:event.id});c.db.prepare('DELETE FROM player_verifications WHERE user_id=?').run(a.id);
 const approved=await c.ok(a,'respond',{eventId:event.id,userId:b.id,accept:true});assert.equal(approved.me.isVerified,false);assert.equal(approved.selectedEvent.confirmedCount,2);
 await c.ok(a,'cancel',{eventId:event.id});
});

test('dates, times, fee and capacity are validated without normalizing impossible calendar dates',async t=>{
 const c=setup(t),[a]=c.actors;c.verify(a);
 const invalid=[{date:'2026-10-23'},{date:'2026-02-30'},{date:'2027-10-27'},{date:'2026-10-25',startTime:'08:00'},{startTime:'22:00',endTime:'02:00'},{startTime:'01:00',endTime:'23:00'},{startTime:'24:00'},{endTime:'19:00'},{category:'unknown'},{capacity:1},{capacity:101},{capacity:2.5},{capacity:'30'},{fee:-1},{fee:10001},{fee:1.5},{fee:'130'},{venue:'x'},{address:'x'},{title:'x'},{notes:'x'.repeat(1501)}];
 for(const change of invalid)assert.equal((await c.request(a,'create',{...fields,...change})).status,400,JSON.stringify(change));
 assert.equal(c.db.prepare('SELECT COUNT(*) count FROM hosted_events').get().count,0);
 const free=await c.ok(a,'create',{...fields,fee:0,capacity:100});assert.equal(free.selectedEvent.fee,0);assert.equal(free.selectedEvent.capacity,100);
});

test('past scope is based on actual end time, ended events reject changes and deletion cascades',async t=>{
 const c=setup(t),[a,b]=c.actors,event=await c.create();await c.ok(b,'request',{eventId:event.id});
 assert.deepEqual((await c.ok(a,'list',{scope:'past'})).events,[]);
 c.setTime(Date.parse('2026-10-27T00:00:00+08:00'));
 assert.deepEqual((await c.ok(a,'list',{scope:'upcoming'})).events,[]);assert.equal((await c.ok(a,'list',{scope:'past'})).events[0].id,event.id);
 assert.equal((await c.request(b,'request',{eventId:event.id})).status,409);assert.equal((await c.request(a,'respond',{eventId:event.id,userId:b.id,accept:true})).status,409);assert.equal((await c.request(a,'cancel',{eventId:event.id})).status,409);
 c.db.prepare('DELETE FROM hosted_events WHERE id=?').run(event.id);assert.equal(c.db.prepare('SELECT COUNT(*) count FROM hosting_participants').get().count,0);
 assert.equal((await c.request(b,'list',{eventId:event.id})).status,404);
});
