import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createPlayStore} from '../play-store.mjs';

function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec(`PRAGMA foreign_keys=ON;
  CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,email TEXT,password_hash TEXT,salt TEXT);
  CREATE TABLE profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT NOT NULL);`);
 class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
 let current=null,sequence=0;
 const handle=createPlayStore({db,session:()=>current,body:async()=>({}),send:(res,status,data)=>Object.assign(res,{status,data}),HttpError,
  storedProfile:(name,data)=>({name,...JSON.parse(data)})});
 function seed({rating=1200,games=1,wins=0,ready=true,name='Court Player',demoRating=4999}={}){
  const id=randomUUID(),code='SO-'+(++sequence).toString(16).toUpperCase().padStart(12,'0');
  const profile={name,avatarCreated:ready,skin:'#cf986c',shirt:'#ed795d',paddle:'#7286bb',hat:'cap',height:170,bodyType:'regular',characterType:'male',hairStyle:'short',hairColor:'#43352f',capId:'nike-court-cap',shirtId:'custom',bottomId:'nike-field-shorts',rating:demoRating,games:999,wins:998,history:[],email:'private-profile@example.invalid',token:'private-token'};
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,name,'private@example.invalid','private-hash','private-salt');
  db.prepare('INSERT INTO profiles VALUES(?,?)').run(id,JSON.stringify(profile));
  db.prepare('INSERT INTO play_players VALUES(?,?,?,?,?)').run(id,code,rating,games,wins);
  return{id,code};
 }
 async function request(actor,{method='GET',pathname='/api/leaderboard'}={}){
  current=actor;const res={};const handled=await handle({method},res,new URL(pathname,'http://localhost'));assert.equal(handled,true);return res.data;
 }
 return{db,seed,request};
}

test('leaderboard shares rating ranks and sorts ties by wins, games and stable player code',async t=>{
 const {seed,request}=fixture(t);
 const first=seed({rating:1600,games:8,wins:5}),second=seed({rating:1600,games:12,wins:5}),third=seed({rating:1600,games:12,wins:5}),fourth=seed({rating:1600,games:5,wins:4}),fifth=seed({rating:1500,games:1,wins:0});
 const result=await request(second);
 assert.deepEqual(result.entries.map(entry=>entry.player.id),[first.id,second.id,third.id,fourth.id,fifth.id]);
 assert.deepEqual(result.entries.map(entry=>entry.rank),[1,1,1,1,5]);
 assert.equal(result.me.rank,1);assert.equal(result.rankedPlayers,5);assert.equal(result.limit,100);
});

test('unplayed and unfinished avatars are unranked despite demo statistics',async t=>{
 const {seed,request}=fixture(t);
 const played=seed({rating:1300,games:2,wins:1,demoRating:100}),newcomer=seed({rating:1200,games:0,wins:0}),unfinished=seed({rating:9000,games:50,wins:50,ready:false});
 for(const actor of [newcomer,unfinished]){
  const result=await request(actor);assert.equal(result.me.rank,null);assert.equal(result.me.player.id,actor.id);
  assert.equal(result.rankedPlayers,1);assert.deepEqual(result.entries.map(entry=>entry.player.id),[played.id]);
  assert.equal(result.entries[0].player.rating,1300);assert.equal(result.entries[0].player.games,2);
 }
});

test('top 100 cap retains an own player outside it even when tied at the cutoff',async t=>{
 const {seed,request}=fixture(t);
 for(let i=0;i<98;i++)seed({rating:2000-i,games:1,wins:1});
 const tied=[seed({rating:1500,games:4,wins:2}),seed({rating:1500,games:4,wins:2}),seed({rating:1500,games:4,wins:2})];
 const result=await request(tied[2]);
 assert.equal(result.entries.length,100);assert.equal(result.rankedPlayers,101);assert.equal(result.me.rank,99);
 assert.equal(result.me.player.id,tied[2].id);assert.equal(result.entries.some(entry=>entry.player.id===tied[2].id),false);
 assert.deepEqual(result.entries.slice(-2).map(entry=>entry.rank),[99,99]);
});

test('leaderboard supplies own rank beyond 100 and reorders after an authoritative rating update',async t=>{
 const {db,seed,request}=fixture(t);
 for(let i=0;i<100;i++)seed({rating:2000-i});
 const actor=seed({rating:1200});
 const before=await request(actor);assert.equal(before.me.rank,101);assert.equal(before.entries.length,100);
 db.prepare('UPDATE play_players SET rating=2500,games=2,wins=1 WHERE user_id=?').run(actor.id);
 const after=await request(actor);assert.equal(after.me.rank,1);assert.equal(after.entries[0].player.id,actor.id);assert.equal(after.me.player.rating,2500);
});

test('leaderboard projects only public player and avatar fields',async t=>{
 const {seed,request}=fixture(t);const actor=seed({name:'<img src=x onerror=alert(1)>'});const result=await request(actor);
 for(const entry of [...result.entries,result.me]){
  assert.deepEqual(Object.keys(entry).sort(),['player','rank']);
  assert.deepEqual(Object.keys(entry.player).sort(),['avatar','code','games','id','name','rating','wins']);
  assert.deepEqual(Object.keys(entry.player.avatar).sort(),['bodyType','bottomId','capId','characterType','hairColor','hairStyle','hat','height','paddle','shirt','shirtId','skin']);
 }
 assert.doesNotMatch(JSON.stringify(result),/private-|password|salt|token|email|history/);
});

test('empty ladder still returns the current player and rejects missing authentication or mutations',async t=>{
 const {db,seed,request}=fixture(t);const actor=seed({games:0,wins:0,ready:false});
 const result=await request(actor);assert.deepEqual(result.entries,[]);assert.equal(result.rankedPlayers,0);assert.equal(result.me.rank,null);
 db.prepare('DELETE FROM play_players WHERE user_id=?').run(actor.id);
 const initialized=await request(actor);assert.match(initialized.me.player.code,/^SO-[A-F0-9]{12}$/);assert.equal(initialized.me.rank,null);
 await assert.rejects(request(null),{status:401});await assert.rejects(request(actor,{method:'POST'}),{status:404});
});
