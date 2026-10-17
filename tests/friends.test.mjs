import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';

test('private, consensual friend requests do not change rated play',{timeout:60000},async t=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'sideout-friends-test-'));
 const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,[path.join(root,'server.mjs')],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',SIDEOUT_DATA_DIR:dataDir,PUBLIC_ORIGIN:'',COOKIE_SECURE:'false'},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
 t.after(async()=>{if(child.exitCode===null){const exit=new Promise(resolve=>child.once('exit',resolve));child.kill();await exit;}await rm(dataDir,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error('Server exited '+code+' '+errors)));});
 const write=operation=>{const db=new DatabaseSync(path.join(dataDir,'sideout.sqlite'));try{return operation(db);}finally{db.close();}};
 async function request(route,{method='GET',data,cookie,foreignOrigin}={}){
  const headers={};if(cookie)headers.Cookie=cookie;if(data!==undefined){headers['Content-Type']='application/json';headers.Origin=foreignOrigin||origin;headers['X-Sideout-Request']='1';}
  const response=await fetch(origin+route,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});
  return{status:response.status,json:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 const post=(actor,route,data={})=>request(route,{method:'POST',cookie:actor.cookie,data});
 const view=async actor=>(await request('/api/friends',{cookie:actor.cookie})).json;
 const empty={friends:[],incoming:[],outgoing:[]};
 const actors=[];
 for(let i=0;i<7;i++){
  const signup=await request('/api/auth/signup',{method:'POST',data:{name:'Friend '+i,email:`friend-${i}@example.invalid`,password:'Friends-Test-2026'}});assert.equal(signup.status,201);
  const actor={id:signup.json.user.id,cookie:signup.cookie};actors.push(actor);
  if(i<6){assert.equal((await request('/api/profile',{method:'PUT',cookie:actor.cookie,data:{avatarCreated:true,rating:4999,games:12,wins:10}})).status,200);actor.code=(await request('/api/play',{cookie:actor.cookie})).json.player.code;}
 }
 const [a,b,c,d,e,f,unready]=actors;
 const ratingBefore=write(db=>db.prepare('SELECT * FROM play_players ORDER BY user_id').all());
 await t.test('access, origin, ready avatar and inputs are enforced',async()=>{
  assert.equal((await request('/api/friends')).status,401);
  assert.equal((await request('/api/friends/request',{method:'POST',data:{playerCode:b.code}})).status,401);
  assert.deepEqual(await view(unready),empty);
  assert.equal((await post(unready,'/api/friends/request',{playerCode:b.code})).status,409);
  assert.equal((await post(a,'/api/friends/request',{playerCode:a.code})).status,400);
  for(const playerCode of [null,7,'invalid','SO-FFFFFFFFFFFF'])assert.equal((await post(a,'/api/friends/request',{playerCode})).status,playerCode==='SO-FFFFFFFFFFFF'?404:400);
  assert.equal((await request('/api/friends/request',{method:'POST',cookie:a.cookie,foreignOrigin:'https://foreign.invalid',data:{playerCode:b.code}})).status,403);
  assert.equal((await post(a,'/api/friends/not-a-uuid/respond',{accept:true})).status,400);
  assert.equal((await post(a,'/api/friends/00000000-0000-4000-8000-000000000000/respond',{accept:true})).status,404);
 });
 let ab;
 await t.test('send, duplicate and crossed requests preserve one private pending relationship',async()=>{
  const sent=await post(a,'/api/friends/request',{playerCode:' '+b.code.toLowerCase()+' '});assert.equal(sent.status,201);ab=sent.json.outgoing[0].id;
  assert.equal(sent.json.outgoing.length,1);assert.equal(sent.json.outgoing[0].player.id,b.id);assert.ok(sent.json.outgoing[0].createdAt<=Date.now());
  const incoming=await view(b);assert.equal(incoming.incoming[0].id,ab);assert.equal(incoming.incoming[0].player.id,a.id);
  assert.deepEqual(await view(c),empty);
  const retry=await post(a,'/api/friends/request',{playerCode:b.code});assert.equal(retry.status,200);assert.deepEqual(retry.json,sent.json);
  const crossed=await post(b,'/api/friends/request',{playerCode:a.code});assert.equal(crossed.status,409);assert.match(crossed.json.error,/incoming requests/);
  assert.equal(write(db=>db.prepare("SELECT COUNT(*) AS total FROM play_friendships WHERE status='pending'").get()).total,1);
  const serial=JSON.stringify(incoming);for(const field of ['email','password_hash','salt','history','token_hash'])assert.equal(serial.includes('"'+field+'"'),false);
  assert.deepEqual(Object.keys(incoming.incoming[0]).sort(),['createdAt','id','player']);
  assert.deepEqual(Object.keys(incoming.incoming[0].player).sort(),['avatar','code','games','id','name','rating','wins']);
 });
 await t.test('only the recipient can respond; unrelated players cannot inspect or mutate the pair',async()=>{
  for(const action of ['respond','cancel','remove'])assert.equal((await post(c,`/api/friends/${ab}/${action}`,{accept:true})).status,404);
  assert.equal((await post(a,`/api/friends/${ab}/respond`,{accept:true})).status,403);
  assert.equal((await post(b,`/api/friends/${ab}/cancel`)).status,403);
  assert.equal((await post(b,`/api/friends/${ab}/respond`,{accept:'yes'})).status,400);
  assert.equal((await post(a,`/api/friends/${ab}/remove`)).status,409);
  assert.equal((await post(b,`/api/friends/${ab}/respond`,{accept:true})).status,200);
  assert.equal((await view(a)).friends[0].id,ab);assert.equal((await view(b)).friends[0].id,ab);
  assert.equal((await view(a)).outgoing.length,0);assert.equal((await view(b)).incoming.length,0);
  assert.equal((await post(b,`/api/friends/${ab}/respond`,{accept:true})).status,200);
  assert.equal((await post(b,`/api/friends/${ab}/respond`,{accept:false})).status,409);
  assert.equal((await post(a,'/api/friends/request',{playerCode:b.code})).status,200);
  assert.equal((await request('/api/play',{cookie:a.cookie})).json.duo,null);
  assert.deepEqual(await view(c),empty);
 });
 await t.test('either friend can remove; retries are safe and a new pair needs a 24-hour cooldown',async()=>{
  assert.equal((await post(b,`/api/friends/${ab}/remove`)).status,200);
  assert.deepEqual(await view(a),empty);assert.deepEqual(await view(b),empty);
  assert.equal((await post(a,`/api/friends/${ab}/remove`)).status,200);
  assert.equal((await post(a,'/api/friends/request',{playerCode:b.code})).status,429);
  assert.equal((await post(b,'/api/friends/request',{playerCode:a.code})).status,429);
  write(db=>db.prepare('UPDATE play_friendships SET updated_at=? WHERE id=?').run(Date.now()-25*60*60*1000,ab));
  const resend=await post(b,'/api/friends/request',{playerCode:a.code});assert.equal(resend.status,201);assert.notEqual(resend.json.outgoing[0].id,ab);
 });
 await t.test('decline and sender cancellation clear both views without deleting audit history',async()=>{
  const sent=await post(c,'/api/friends/request',{playerCode:d.code}),id=sent.json.outgoing[0].id;
  assert.equal((await post(d,`/api/friends/${id}/respond`,{accept:false})).status,200);
  assert.equal((await post(d,`/api/friends/${id}/respond`,{accept:false})).status,200);
  assert.equal((await post(d,`/api/friends/${id}/respond`,{accept:true})).status,409);
  assert.equal((await post(c,'/api/friends/request',{playerCode:d.code})).status,429);
  assert.deepEqual(await view(c),empty);assert.deepEqual(await view(d),empty);
  const cancelled=await post(e,'/api/friends/request',{playerCode:f.code}),cancelId=cancelled.json.outgoing[0].id;
  assert.equal((await post(e,`/api/friends/${cancelId}/cancel`)).status,200);
  assert.equal((await post(e,`/api/friends/${cancelId}/cancel`)).status,200);
  assert.equal((await post(f,`/api/friends/${cancelId}/respond`,{accept:true})).status,409);
  assert.equal((await post(e,'/api/friends/request',{playerCode:f.code})).status,429);
  assert.deepEqual(await view(e),empty);assert.deepEqual(await view(f),empty);
  const statuses=write(db=>db.prepare('SELECT status FROM play_friendships ORDER BY created_at,id').all()).map(row=>row.status);
  assert.ok(statuses.includes('removed'));assert.ok(statuses.includes('declined'));assert.ok(statuses.includes('cancelled'));
 });
 await t.test('concurrent duplicate and crossed sends create one active pair',async()=>{
  const duplicated=await Promise.all([post(c,'/api/friends/request',{playerCode:e.code}),post(c,'/api/friends/request',{playerCode:e.code})]);
  assert.deepEqual(duplicated.map(item=>item.status).sort(),[200,201]);
  assert.equal(duplicated[0].json.outgoing[0].id,duplicated[1].json.outgoing[0].id);
  const crossed=await Promise.all([post(d,'/api/friends/request',{playerCode:f.code}),post(f,'/api/friends/request',{playerCode:d.code})]);
  assert.deepEqual(crossed.map(item=>item.status).sort(),[201,409]);
  assert.equal(write(db=>db.prepare("SELECT COUNT(*) AS total FROM play_friendships WHERE status IN ('pending','accepted') AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))").get(d.id,f.id,f.id,d.id)).total,1);
  assert.deepEqual(write(db=>db.prepare('SELECT * FROM play_players ORDER BY user_id').all()),ratingBefore);
  assert.equal(write(db=>db.prepare('SELECT COUNT(*) AS total FROM play_matches').get()).total,0);
 });
 await t.test('hourly send and pending caps persist in the database and duplicates remain safe',async()=>{
  const base=write(db=>JSON.parse(db.prepare('SELECT data FROM profiles WHERE user_id=?').get(a.id).data));
  const targets=[];
  write(db=>{
   for(let i=0;i<21;i++){
    const id=randomUUID(),code='SO-'+i.toString(16).padStart(12,'0').toUpperCase();targets.push({id,code});
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id,`rate-${i}@example.invalid`,'Rate '+i,'x','y',Date.now());
    db.prepare('INSERT INTO profiles VALUES(?,?)').run(id,JSON.stringify({...base,name:'Rate '+i}));
    db.prepare('INSERT INTO play_players(user_id,code) VALUES(?,?)').run(id,code);
    if(i<20)db.prepare('INSERT INTO play_friendships VALUES(?,?,?,?,?,?)').run(randomUUID(),e.id,id,'pending',Date.now(),Date.now());
   }
  });
  assert.equal((await post(e,'/api/friends/request',{playerCode:targets[20].code})).status,429);
  assert.equal((await post(e,'/api/friends/request',{playerCode:targets[0].code})).status,200);
  write(db=>db.prepare('UPDATE play_friendships SET created_at=? WHERE from_id=?').run(Date.now()-2*60*60*1000,e.id));
  const capped=await post(e,'/api/friends/request',{playerCode:targets[20].code});assert.equal(capped.status,429);assert.match(capped.json.error,/20 pending/);
 });
 await t.test('failed acceptance rolls back and expired sessions lose access',async()=>{
  const incoming=(await view(e)).incoming.find(row=>row.player.id===c.id);
  write(db=>db.exec("CREATE TRIGGER block_friend_accept BEFORE UPDATE OF status ON play_friendships WHEN NEW.status='accepted' BEGIN SELECT RAISE(ABORT,'test rollback'); END;"));
  assert.equal((await post(e,`/api/friends/${incoming.id}/respond`,{accept:true})).status,500);
  assert.equal((await view(e)).incoming.find(row=>row.player.id===c.id).id,incoming.id);
  write(db=>db.exec('DROP TRIGGER block_friend_accept'));
  assert.equal((await post(e,`/api/friends/${incoming.id}/respond`,{accept:true})).status,200);
  write(db=>db.prepare('UPDATE sessions SET expires_at=0 WHERE user_id=?').run(f.id));
  assert.equal((await request('/api/friends',{cookie:f.cookie})).status,401);
  assert.equal((await post(f,'/api/friends/request',{playerCode:a.code})).status,401);
 });
});
