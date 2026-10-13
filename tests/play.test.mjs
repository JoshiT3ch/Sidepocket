import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {DatabaseSync} from 'node:sqlite';

test('QR duos and server-owned doubles ratings',{timeout:60000},async t=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'sideout-play-test-'));
 const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,[path.join(root,'server.mjs')],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',SIDEOUT_DATA_DIR:dataDir,PUBLIC_ORIGIN:'',COOKIE_SECURE:'false'},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
 t.after(async()=>{if(child.exitCode===null){const exit=new Promise(resolve=>child.once('exit',resolve));child.kill();await exit;}await rm(dataDir,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error('Server exited '+code+' '+errors)));});
 async function request(route,{method='GET',data,cookie,foreignOrigin}={}){
  const headers={};if(cookie)headers.Cookie=cookie;if(data!==undefined){headers['Content-Type']='application/json';headers.Origin=foreignOrigin||origin;headers['X-Sideout-Request']='1';}
  const response=await fetch(origin+route,{method,headers,body:data!==undefined?JSON.stringify(data):undefined});
  return{status:response.status,json:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 const write=operation=>{const db=new DatabaseSync(path.join(dataDir,'sideout.sqlite'));try{return operation(db);}finally{db.close();}};
 async function post(actor,route,data={}){return request(route,{method:'POST',data,cookie:actor.cookie});}
 async function view(actor){return(await request('/api/play',{cookie:actor.cookie})).json;}
 const actors=[];
 for(let i=0;i<6;i++){
  const signup=await request('/api/auth/signup',{method:'POST',data:{name:'Player '+i,email:`play-${i}@example.invalid`,password:'Play-Test-2026'}});assert.equal(signup.status,201);
  const actor={id:signup.json.user.id,cookie:signup.cookie};actors.push(actor);
  if(i<5)assert.equal((await request('/api/profile',{method:'PUT',cookie:actor.cookie,data:{avatarCreated:true,rating:4999,games:12,wins:10}})).status,200);
 }
 const [a,b,c,d,e,unready]=actors;
 await t.test('login and avatar completion are required, and legacy accounts get stable private-safe codes',async()=>{
  assert.equal((await request('/api/play')).status,401);
  assert.equal((await request('/api/play',{cookie:unready.cookie})).status,409);
  for(const actor of actors.slice(0,5)){
   const play=await view(actor);actor.code=play.player.code;
   assert.match(actor.code,/^SO-[A-F0-9]{12}$/);assert.equal(play.player.rating,1200);assert.equal(play.player.games,0);assert.equal(play.player.wins,0);
   assert.equal(play.player.email,undefined);assert.equal(play.player.password_hash,undefined);assert.equal(play.player.avatar.avatarCreated,undefined);assert.equal(play.duo,null);
   assert.equal((await view(actor)).player.code,actor.code);
  }
  assert.equal(new Set(actors.slice(0,5).map(actor=>actor.code)).size,5);
  const lookup=await request('/api/players/'+a.code.toLowerCase(),{cookie:b.cookie});assert.equal(lookup.status,200);assert.deepEqual(lookup.json.player,(await view(a)).player);
  assert.equal((await request('/api/players/'+a.code)).status,401);
  assert.equal((await request('/api/players/SO-FFFFFFFFFFFF',{cookie:a.cookie})).status,404);
  assert.equal((await request('/api/players/bad-code',{cookie:a.cookie})).status,400);
  assert.equal((await request('/api/duos',{method:'POST',data:{playerCode:b.code},cookie:a.cookie,foreignOrigin:'https://other.invalid'})).status,403);
 });
 await t.test('duo invitations reject self pairing and require only the invited partner to accept',async()=>{
  assert.equal((await post(a,'/api/duos',{playerCode:a.code})).status,400);
  assert.equal((await post(a,'/api/duos',{playerCode:b.code})).status,201);
  assert.equal((await post(b,'/api/duos',{playerCode:a.code})).status,409);
  const invite=(await view(b)).invitations[0];assert.equal(invite.from.id,a.id);assert.ok(invite.expiresAt>Date.now());
  assert.equal((await post(e,`/api/duos/${invite.id}/respond`,{accept:true})).status,403);
  assert.equal((await post(a,`/api/duos/${invite.id}/respond`,{accept:true})).status,403);
  assert.equal((await post(b,`/api/duos/${invite.id}/respond`,{accept:'yes'})).status,400);
  const accepted=await post(b,`/api/duos/${invite.id}/respond`,{accept:true});assert.equal(accepted.status,200);assert.equal(accepted.json.duo.players.length,2);assert.equal(accepted.json.invitations.length,0);
  assert.equal((await view(a)).duo.id,accepted.json.duo.id);
  assert.equal((await post(b,`/api/duos/${invite.id}/respond`,{accept:true})).status,409);
  assert.equal((await post(e,'/api/duos',{playerCode:a.code})).status,409);
  assert.equal((await post(a,'/api/matches',{playerCode:e.code})).status,409);
  assert.equal((await post(a,'/api/matches',{playerCode:b.code})).status,400);
 });
 await t.test('expired and declined invitations leave both players free to choose a duo',async()=>{
  assert.equal((await post(c,'/api/duos',{playerCode:d.code})).status,201);
  let invite=(await view(d)).invitations[0];
  write(db=>db.prepare('UPDATE play_duo_invitations SET expires_at=0 WHERE id=?').run(invite.id));
  assert.equal((await post(d,`/api/duos/${invite.id}/respond`,{accept:true})).status,409);assert.equal((await view(d)).invitations.length,0);
  assert.equal((await post(c,'/api/duos',{playerCode:d.code})).status,201);invite=(await view(d)).invitations[0];
  assert.equal((await post(d,`/api/duos/${invite.id}/respond`,{accept:false})).status,200);assert.equal((await view(c)).duo,null);
  assert.equal((await post(c,'/api/duos',{playerCode:d.code})).status,201);invite=(await view(d)).invitations[0];assert.equal((await post(d,`/api/duos/${invite.id}/respond`,{accept:true})).status,200);
  const other=(await request('/api/players/'+d.code,{cookie:a.cookie})).json;assert.equal(other.duo.players.length,2);assert.notEqual(other.duo.id,(await view(a)).duo.id);
 });
 let match;
 await t.test('a doubles challenge reserves all four players and the opposing side accepts',async()=>{
  write(db=>{db.prepare('UPDATE play_players SET rating=1700 WHERE user_id=?').run(a.id);db.prepare('UPDATE play_players SET rating=1500 WHERE user_id=?').run(b.id);});
  const result=await post(a,'/api/matches',{playerCode:c.code,rating:5000});assert.equal(result.status,201);match=result.json.matches[0];
  assert.equal(match.status,'pending');assert.deepEqual(match.preview,{a:22,b:38});assert.equal(match.teams.a.length,2);assert.equal(match.teams.b.length,2);
  assert.equal((await post(a,'/api/matches',{playerCode:c.code})).status,409);
  assert.equal((await post(b,'/api/duos/leave')).status,409);
  assert.equal((await post(c,'/api/duos/leave')).status,409);
  assert.equal((await post(e,`/api/matches/${match.id}/respond`,{accept:true})).status,403);
  assert.equal((await post(a,`/api/matches/${match.id}/respond`,{accept:true})).status,403);
  assert.equal((await post(d,`/api/matches/${match.id}/result`,{winnerSide:'b'})).status,409);
  const accepted=await post(d,`/api/matches/${match.id}/respond`,{accept:true});assert.equal(accepted.status,200);assert.equal(accepted.json.matches[0].status,'active');
  assert.equal((await post(c,`/api/matches/${match.id}/respond`,{accept:true})).status,409);
  assert.equal((await view(e)).matches.length,0);
 });
 await t.test('one participant reports once and all four real ratings change immediately',async()=>{
  assert.equal((await post(e,`/api/matches/${match.id}/result`,{winnerSide:'b'})).status,403);
  assert.equal((await post(a,`/api/matches/${match.id}/result`,{winnerSide:'wrong'})).status,400);
  const completed=await post(c,`/api/matches/${match.id}/result`,{winnerSide:'b',deltas:[{playerId:c.id,after:5000}]});assert.equal(completed.status,200);
  const game=completed.json.matches.find(item=>item.id===match.id);assert.equal(game.status,'completed');assert.equal(game.reportedBy,c.id);assert.equal(game.winnerSide,'b');assert.ok(game.completedAt);
  assert.deepEqual(game.deltas.map(item=>item.delta),[-38,-38,38,38]);
  for(const [actor,rating,win]of [[a,1662,0],[b,1462,0],[c,1238,1],[d,1238,1]]){const play=await view(actor);assert.equal(play.player.rating,rating);assert.equal(play.player.games,1);assert.equal(play.player.wins,win);assert.equal(play.history[0].id,match.id);}
  const demo=(await request('/api/profile',{cookie:a.cookie})).json.profile;assert.equal(demo.rating,4999);assert.equal(demo.games,12);assert.equal(demo.wins,10);
  assert.equal((await request('/api/profile',{method:'PUT',cookie:a.cookie,data:{rating:5000}})).status,200);assert.equal((await view(a)).player.rating,1662);
  assert.equal((await post(d,`/api/matches/${match.id}/result`,{winnerSide:'a'})).status,409);
  assert.equal((await post(a,`/api/matches/${match.id}/cancel`)).status,409);assert.equal((await view(a)).player.rating,1662);
 });
 await t.test('expected wins add fewer points and completed games release the duos',async()=>{
  const created=await post(b,'/api/matches',{playerCode:d.code});assert.equal(created.status,201);const pending=created.json.matches.find(item=>item.status==='pending');assert.ok(pending.preview.a<pending.preview.b);
  assert.equal((await post(c,`/api/matches/${pending.id}/respond`,{accept:true})).status,200);
  const result=await post(a,`/api/matches/${pending.id}/result`,{winnerSide:'a'});assert.equal(result.status,200);const complete=result.json.matches.find(item=>item.id===pending.id);assert.equal(complete.deltas[0].delta,pending.preview.a);assert.ok(complete.deltas[0].delta<30);
  assert.equal((await view(b)).player.games,2);
 });
 await t.test('cancelled, declined and expired games never affect ratings and duos can leave',async()=>{
  const before=(await view(a)).player.rating;
  const first=await post(a,'/api/matches',{playerCode:c.code});let game=first.json.matches.find(item=>item.status==='pending');assert.equal((await post(c,`/api/matches/${game.id}/respond`,{accept:false})).status,200);assert.equal((await view(a)).player.rating,before);
  const second=await post(a,'/api/matches',{playerCode:c.code});game=second.json.matches.find(item=>item.status==='pending');write(db=>db.prepare('UPDATE play_matches SET expires_at=0 WHERE id=?').run(game.id));assert.equal((await post(c,`/api/matches/${game.id}/respond`,{accept:true})).status,409);
  const third=await post(a,'/api/matches',{playerCode:c.code});game=third.json.matches.find(item=>item.status==='pending');assert.equal((await post(c,`/api/matches/${game.id}/respond`,{accept:true})).status,200);assert.equal((await post(b,`/api/matches/${game.id}/cancel`)).status,200);
  assert.equal((await post(d,`/api/matches/${game.id}/result`,{winnerSide:'a'})).status,409);assert.equal((await view(a)).player.rating,before);
  assert.equal((await post(a,'/api/duos/leave')).status,200);assert.equal((await view(b)).duo,null);assert.equal((await view(c)).duo.players.length,2);
  assert.equal((await post(b,'/api/duos/leave')).status,409);
 });
 await t.test('result updates roll back all four players if any update fails',async()=>{
  await post(a,'/api/duos',{playerCode:b.code});const invite=(await view(b)).invitations[0];await post(b,`/api/duos/${invite.id}/respond`,{accept:true});
  const created=await post(a,'/api/matches',{playerCode:c.code});const game=created.json.matches.find(item=>item.status==='pending');await post(c,`/api/matches/${game.id}/respond`,{accept:true});
  const before=await Promise.all([a,b,c,d].map(view));
  write(db=>db.exec(`CREATE TRIGGER block_test_rating BEFORE UPDATE OF rating ON play_players WHEN NEW.user_id='${d.id}' BEGIN SELECT RAISE(ABORT,'test rollback'); END;`));
  const result=await post(a,`/api/matches/${game.id}/result`,{winnerSide:'a'});assert.equal(result.status,500);
  for(let i=0;i<4;i++){const after=await view(actors[i]);assert.deepEqual(after.player,before[i].player);assert.equal(after.matches.find(item=>item.id===game.id).status,'active');}
  write(db=>db.exec('DROP TRIGGER block_test_rating'));
  assert.equal((await post(d,`/api/matches/${game.id}/result`,{winnerSide:'b'})).status,200);
 });
 await t.test('winning above 5000 still earns the full 20–40 award',async()=>{
  write(db=>{db.prepare('UPDATE play_players SET rating=4998 WHERE user_id=?').run(a.id);db.prepare('UPDATE play_players SET rating=5100 WHERE user_id=?').run(b.id);});
  const created=await post(a,'/api/matches',{playerCode:c.code});const game=created.json.matches.find(item=>item.status==='pending');assert.equal(game.preview.a,20);
  await post(c,`/api/matches/${game.id}/respond`,{accept:true});const result=await post(b,`/api/matches/${game.id}/result`,{winnerSide:'a'});assert.equal(result.status,200);
  assert.equal((await view(a)).player.rating,5018);assert.equal((await view(b)).player.rating,5120);assert.deepEqual(result.json.matches.find(item=>item.id===game.id).deltas.slice(0,2).map(item=>item.delta),[20,20]);
 });
 await t.test('expired sessions cannot look up players or submit results',async()=>{
  write(db=>db.prepare('UPDATE sessions SET expires_at=0 WHERE user_id=?').run(e.id));
  assert.equal((await request('/api/players/'+a.code,{cookie:e.cookie})).status,401);assert.equal((await post(e,'/api/duos',{playerCode:a.code})).status,401);
 });
});
