import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {DatabaseSync} from 'node:sqlite';
import {createPlayStore} from '../play-store.mjs';

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
 await t.test('consented duo links require login, avatars, valid opaque tokens and rotate old links',async()=>{
  assert.equal((await request('/api/duos/link',{method:'POST',data:{}})).status,401);
  assert.equal((await request('/api/duos/join',{method:'POST',data:{token:a.code}})).status,401);
  assert.equal((await post(unready,'/api/duos/link')).status,409);
  assert.equal((await post(a,'/api/duos/join',{token:a.code})).status,400);
  assert.equal((await post(a,'/api/duos/join',{token:'00000000-0000-4000-8000-000000000000'})).status,404);
  const first=await post(a,'/api/duos/link');assert.equal(first.status,201);
  assert.match(first.json.token,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.deepEqual(Object.keys(first.json).sort(),['expiresAt','token']);
  assert.ok(first.json.expiresAt>Date.now()+23*60*60*1000&&first.json.expiresAt<=Date.now()+24*60*60*1000);
  assert.equal((await post(a,'/api/duos/join',{token:first.json.token})).status,400);
  assert.equal((await post(unready,'/api/duos/join',{token:first.json.token})).status,409);
  const next=await post(a,'/api/duos/link');assert.notEqual(next.json.token,first.json.token);
  assert.equal((await post(b,'/api/duos/join',{token:first.json.token})).status,409);
  write(db=>db.prepare('UPDATE play_duo_links SET expires_at=0 WHERE token=?').run(next.json.token));
  assert.equal((await post(b,'/api/duos/join',{token:next.json.token})).status,409);
  assert.equal((await view(a)).duo,null);assert.equal((await view(b)).duo,null);
 });
 await t.test('a link joins once, cancels pending invites, retries safely and cannot recreate a left duo',async()=>{
  await post(e,'/api/duos',{playerCode:a.code});
  const ownerLink=(await post(a,'/api/duos/link')).json,partnerLink=(await post(b,'/api/duos/link')).json;
  const pair=await post(b,'/api/duos/join',{token:ownerLink.token});assert.equal(pair.status,200);
  const duoId=pair.json.duo.id;assert.deepEqual(pair.json.duo.players.map(item=>item.id),[a.id,b.id]);
  assert.equal((await view(a)).duo.id,duoId);assert.equal((await view(a)).invitations.length,0);
  assert.equal((await post(b,'/api/duos/join',{token:ownerLink.token.toUpperCase()})).json.duo.id,duoId);
  assert.equal((await post(c,'/api/duos/join',{token:ownerLink.token})).status,409);
  assert.equal((await post(c,'/api/duos/join',{token:partnerLink.token})).status,409);
  assert.equal((await post(a,'/api/duos/link')).status,409);
  assert.equal((await post(b,'/api/duos/leave')).status,200);
  assert.equal((await post(b,'/api/duos/join',{token:ownerLink.token})).status,409);
  assert.equal((await view(a)).duo,null);assert.equal((await view(b)).duo,null);
 });
 await t.test('an occupied recipient cannot consume a free owner link, and ordinary duos revoke unused links',async()=>{
  const ownerLink=(await post(a,'/api/duos/link')).json,oldPartnerLink=(await post(b,'/api/duos/link')).json;
  await post(c,'/api/duos',{playerCode:b.code});const invite=(await view(b)).invitations[0];await post(b,`/api/duos/${invite.id}/respond`,{accept:true});
  assert.equal((await post(b,'/api/duos/join',{token:ownerLink.token})).status,409);
  await post(c,'/api/duos/leave');
  assert.equal((await post(d,'/api/duos/join',{token:oldPartnerLink.token})).status,409);
  assert.equal((await post(b,'/api/duos/join',{token:ownerLink.token})).status,200);
  await post(a,'/api/duos/leave');
 });
 await t.test('competing link claims form one duo and duplicate requests return the same active pair',async()=>{
  const link=(await post(a,'/api/duos/link')).json;
  const claims=await Promise.all([post(b,'/api/duos/join',{token:link.token}),post(c,'/api/duos/join',{token:link.token})]);
  assert.deepEqual(claims.map(item=>item.status).sort(),[200,409]);
  const winner=claims[0].status===200?b:c,loser=winner===b?c:b;
  const duoId=(await view(a)).duo.id;assert.equal((await view(winner)).duo.id,duoId);assert.equal((await view(loser)).duo,null);
  const retries=await Promise.all([post(winner,'/api/duos/join',{token:link.token}),post(winner,'/api/duos/join',{token:link.token})]);
  assert.ok(retries.every(item=>item.status===200&&item.json.duo.id===duoId));
  write(db=>{assert.equal(db.prepare('SELECT COUNT(*) AS total FROM play_duos WHERE dissolved_at IS NULL AND (player_a=? OR player_b=?)').get(a.id,a.id).total,1);});
  await post(a,'/api/duos/leave');
  const al=(await post(a,'/api/duos/link')).json,bl=(await post(b,'/api/duos/link')).json;
  const cross=await Promise.all([post(a,'/api/duos/join',{token:bl.token}),post(b,'/api/duos/join',{token:al.token})]);
  assert.deepEqual(cross.map(item=>item.status).sort(),[200,409]);assert.equal((await view(a)).duo.id,(await view(b)).duo.id);
  await post(a,'/api/duos/leave');
 });
 await t.test('a failed claim rolls back duo creation, link use and invitation cancellation',async()=>{
  const link=(await post(a,'/api/duos/link')).json;
  await post(e,'/api/duos',{playerCode:a.code});
  write(db=>db.exec("CREATE TRIGGER block_test_claim BEFORE UPDATE OF claimed_by ON play_duo_links BEGIN SELECT RAISE(ABORT,'test claim rollback'); END;"));
  assert.equal((await post(b,'/api/duos/join',{token:link.token})).status,500);
  assert.equal((await view(a)).duo,null);assert.equal((await view(b)).duo,null);assert.equal((await view(a)).invitations.length,1);
  write(db=>{assert.equal(db.prepare('SELECT claimed_by FROM play_duo_links WHERE token=?').get(link.token).claimed_by,null);db.exec('DROP TRIGGER block_test_claim');});
  assert.equal((await post(b,'/api/duos/join',{token:link.token})).status,200);
  await post(a,'/api/duos/leave');
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
  assert.equal(match.status,'pending');assert.deepEqual(match.preview,{a:20,b:40});assert.equal(match.teams.a.length,2);assert.equal(match.teams.b.length,2);
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
  assert.deepEqual(game.deltas.map(item=>item.delta),[-40,-40,40,40]);
  for(const [actor,rating,win]of [[a,1660,0],[b,1460,0],[c,1240,1],[d,1240,1]]){const play=await view(actor);assert.equal(play.player.rating,rating);assert.equal(play.player.games,1);assert.equal(play.player.wins,win);assert.equal(play.history[0].id,match.id);}
  const demo=(await request('/api/profile',{cookie:a.cookie})).json.profile;assert.equal(demo.rating,4999);assert.equal(demo.games,12);assert.equal(demo.wins,10);
  assert.equal((await request('/api/profile',{method:'PUT',cookie:a.cookie,data:{rating:5000}})).status,200);assert.equal((await view(a)).player.rating,1660);
  assert.equal((await post(d,`/api/matches/${match.id}/result`,{winnerSide:'a'})).status,409);
  assert.equal((await post(a,`/api/matches/${match.id}/cancel`)).status,409);assert.equal((await view(a)).player.rating,1660);
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
 await t.test('a 100-point team gap previews and awards 40 for the underdog or 20 for the favorite',async()=>{
  for(const [winnerSide,award,ratings]of [['a',40,[1240,1240,1260,1260]],['b',20,[1180,1180,1320,1320]]]){
   write(db=>{for(const [actor,rating]of [[a,1200],[b,1200],[c,1300],[d,1300]])db.prepare('UPDATE play_players SET rating=? WHERE user_id=?').run(rating,actor.id);});
   const before=await Promise.all([a,b,c,d].map(view));
   const created=await post(a,'/api/matches',{playerCode:c.code});assert.equal(created.status,201);
   const pending=created.json.matches.find(item=>item.status==='pending');assert.deepEqual(pending.preview,{a:40,b:20});
   const accepted=await post(d,`/api/matches/${pending.id}/respond`,{accept:true});assert.equal(accepted.status,200);assert.deepEqual(accepted.json.matches.find(item=>item.id===pending.id).preview,{a:40,b:20});
   const result=await post(b,`/api/matches/${pending.id}/result`,{winnerSide});assert.equal(result.status,200);
   const complete=result.json.matches.find(item=>item.id===pending.id);assert.equal(complete.status,'completed');
   assert.deepEqual(complete.deltas.map(item=>item.delta),[a,b,c,d].map((_,index)=>(index<2?'a':'b')===winnerSide?award:-award));
   for(let index=0;index<4;index++){
    const current=await view(actors[index]),won=(index<2?'a':'b')===winnerSide;
    assert.equal(current.player.rating,ratings[index]);assert.equal(current.player.games,before[index].player.games+1);assert.equal(current.player.wins,before[index].player.wins+Number(won));
    assert.deepEqual(current.history.find(item=>item.id===pending.id).deltas,complete.deltas);
   }
  }
 });
 await t.test('later results and repeated reads preserve historical awards recorded under the previous rule',async()=>{
  const legacyDeltas=[
   {playerId:a.id,before:1700,after:1662,delta:-38},{playerId:b.id,before:1500,after:1462,delta:-38},
   {playerId:c.id,before:1200,after:1238,delta:38},{playerId:d.id,before:1200,after:1238,delta:38}
  ];
  const before=await Promise.all([a,b,c,d].map(view));
  write(db=>db.prepare('UPDATE play_matches SET deltas=? WHERE id=?').run(JSON.stringify(legacyDeltas),match.id));
  for(let index=0;index<4;index++){
   const current=await view(actors[index]),legacy=current.history.find(item=>item.id===match.id);assert.deepEqual(current.player,before[index].player);assert.deepEqual(legacy.deltas,legacyDeltas);assert.equal(legacy.format,null);assert.equal(legacy.scores,null);
  }
  const created=await post(a,'/api/matches',{playerCode:c.code});assert.equal(created.status,201);const pending=created.json.matches.find(item=>item.status==='pending');assert.deepEqual(pending.preview,{a:40,b:20});
  assert.equal((await post(c,`/api/matches/${pending.id}/respond`,{accept:true})).status,200);
  assert.equal((await post(d,`/api/matches/${pending.id}/result`,{winnerSide:'a'})).status,200);
  for(let index=0;index<4;index++){
   const current=await view(actors[index]),refreshed=await view(actors[index]),won=index<2;
   assert.equal(current.player.rating,before[index].player.rating+(won?40:-40));assert.equal(current.player.games,before[index].player.games+1);assert.equal(current.player.wins,before[index].player.wins+Number(won));
   assert.deepEqual(current.history.find(item=>item.id===match.id).deltas,legacyDeltas);assert.deepEqual(refreshed,current);
  }
 });
 await t.test('match settings are validated, persist for both teams and require valid set scores',async()=>{
  const format={bestOf:3,pointsToWin:11,winBy:2},scores=[{a:11,b:7},{a:10,b:12},{a:15,b:13}];
  const count=write(db=>db.prepare('SELECT COUNT(*) AS total FROM play_matches').get().total);
  for(const invalid of [null,{},[],{...format,bestOf:'3'},{...format,bestOf:2},{...format,pointsToWin:12},{...format,winBy:3},{...format,extra:true}])assert.equal((await post(a,'/api/matches',{playerCode:c.code,format:invalid})).status,400);
  assert.equal(write(db=>db.prepare('SELECT COUNT(*) AS total FROM play_matches').get().total),count);
  const created=await post(a,'/api/matches',{playerCode:c.code,format});assert.equal(created.status,201);const pending=created.json.matches.find(item=>item.status==='pending');
  assert.deepEqual(pending.format,format);assert.equal(pending.scores,null);assert.deepEqual((await view(c)).matches.find(item=>item.id===pending.id).format,format);
  write(db=>{const row=db.prepare('SELECT format,scores FROM play_matches WHERE id=?').get(pending.id);assert.deepEqual(JSON.parse(row.format),format);assert.equal(row.scores,null);});
  assert.equal((await post(a,`/api/matches/${pending.id}/result`,{scores})).status,409);
  assert.equal((await post(e,`/api/matches/${pending.id}/respond`,{accept:true})).status,403);
  assert.equal((await post(d,`/api/matches/${pending.id}/respond`,{accept:true})).status,200);
  assert.equal((await post(e,`/api/matches/${pending.id}/result`,{scores})).status,403);
  assert.equal((await request(`/api/matches/${pending.id}/result`,{method:'POST',data:{scores}})).status,401);
  assert.equal((await post(a,`/api/matches/${pending.id}/settings`,{format:{bestOf:1,pointsToWin:21,winBy:1}})).status,404);
  const before=await Promise.all([a,b,c,d].map(view));
  const invalidResults=[
   {winnerSide:'a'},{scores:null},{scores:[]},{scores:[{a:11,b:7}]},{scores:[{a:11,b:7},{a:9,b:11}]},
   {scores:[{a:11,b:7},{a:11,b:7},{a:0,b:11}]},{scores:[{a:12,b:8},{a:11,b:7}]},
   {scores:[{a:11,b:10},{a:11,b:7}]},{scores:[{a:'11',b:7},{a:11,b:7}]},{scores:[{a:11,b:7,extra:true},{a:11,b:7}]},
   {scores,winnerSide:'b'},{scores,winnerSide:null},{format:null,winnerSide:'a'},
   {format:{bestOf:1,pointsToWin:1,winBy:1},scores:[{a:1,b:0}],winnerSide:'a'}
  ];
  for(const result of invalidResults)assert.equal((await post(b,`/api/matches/${pending.id}/result`,result)).status,400,JSON.stringify(result));
  for(let index=0;index<4;index++)assert.deepEqual((await view(actors[index])).player,before[index].player);
  write(db=>{const row=db.prepare('SELECT status,format,scores,winner_side,deltas FROM play_matches WHERE id=?').get(pending.id);assert.equal(row.status,'active');assert.deepEqual(JSON.parse(row.format),format);assert.equal(row.scores,null);assert.equal(row.winner_side,null);assert.equal(row.deltas,null);});
  const result=await post(b,`/api/matches/${pending.id}/result`,{scores,format:{bestOf:1,pointsToWin:21,winBy:1},deltas:[{playerId:a.id,after:9000}]});assert.equal(result.status,200);
  const complete=result.json.matches.find(item=>item.id===pending.id);assert.equal(complete.winnerSide,'a');assert.deepEqual(complete.format,format);assert.deepEqual(complete.scores,scores);assert.equal(complete.reportedBy,b.id);
  assert.deepEqual(complete.deltas.map(item=>item.delta),[pending.preview.a,pending.preview.a,-pending.preview.a,-pending.preview.a]);
  for(let index=0;index<4;index++){
   const current=await view(actors[index]),won=index<2;
   assert.equal(current.player.rating,before[index].player.rating+(won?pending.preview.a:-pending.preview.a));assert.equal(current.player.games,before[index].player.games+1);assert.equal(current.player.wins,before[index].player.wins+Number(won));
   const history=current.history.find(item=>item.id===pending.id);assert.deepEqual(history.scores,scores);assert.deepEqual(history.format,format);
  }
  write(db=>{const row=db.prepare('SELECT format,scores FROM play_matches WHERE id=?').get(pending.id);assert.deepEqual(JSON.parse(row.format),format);assert.deepEqual(JSON.parse(row.scores),scores);});
  assert.equal((await post(d,`/api/matches/${pending.id}/result`,{scores})).status,409);assert.deepEqual((await view(a)).history.find(item=>item.id===pending.id).scores,scores);
 });
 await t.test('saving set scores and all four rating changes rolls back together on a storage failure',async()=>{
  const format={bestOf:1,pointsToWin:15,winBy:2},scores=[{a:15,b:17}];
  const created=await post(a,'/api/matches',{playerCode:c.code,format});assert.equal(created.status,201);const pending=created.json.matches.find(item=>item.status==='pending');
  assert.equal((await post(c,`/api/matches/${pending.id}/respond`,{accept:true})).status,200);const before=await Promise.all([a,b,c,d].map(view));
  write(db=>db.exec(`CREATE TRIGGER block_test_scores BEFORE UPDATE OF scores ON play_matches WHEN NEW.id='${pending.id}' BEGIN SELECT RAISE(ABORT,'test scores rollback'); END;`));
  assert.equal((await post(d,`/api/matches/${pending.id}/result`,{scores,winnerSide:'b'})).status,500);
  for(let index=0;index<4;index++){
   const current=await view(actors[index]),game=current.matches.find(item=>item.id===pending.id);assert.deepEqual(current.player,before[index].player);assert.equal(game.status,'active');assert.equal(game.scores,null);assert.equal(game.deltas,null);assert.equal(game.winnerSide,null);assert.equal(game.reportedBy,null);assert.equal(game.completedAt,null);
  }
  write(db=>db.exec('DROP TRIGGER block_test_scores'));
  const saved=await post(d,`/api/matches/${pending.id}/result`,{scores,winnerSide:'b'});assert.equal(saved.status,200);assert.deepEqual(saved.json.history.find(item=>item.id===pending.id).scores,scores);
 });
 await t.test('best-of-five games to 21 with win by one stop at the target and count as one rated match',async()=>{
  const format={bestOf:5,pointsToWin:21,winBy:1},scores=[{a:21,b:20},{a:0,b:21},{a:21,b:0},{a:20,b:21},{a:19,b:21}];
  const created=await post(a,'/api/matches',{playerCode:c.code,format});assert.equal(created.status,201);const pending=created.json.matches.find(item=>item.status==='pending');
  assert.equal((await post(c,`/api/matches/${pending.id}/respond`,{accept:true})).status,200);const before=await Promise.all([a,b,c,d].map(view));
  assert.equal((await post(d,`/api/matches/${pending.id}/result`,{scores:[{a:22,b:21},...scores.slice(1)]})).status,400);
  const saved=await post(d,`/api/matches/${pending.id}/result`,{scores});assert.equal(saved.status,200);const complete=saved.json.history.find(item=>item.id===pending.id);assert.equal(complete.winnerSide,'b');assert.deepEqual(complete.format,format);assert.deepEqual(complete.scores,scores);
  for(let index=0;index<4;index++){
   const current=await view(actors[index]),won=index>=2;assert.equal(current.player.rating,before[index].player.rating+(won?pending.preview.b:-pending.preview.b));assert.equal(current.player.games,before[index].player.games+1);assert.equal(current.player.wins,before[index].player.wins+Number(won));
  }
 });
 await t.test('legacy matches keep their winner-only result contract and cannot gain scores or settings',async()=>{
  const created=await post(a,'/api/matches',{playerCode:c.code});assert.equal(created.status,201);const pending=created.json.matches.find(item=>item.status==='pending');assert.equal(pending.format,null);assert.equal(pending.scores,null);
  assert.equal((await post(c,`/api/matches/${pending.id}/respond`,{accept:true})).status,200);
  for(const result of [{winnerSide:'b',scores:[{a:0,b:11}]},{winnerSide:'b',scores:null},{winnerSide:'b',format:{bestOf:1,pointsToWin:11,winBy:2},scores:[{a:0,b:11}]}])assert.equal((await post(d,`/api/matches/${pending.id}/result`,result)).status,400);
  const saved=await post(d,`/api/matches/${pending.id}/result`,{winnerSide:'b',format:{bestOf:5,pointsToWin:21,winBy:1}});assert.equal(saved.status,200);
  const completed=saved.json.history.find(item=>item.id===pending.id);assert.equal(completed.winnerSide,'b');assert.equal(completed.format,null);assert.equal(completed.scores,null);
 });
 await t.test('expired sessions cannot look up players or submit results',async()=>{
  write(db=>db.prepare('UPDATE sessions SET expires_at=0 WHERE user_id=?').run(e.id));
  assert.equal((await request('/api/players/'+a.code,{cookie:e.cookie})).status,401);assert.equal((await post(e,'/api/duos',{playerCode:a.code})).status,401);
 });
});

test('existing SQLite databases gain nullable match columns without changing historical results',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL); CREATE TABLE profiles(user_id TEXT PRIMARY KEY,data TEXT NOT NULL)');
  let response,requestBody={};
  class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
  const options={db,session:()=>({id:'a'}),body:async()=>requestBody,send:(_res,status,json)=>{response={status,json};},HttpError,storedProfile:(_name,data)=>JSON.parse(data)};
  createPlayStore(options);
  const teams={a:[{id:'a',name:'Player a',rating:1700},{id:'b',name:'Player b',rating:1500}],b:[{id:'c',name:'Player c',rating:1200},{id:'d',name:'Player d',rating:1200}]};
  const deltas=[{playerId:'a',before:1700,after:1662,delta:-38},{playerId:'b',before:1500,after:1462,delta:-38},{playerId:'c',before:1200,after:1238,delta:38},{playerId:'d',before:1200,after:1238,delta:38}];
  for(const [index,delta]of deltas.entries()){
   db.prepare('INSERT INTO users VALUES(?,?)').run(delta.playerId,`Player ${delta.playerId}`);db.prepare('INSERT INTO profiles VALUES(?,?)').run(delta.playerId,JSON.stringify({name:`Player ${delta.playerId}`,avatarCreated:true}));
   db.prepare('INSERT INTO play_players(user_id,code,rating,games,wins) VALUES(?,?,?,?,?)').run(delta.playerId,`SO-${String(index+1).padStart(12,'0')}`,delta.after,1,index<2?0:1);
  }
  db.prepare('INSERT INTO play_duos VALUES(?,?,?,?,?)').run('old-a','a','b',1,null);db.prepare('INSERT INTO play_duos VALUES(?,?,?,?,?)').run('old-b','c','d',1,null);
  db.prepare("INSERT INTO play_matches(id,status,duo_a,duo_b,player_a1,player_a2,player_b1,player_b2,teams,created_by,created_at,expires_at,reported_by,completed_at,winner_side,deltas) VALUES(?,'completed',?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run('old-match','old-a','old-b','a','b','c','d',JSON.stringify(teams),'a',1,86400001,'c',2,'b',JSON.stringify(deltas));
  const before={...db.prepare('SELECT * FROM play_matches WHERE id=?').get('old-match')};
  db.exec('ALTER TABLE play_matches DROP COLUMN format');db.exec('ALTER TABLE play_matches DROP COLUMN scores');
  assert.ok(!db.prepare('PRAGMA table_info(play_matches)').all().some(column=>column.name==='format'));
  createPlayStore(options);const handler=createPlayStore(options);
  assert.deepEqual({...db.prepare('SELECT * FROM play_matches WHERE id=?').get('old-match')},before,'migration is idempotent and preserves the original row');
  assert.equal(await handler({method:'GET'},{},new URL('http://test.invalid/api/play')),true);assert.equal(response.status,200);
  const legacy=response.json.history[0];assert.equal(legacy.format,null);assert.equal(legacy.scores,null);assert.deepEqual(legacy.deltas,deltas);assert.equal(response.json.player.rating,1662);assert.equal(response.json.player.games,1);
  const format={bestOf:3,pointsToWin:11,winBy:2};requestBody={playerCode:'SO-000000000003',format};
  assert.equal(await handler({method:'POST'},{},new URL('http://test.invalid/api/matches')),true);assert.equal(response.status,201);
  const pending=response.json.matches.find(item=>item.status==='pending');assert.deepEqual(pending.format,format);assert.equal(pending.scores,null);assert.deepEqual(response.json.history[0].deltas,deltas);assert.equal(response.json.player.rating,1662);
  assert.deepEqual(JSON.parse(db.prepare('SELECT format FROM play_matches WHERE id=?').get(pending.id).format),format,'new settings persist after upgrading an existing database');
 }finally{db.close();}
});
