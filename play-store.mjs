import {randomBytes,randomUUID} from 'node:crypto';
import {ratingPreview,matchDeltas} from './rating.mjs';
import {COURTS,COURT_STATUSES,COURT_TTL_MINUTES,COURT_ROSTER_LIMIT} from './dist/courts-data.js';

const INVITATION_LIFETIME=24*60*60*1000;
const AVATAR_FIELDS=['skin','shirt','paddle','hat','height','bodyType','characterType','hairStyle','hairColor','capId','shirtId','bottomId'];

export function createPlayStore({db,session,body,send,HttpError,storedProfile}){
 db.exec(`CREATE TABLE IF NOT EXISTS play_players(
  user_id TEXT PRIMARY KEY REFERENCES users(id),code TEXT NOT NULL UNIQUE,
  rating INTEGER NOT NULL DEFAULT 1200 CHECK(rating>=100 AND rating<=9007199254740991),
  games INTEGER NOT NULL DEFAULT 0 CHECK(games>=0),wins INTEGER NOT NULL DEFAULT 0 CHECK(wins>=0 AND wins<=games));
 CREATE TABLE IF NOT EXISTS play_duos(
  id TEXT PRIMARY KEY,player_a TEXT NOT NULL REFERENCES users(id),player_b TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,dissolved_at INTEGER,CHECK(player_a<>player_b));
 CREATE INDEX IF NOT EXISTS play_duos_a ON play_duos(player_a,dissolved_at);
 CREATE INDEX IF NOT EXISTS play_duos_b ON play_duos(player_b,dissolved_at);
 CREATE TABLE IF NOT EXISTS play_duo_invitations(
  id TEXT PRIMARY KEY,from_id TEXT NOT NULL REFERENCES users(id),to_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','expired','cancelled')),
  created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,CHECK(from_id<>to_id));
 CREATE INDEX IF NOT EXISTS play_invitation_target ON play_duo_invitations(to_id,status);
 CREATE TABLE IF NOT EXISTS play_duo_links(
  token TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
  revoked_at INTEGER,claimed_by TEXT REFERENCES users(id),duo_id TEXT REFERENCES play_duos(id),
  CHECK((claimed_by IS NULL)=(duo_id IS NULL)),CHECK(claimed_by IS NULL OR claimed_by<>owner_id));
 CREATE INDEX IF NOT EXISTS play_duo_links_available ON play_duo_links(owner_id) WHERE claimed_by IS NULL AND revoked_at IS NULL;
 CREATE TABLE IF NOT EXISTS play_matches(
  id TEXT PRIMARY KEY,status TEXT NOT NULL CHECK(status IN ('pending','active','completed','cancelled')),
  duo_a TEXT NOT NULL REFERENCES play_duos(id),duo_b TEXT NOT NULL REFERENCES play_duos(id),
  player_a1 TEXT NOT NULL REFERENCES users(id),player_a2 TEXT NOT NULL REFERENCES users(id),
  player_b1 TEXT NOT NULL REFERENCES users(id),player_b2 TEXT NOT NULL REFERENCES users(id),
  teams TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
  reported_by TEXT REFERENCES users(id),completed_at INTEGER,winner_side TEXT CHECK(winner_side IN ('a','b')),deltas TEXT);
 CREATE INDEX IF NOT EXISTS play_matches_status ON play_matches(status,created_at);`);
 db.exec('CREATE INDEX IF NOT EXISTS play_players_leaderboard ON play_players(rating DESC,wins DESC,games ASC,code ASC) WHERE games>0');
 db.exec(`CREATE TABLE IF NOT EXISTS court_catalog(
  id TEXT PRIMARY KEY,name TEXT NOT NULL,address TEXT NOT NULL,maps_url TEXT NOT NULL,sort_order INTEGER NOT NULL UNIQUE);
 CREATE TABLE IF NOT EXISTS court_checkins(
  user_id TEXT PRIMARY KEY REFERENCES play_players(user_id) ON DELETE CASCADE,
  court_id TEXT NOT NULL REFERENCES court_catalog(id),
  status TEXT NOT NULL CHECK(status IN ('playing','idle','practice')),
  open_play INTEGER NOT NULL CHECK(open_play IN (0,1)),
  checked_in_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
  CHECK(checked_in_at<=updated_at),CHECK(expires_at=updated_at+7200000));
 CREATE INDEX IF NOT EXISTS court_checkins_court_expiry ON court_checkins(court_id,expires_at,updated_at DESC,user_id);`);
 const saveCourt=db.prepare('INSERT INTO court_catalog(id,name,address,maps_url,sort_order) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address,maps_url=excluded.maps_url,sort_order=excluded.sort_order');
 COURTS.forEach((court,index)=>saveCourt.run(court.id,court.name,court.address,court.mapsUrl,index));

 function transaction(operation){db.exec('BEGIN IMMEDIATE');try{const result=operation();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
 function fail(status,message){throw new HttpError(status,message);}
 function expire(){const now=Date.now();db.prepare("UPDATE play_duo_invitations SET status='expired' WHERE status='pending' AND expires_at<=?").run(now);db.prepare("UPDATE play_matches SET status='cancelled' WHERE status='pending' AND expires_at<=?").run(now);}
 function account(userId){return db.prepare('SELECT users.id,users.name,profiles.data FROM users JOIN profiles ON profiles.user_id=users.id WHERE users.id=?').get(userId);}
 function profileFor(userId){const row=account(userId);return row?storedProfile(row.name,row.data):null;}
 function requireReady(userId){const profile=profileFor(userId);if(!profile?.avatarCreated)fail(409,'Create your avatar before playing a rated game.');return profile;}
 function ladder(userId){
  let row=db.prepare('SELECT * FROM play_players WHERE user_id=?').get(userId);
  if(!row){
   for(let attempt=0;attempt<5;attempt++){
    const code='SO-'+randomBytes(6).toString('hex').toUpperCase();
    try{db.prepare('INSERT INTO play_players(user_id,code) VALUES(?,?)').run(userId,code);break;}catch(error){if(!String(error.message).includes('UNIQUE'))throw error;}
   }
   row=db.prepare('SELECT * FROM play_players WHERE user_id=?').get(userId);
   if(!row)throw new Error('Could not create player code.');
  }
  return row;
 }
 function player(userId){
  const profile=profileFor(userId);if(!profile)fail(404,'Player not found.');
  const row=ladder(userId);const avatar=Object.fromEntries(AVATAR_FIELDS.map(key=>[key,profile[key]]));
  return{id:userId,name:profile.name,code:row.code,avatar,rating:row.rating,games:row.games,wins:row.wins};
 }
 function codePlayer(value){
  if(typeof value!=='string'||!/^SO-[A-F0-9]{12}$/i.test(value.trim()))fail(400,'Enter a valid player code, such as SO-123456ABCDEF.');
  const row=db.prepare('SELECT user_id FROM play_players WHERE code=?').get(value.trim().toUpperCase());
  if(!row||!profileFor(row.user_id)?.avatarCreated)fail(404,'Player not found. Ask them to finish their avatar first.');
  return player(row.user_id);
 }
 function duoRow(userId){return db.prepare('SELECT * FROM play_duos WHERE dissolved_at IS NULL AND (player_a=? OR player_b=?)').get(userId,userId);}
 function duoView(row){return row?{id:row.id,players:[player(row.player_a),player(row.player_b)]}:null;}
 function participantIds(row){return[row.player_a1,row.player_a2,row.player_b1,row.player_b2];}
 function unfinished(userId){return db.prepare("SELECT id FROM play_matches WHERE status IN ('pending','active') AND (player_a1=? OR player_a2=? OR player_b1=? OR player_b2=?) LIMIT 1").get(userId,userId,userId,userId);}
 function requireFree(ids){if(ids.some(id=>unfinished(id)))fail(409,'One of these players already has an unfinished game. Finish or cancel it first.');}
 function revokeDuoLinks(ids){for(const id of ids)db.prepare('UPDATE play_duo_links SET revoked_at=? WHERE owner_id=? AND claimed_by IS NULL AND revoked_at IS NULL').run(Date.now(),id);}
 function requireMatch(matchId,userId){const row=db.prepare('SELECT * FROM play_matches WHERE id=?').get(matchId);if(!row)fail(404,'Game not found.');if(!participantIds(row).includes(userId))fail(403,'Only players in this game can change it.');return row;}
 function matchView(row){const teams=JSON.parse(row.teams);return{id:row.id,status:row.status,teams,createdBy:row.created_by,createdAt:row.created_at,reportedBy:row.reported_by||null,completedAt:row.completed_at||null,winnerSide:row.winner_side||null,preview:ratingPreview(teams),deltas:row.deltas?JSON.parse(row.deltas):null};}
 function playView(userId){
  expire();
  const matches=db.prepare('SELECT * FROM play_matches WHERE player_a1=? OR player_a2=? OR player_b1=? OR player_b2=? ORDER BY created_at DESC,id DESC LIMIT 20').all(userId,userId,userId,userId).map(matchView);
  const history=db.prepare("SELECT * FROM play_matches WHERE status='completed' AND (player_a1=? OR player_a2=? OR player_b1=? OR player_b2=?) ORDER BY completed_at DESC,id DESC LIMIT 20").all(userId,userId,userId,userId).map(matchView);
  const invitations=db.prepare("SELECT * FROM play_duo_invitations WHERE to_id=? AND status='pending' ORDER BY created_at DESC LIMIT 20").all(userId).filter(invite=>profileFor(invite.from_id)?.avatarCreated&&!duoRow(invite.from_id)&&!duoRow(userId)).map(invite=>({id:invite.id,from:player(invite.from_id),expiresAt:invite.expires_at}));
  return{player:player(userId),duo:duoView(duoRow(userId)),invitations,matches,history};
 }
 function teamsFor(a,b){return{a:[player(a.player_a),player(a.player_b)],b:[player(b.player_a),player(b.player_b)]};}
 function courtId(value,{optional=false}={}){
  if(optional&&(value===undefined||value===null))return null;
  if(typeof value!=='string'||!COURTS.some(court=>court.id===value))fail(404,'Court not found. Choose a court from the list.');
  return value;
 }
 function courtCheckin(row){return row?{courtId:row.court_id,status:row.status,openPlay:!!row.open_play,checkedInAt:row.checked_in_at,updatedAt:row.updated_at,expiresAt:row.expires_at}:null;}
 function courtsView(userId,selectedCourtId=null,now=Date.now()){
  const counts=db.prepare('SELECT court_id,COUNT(*) AS players,SUM(open_play) AS openPlayers FROM court_checkins WHERE expires_at>? GROUP BY court_id').all(now);
  const courts=COURTS.map(court=>{const count=counts.find(row=>row.court_id===court.id);return{...court,playerCount:count?.players??0,openPlayCount:count?.openPlayers??0};});
  const rows=selectedCourtId?db.prepare('SELECT * FROM court_checkins WHERE court_id=? AND expires_at>? ORDER BY (user_id=?) DESC,updated_at DESC,user_id ASC LIMIT ?').all(selectedCourtId,now,userId,COURT_ROSTER_LIMIT):[];
  const players=rows.map(row=>{const {courtId,...checkIn}=courtCheckin(row);return{player:player(row.user_id),...checkIn};});
  const own=db.prepare('SELECT * FROM court_checkins WHERE user_id=? AND expires_at>?').get(userId,now);
  return{courts,selectedCourtId,players,me:{player:player(userId),checkIn:courtCheckin(own)},serverTime:now,ttlMinutes:COURT_TTL_MINUTES,rosterLimit:COURT_ROSTER_LIMIT};
 }
 function leaderboard(userId){
  ladder(userId);
  // The profile's demo statistics never participate in rank or eligibility.
  const rows=db.prepare(`WITH ranked AS (
   SELECT p.user_id,p.rating,p.wins,p.games,p.code,RANK() OVER(ORDER BY p.rating DESC) AS rank,COUNT(*) OVER() AS total
   FROM play_players p JOIN profiles f ON f.user_id=p.user_id
   WHERE p.games>0 AND json_extract(f.data,'$.avatarCreated')=1
  ), leaders AS (SELECT * FROM ranked ORDER BY rating DESC,wins DESC,games ASC,code ASC LIMIT 100)
  SELECT * FROM leaders UNION ALL SELECT * FROM ranked WHERE user_id=? AND user_id NOT IN(SELECT user_id FROM leaders)
  ORDER BY rating DESC,wins DESC,games ASC,code ASC`).all(userId);
  return{entries:rows.slice(0,100).map(row=>({rank:row.rank,player:player(row.user_id)})),
   me:{rank:rows.find(row=>row.user_id===userId)?.rank??null,player:player(userId)},rankedPlayers:rows[0]?.total??0,limit:100};
 }

 return async function handlePlay(req,res,url){
  const pathname=url.pathname;
  if(pathname!=='/api/leaderboard'&&!pathname.startsWith('/api/play')&&!pathname.startsWith('/api/players/')&&!pathname.startsWith('/api/duos')&&!pathname.startsWith('/api/matches')&&pathname!=='/api/courts'&&!pathname.startsWith('/api/courts/'))return false;
  const current=session(req);if(!current)fail(401,'Please log in to continue.');
  if(pathname==='/api/courts'||pathname.startsWith('/api/courts/')){
   ladder(current.id);
   if(pathname==='/api/courts'&&req.method==='GET'){send(res,200,courtsView(current.id));return true;}
   if(pathname==='/api/courts/check-in'&&req.method==='POST'){
    const data=await body(req),selected=courtId(data.courtId);
    if(!COURT_STATUSES.includes(data.status))fail(400,'Choose Playing, Idle, or Practicing.');
    if(typeof data.openPlay!=='boolean')fail(400,'Choose whether you are available for open play.');
    const snapshot=transaction(()=>{
     if(!profileFor(current.id)?.avatarCreated)fail(409,'Create your avatar before checking in to a court.');
     const now=Date.now(),previous=db.prepare('SELECT * FROM court_checkins WHERE user_id=?').get(current.id);
     const checkedInAt=previous?.court_id===selected&&previous.expires_at>now?previous.checked_in_at:now;
     db.prepare(`INSERT INTO court_checkins(user_id,court_id,status,open_play,checked_in_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET court_id=excluded.court_id,status=excluded.status,open_play=excluded.open_play,
       checked_in_at=excluded.checked_in_at,updated_at=excluded.updated_at,expires_at=excluded.expires_at`).run(current.id,selected,data.status,data.openPlay?1:0,checkedInAt,now,now+COURT_TTL_MINUTES*60000);
     return courtsView(current.id,selected,now);
    });send(res,200,snapshot);return true;
   }
   if(pathname==='/api/courts/leave'&&req.method==='POST'){
    const data=await body(req),selected=courtId(data.courtId,{optional:true});
    const snapshot=transaction(()=>{db.prepare('DELETE FROM court_checkins WHERE user_id=?').run(current.id);return courtsView(current.id,selected);});
    send(res,200,snapshot);return true;
   }
   const route=/^\/api\/courts\/([^/]+)$/.exec(pathname);
   if(route&&req.method==='GET'){send(res,200,courtsView(current.id,courtId(decodeURIComponent(route[1]))));return true;}
   fail(404,'Not found.');
  }
  if(pathname==='/api/leaderboard'){
   if(req.method!=='GET')fail(404,'Not found.');
   send(res,200,leaderboard(current.id));return true;
  }
  requireReady(current.id);ladder(current.id);expire();
  const reply=(status=200)=>{send(res,status,playView(current.id));return true;};
  if(pathname==='/api/play'&&req.method==='GET')return reply();
  if(pathname.startsWith('/api/players/')&&req.method==='GET'){
   const found=codePlayer(decodeURIComponent(pathname.slice('/api/players/'.length)));
   send(res,200,{player:found,duo:duoView(duoRow(found.id))});return true;
  }
  if(pathname==='/api/duos/link'&&req.method==='POST'){
   await body(req);
   const link=transaction(()=>{
    expire();requireReady(current.id);
    if(duoRow(current.id))fail(409,'Leave your current duo before creating a duo link.');
    requireFree([current.id]);revokeDuoLinks([current.id]);
    const token=randomUUID(),now=Date.now(),expiresAt=now+INVITATION_LIFETIME;
    db.prepare('INSERT INTO play_duo_links(token,owner_id,created_at,expires_at) VALUES(?,?,?,?)').run(token,current.id,now,expiresAt);
    return{token,expiresAt};
   });send(res,201,link);return true;
  }
  if(pathname==='/api/duos/join'&&req.method==='POST'){
   const data=await body(req);
   if(typeof data.token!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(data.token))fail(400,'This duo link is invalid. Ask your partner for a new one.');
   transaction(()=>{
    expire();const link=db.prepare('SELECT * FROM play_duo_links WHERE token=?').get(data.token.toLowerCase());
    if(!link)fail(404,'This duo link is invalid. Ask your partner for a new one.');
    if(link.owner_id===current.id)fail(400,'This is your own duo link. Share it with your partner.');
    if(link.revoked_at!==null||link.expires_at<=Date.now())fail(409,'This duo link has expired or been replaced. Ask your partner for a new one.');
    requireReady(current.id);requireReady(link.owner_id);
    if(link.claimed_by!==null){
     const own=duoRow(current.id),other=duoRow(link.owner_id);
     if(link.claimed_by===current.id&&own?.id===link.duo_id&&other?.id===link.duo_id)return;
     fail(409,'This duo link has already been used. Ask your partner for a new one.');
    }
    if(duoRow(current.id)||duoRow(link.owner_id))fail(409,'A player is already in a duo. Leave the current duo before choosing a new partner.');
    requireFree([current.id,link.owner_id]);
    const duoId=randomUUID();db.prepare('INSERT INTO play_duos VALUES(?,?,?,?,NULL)').run(duoId,link.owner_id,current.id,Date.now());
    db.prepare('UPDATE play_duo_links SET claimed_by=?,duo_id=? WHERE token=?').run(current.id,duoId,link.token);
    revokeDuoLinks([current.id,link.owner_id]);
    db.prepare("UPDATE play_duo_invitations SET status='cancelled' WHERE status='pending' AND (from_id=? OR from_id=? OR to_id=? OR to_id=?)").run(current.id,link.owner_id,current.id,link.owner_id);
   });return reply();
  }
  if(pathname==='/api/duos'&&req.method==='POST'){
   const data=await body(req);const target=codePlayer(data.playerCode);
   if(target.id===current.id)fail(400,'Choose another player for your duo.');
   transaction(()=>{
    expire();if(duoRow(current.id)||duoRow(target.id))fail(409,'A player is already in a duo. Leave the current duo before choosing a new partner.');
    requireFree([current.id,target.id]);
    if(db.prepare("SELECT id FROM play_duo_invitations WHERE status='pending' AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))").get(current.id,target.id,target.id,current.id))fail(409,'A duo invitation between you is already waiting for an answer.');
    if(db.prepare("SELECT COUNT(*) AS total FROM play_duo_invitations WHERE from_id=? AND status='pending'").get(current.id).total>=10)fail(429,'You already have 10 pending duo invitations. Wait for an answer before inviting more players.');
    const now=Date.now();db.prepare('INSERT INTO play_duo_invitations VALUES(?,?,?,?,?,?)').run(randomUUID(),current.id,target.id,'pending',now,now+INVITATION_LIFETIME);
   });return reply(201);
  }
  const inviteRoute=/^\/api\/duos\/([^/]+)\/respond$/.exec(pathname);
  if(inviteRoute&&req.method==='POST'){
   const data=await body(req);if(typeof data.accept!=='boolean')fail(400,'Choose whether to accept the invitation.');
   transaction(()=>{
    expire();const invite=db.prepare('SELECT * FROM play_duo_invitations WHERE id=?').get(inviteRoute[1]);
    if(!invite)fail(404,'Invitation not found.');if(invite.to_id!==current.id)fail(403,'Only the invited player can answer.');if(invite.status!=='pending')fail(409,'This invitation has already been answered or expired.');
    if(!data.accept){db.prepare("UPDATE play_duo_invitations SET status='declined' WHERE id=?").run(invite.id);return;}
    requireReady(invite.from_id);requireReady(invite.to_id);
    if(duoRow(invite.from_id)||duoRow(invite.to_id))fail(409,'A player is already in another duo.');
    requireFree([invite.from_id,invite.to_id]);
    db.prepare('INSERT INTO play_duos VALUES(?,?,?,?,NULL)').run(randomUUID(),invite.from_id,invite.to_id,Date.now());
    revokeDuoLinks([invite.from_id,invite.to_id]);
    db.prepare("UPDATE play_duo_invitations SET status='accepted' WHERE id=?").run(invite.id);
    db.prepare("UPDATE play_duo_invitations SET status='cancelled' WHERE status='pending' AND (from_id=? OR from_id=? OR to_id=? OR to_id=?)").run(invite.from_id,invite.to_id,invite.from_id,invite.to_id);
   });return reply();
  }
  if(pathname==='/api/duos/leave'&&req.method==='POST'){
   await body(req);transaction(()=>{expire();const duo=duoRow(current.id);if(!duo)fail(409,'You are not currently in a duo.');requireFree([duo.player_a,duo.player_b]);db.prepare('UPDATE play_duos SET dissolved_at=? WHERE id=?').run(Date.now(),duo.id);});return reply();
  }
  if(pathname==='/api/matches'&&req.method==='POST'){
   const data=await body(req);const target=codePlayer(data.playerCode);
   transaction(()=>{
    expire();const a=duoRow(current.id),b=duoRow(target.id);if(!a||!b)fail(409,'Both sides must form a duo before playing doubles.');if(a.id===b.id)fail(400,'Challenge a player from a different duo.');
    const ids=[a.player_a,a.player_b,b.player_a,b.player_b];if(new Set(ids).size!==4)fail(400,'A doubles game needs four different players.');ids.forEach(requireReady);requireFree(ids);
    const now=Date.now();db.prepare('INSERT INTO play_matches(id,status,duo_a,duo_b,player_a1,player_a2,player_b1,player_b2,teams,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),'pending',a.id,b.id,...ids,JSON.stringify(teamsFor(a,b)),current.id,now,now+INVITATION_LIFETIME);
   });return reply(201);
  }
  const matchRoute=/^\/api\/matches\/([^/]+)\/(respond|result|cancel)$/.exec(pathname);
  if(matchRoute&&req.method==='POST'){
   const data=await body(req);const [,matchId,action]=matchRoute;
   transaction(()=>{
    expire();const row=requireMatch(matchId,current.id);
    if(action==='respond'){
     if(typeof data.accept!=='boolean')fail(400,'Choose whether to accept the game.');if(row.status!=='pending')fail(409,'This game is no longer waiting for an answer.');
     if(![row.player_b1,row.player_b2].includes(current.id))fail(403,'A player from the challenged duo must answer.');
     if(!data.accept){db.prepare("UPDATE play_matches SET status='cancelled' WHERE id=?").run(matchId);return;}
     const a=duoRow(row.player_a1),b=duoRow(row.player_b1);if(a?.id!==row.duo_a||b?.id!==row.duo_b)fail(409,'The original duos are no longer available.');participantIds(row).forEach(requireReady);
     db.prepare("UPDATE play_matches SET status='active',teams=? WHERE id=?").run(JSON.stringify(teamsFor(a,b)),matchId);return;
    }
    if(action==='cancel'){
     if(!['pending','active'].includes(row.status))fail(409,'This game is already finished.');db.prepare("UPDATE play_matches SET status='cancelled' WHERE id=?").run(matchId);return;
    }
    if(!['a','b'].includes(data.winnerSide))fail(400,'Choose the duo that won.');if(row.status!=='active')fail(409,'Accept the game before submitting a result. Finished games cannot be submitted twice.');
    const teams=JSON.parse(row.teams),deltas=matchDeltas(teams,data.winnerSide);
    for(const side of ['a','b'])for(const participant of teams[side]){
     const delta=deltas.find(item=>item.playerId===participant.id);
     const update=db.prepare('UPDATE play_players SET rating=?,games=games+1,wins=wins+? WHERE user_id=? AND rating=?').run(delta.after,side===data.winnerSide?1:0,participant.id,delta.before);
     if(update.changes!==1)fail(409,'A player rating changed. Cancel this game and create a new one.');
    }
    db.prepare("UPDATE play_matches SET status='completed',reported_by=?,completed_at=?,winner_side=?,deltas=? WHERE id=?").run(current.id,Date.now(),data.winnerSide,JSON.stringify(deltas),matchId);
   });return reply();
  }
  fail(404,'Not found.');
 };
}
