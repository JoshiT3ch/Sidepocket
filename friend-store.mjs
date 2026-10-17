import {randomUUID} from 'node:crypto';

const HOUR=60*60*1000;
const RETRY_COOLDOWN=24*HOUR;
const PRESENCE_TTL=2*HOUR;
const PRESENCE_STATUSES=['available','playing','practice','away'];
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function createFriendStore({db,session,body,send,HttpError,players}){
 db.exec(`CREATE TABLE IF NOT EXISTS play_friendships(
  id TEXT PRIMARY KEY,from_id TEXT NOT NULL REFERENCES users(id),to_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','cancelled','removed')),
  created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,CHECK(from_id<>to_id));
 CREATE UNIQUE INDEX IF NOT EXISTS play_friendships_active_pair
  ON play_friendships(MIN(from_id,to_id),MAX(from_id,to_id)) WHERE status IN ('pending','accepted');
 CREATE INDEX IF NOT EXISTS play_friendships_sender ON play_friendships(from_id,status,created_at);
 CREATE INDEX IF NOT EXISTS play_friendships_recipient ON play_friendships(to_id,status,created_at);
 CREATE TABLE IF NOT EXISTS friend_presence(
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','playing','practice','away')),
  court_id TEXT REFERENCES court_catalog(id),share_status INTEGER NOT NULL DEFAULT 0 CHECK(share_status IN (0,1)),
  share_location INTEGER NOT NULL DEFAULT 0 CHECK(share_location IN (0,1)),updated_at INTEGER NOT NULL,expires_at INTEGER,
  CHECK(share_location=0 OR court_id IS NOT NULL),
  CHECK((share_status=1 OR share_location=1)=(expires_at IS NOT NULL)),
  CHECK(expires_at IS NULL OR expires_at=updated_at+7200000));`);
 function fail(status,message){throw new HttpError(status,message);}
 function transaction(operation){db.exec('BEGIN IMMEDIATE');try{const result=operation();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
 function ownPresence(userId,now){
  const row=db.prepare('SELECT * FROM friend_presence WHERE user_id=?').get(userId),active=!!row&&row.expires_at>now;
  return{status:row?.status??'available',courtId:row?.court_id??null,shareStatus:active&&!!row.share_status,
   shareLocation:active&&!!row.share_location,updatedAt:row?.updated_at??null,expiresAt:active?row.expires_at:null};
 }
 function sharedPresence(userId,now){
  const row=db.prepare('SELECT friend_presence.*,court_catalog.name AS court_name FROM friend_presence LEFT JOIN court_catalog ON court_catalog.id=friend_presence.court_id WHERE user_id=? AND expires_at>?').get(userId,now);
  if(!row||!row.share_status&&!row.share_location)return null;
  return{status:row.share_status?row.status:null,court:row.share_location?{id:row.court_id,name:row.court_name}:null,expiresAt:row.expires_at};
 }
 function snapshot(userId,now=Date.now()){
  const result={friends:[],incoming:[],outgoing:[],me:{presence:ownPresence(userId,now)},courts:db.prepare('SELECT id,name FROM court_catalog ORDER BY sort_order').all(),serverTime:now};
  const rows=db.prepare("SELECT * FROM play_friendships WHERE status IN ('pending','accepted') AND (from_id=? OR to_id=?) ORDER BY created_at DESC,id DESC").all(userId,userId);
  for(const row of rows){
   const entry={id:row.id,player:players.player(row.from_id===userId?row.to_id:row.from_id),createdAt:row.created_at};
   if(row.status==='accepted')entry.presence=sharedPresence(entry.player.id,now);
   result[row.status==='accepted'?'friends':row.to_id===userId?'incoming':'outgoing'].push(entry);
  }
  return result;
 }
 function relationship(id,userId){
  const row=db.prepare('SELECT * FROM play_friendships WHERE id=?').get(id);
  // Do not disclose another pair's relationship, even if an id is known.
  if(!row||![row.from_id,row.to_id].includes(userId))fail(404,'Friend request not found.');
  return row;
 }
 function ready(userId){
  try{players.requireReady(userId);}catch(error){if(error.status===409)fail(409,'Create your avatar before adding friends.');throw error;}
 }
 return async function handleFriends(req,res,url){
  const pathname=url.pathname;
  if(pathname!=='/api/friends'&&!pathname.startsWith('/api/friends/'))return false;
  const current=session(req);if(!current)fail(401,'Please log in to continue.');
  if(pathname==='/api/friends'&&req.method==='GET'){send(res,200,snapshot(current.id));return true;}
  if(pathname==='/api/friends/presence'&&req.method==='POST'){
   const data=await body(req);
   if(typeof data.shareStatus!=='boolean'||typeof data.shareLocation!=='boolean')fail(400,'Choose whether to share your status and whereabouts.');
   if(!PRESENCE_STATUSES.includes(data.status))fail(400,'Choose an available status.');
   if(data.courtId!==null&&(typeof data.courtId!=='string'||!db.prepare('SELECT id FROM court_catalog WHERE id=?').get(data.courtId)))fail(404,'Court not found. Choose a court from the list.');
   if(data.shareLocation&&data.courtId===null)fail(400,'Choose a court to share your whereabouts.');
   const result=transaction(()=>{
    if(data.shareStatus||data.shareLocation){try{players.requireReady(current.id);}catch(error){if(error.status===409)fail(409,'Create your avatar before sharing your status or whereabouts.');throw error;}}
    const now=Date.now();
    db.prepare(`INSERT INTO friend_presence(user_id,status,court_id,share_status,share_location,updated_at,expires_at) VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,court_id=excluded.court_id,share_status=excluded.share_status,
      share_location=excluded.share_location,updated_at=excluded.updated_at,expires_at=excluded.expires_at`)
     .run(current.id,data.status,data.courtId,Number(data.shareStatus),Number(data.shareLocation),now,data.shareStatus||data.shareLocation?now+PRESENCE_TTL:null);
    if(!data.shareLocation)db.prepare('DELETE FROM court_checkins WHERE user_id=?').run(current.id);
    return snapshot(current.id,now);
   });send(res,200,result);return true;
  }
  if(pathname==='/api/friends/presence/hide'&&req.method==='POST'){
   await body(req);
   const result=transaction(()=>{
    const now=Date.now();
    db.prepare(`INSERT INTO friend_presence(user_id,status,court_id,share_status,share_location,updated_at,expires_at) VALUES(?,'available',NULL,0,0,?,NULL)
     ON CONFLICT(user_id) DO UPDATE SET court_id=NULL,share_status=0,share_location=0,updated_at=excluded.updated_at,expires_at=NULL`).run(current.id,now);
    db.prepare('DELETE FROM court_checkins WHERE user_id=?').run(current.id);
    return snapshot(current.id,now);
   });send(res,200,result);return true;
  }
  if(pathname==='/api/friends/request'&&req.method==='POST'){
   const data=await body(req);
   const result=transaction(()=>{
    ready(current.id);
    const target=players.codePlayer(data.playerCode);
    if(target.id===current.id)fail(400,'Choose another player to add as a friend.');
    // Also provisions a stable public code if this is the first player action.
    players.player(current.id);
    const pair=db.prepare("SELECT * FROM play_friendships WHERE status IN ('pending','accepted') AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))").get(current.id,target.id,target.id,current.id);
    if(pair){
     if(pair.status==='accepted')return{status:200,data:snapshot(current.id)};
     if(pair.from_id===current.id)return{status:200,data:snapshot(current.id)};
     fail(409,'This player already sent you a friend request. Accept it in your incoming requests.');
    }
    const now=Date.now();
    if(db.prepare("SELECT id FROM play_friendships WHERE status IN ('declined','cancelled','removed') AND updated_at>? AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?)) LIMIT 1").get(now-RETRY_COOLDOWN,current.id,target.id,target.id,current.id))fail(429,'Wait 24 hours before sending another friend request to this player.');
    if(db.prepare('SELECT COUNT(*) AS total FROM play_friendships WHERE from_id=? AND created_at>?').get(current.id,now-HOUR).total>=20)fail(429,'You have sent 20 friend requests this hour. Please try again later.');
    if(db.prepare("SELECT COUNT(*) AS total FROM play_friendships WHERE from_id=? AND status='pending'").get(current.id).total>=20)fail(429,'You already have 20 pending friend requests. Wait for an answer or cancel a request first.');
    db.prepare('INSERT INTO play_friendships(id,from_id,to_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),current.id,target.id,'pending',now,now);
    return{status:201,data:snapshot(current.id)};
   });send(res,result.status,result.data);return true;
  }
  const route=/^\/api\/friends\/([^/]+)\/(respond|cancel|remove)$/.exec(pathname);
  if(route&&req.method==='POST'){
   const [,rawId,action]=route;
   if(!UUID.test(rawId))fail(400,'Invalid friend request.');
   const id=rawId.toLowerCase(),data=await body(req);
   if(action==='respond'&&typeof data.accept!=='boolean')fail(400,'Choose whether to accept the friend request.');
   const result=transaction(()=>{
    const row=relationship(id,current.id);
    if(action==='respond'){
     if(row.to_id!==current.id)fail(403,'Only the invited player can answer this friend request.');
     const next=data.accept?'accepted':'declined';
     if(row.status===next)return snapshot(current.id);
     if(row.status!=='pending')fail(409,'This friend request has already been answered or cancelled.');
     if(data.accept){ready(row.from_id);ready(row.to_id);}
     db.prepare('UPDATE play_friendships SET status=?,updated_at=? WHERE id=?').run(next,Date.now(),id);
    }else if(action==='cancel'){
     if(row.from_id!==current.id)fail(403,'Only the sender can cancel this friend request.');
     if(row.status==='cancelled')return snapshot(current.id);
     if(row.status!=='pending')fail(409,'Only a pending friend request can be cancelled.');
     db.prepare("UPDATE play_friendships SET status='cancelled',updated_at=? WHERE id=?").run(Date.now(),id);
    }else{
     if(row.status==='removed')return snapshot(current.id);
     if(row.status!=='accepted')fail(409,'Only an existing friend can be removed.');
     db.prepare("UPDATE play_friendships SET status='removed',updated_at=? WHERE id=?").run(Date.now(),id);
    }
    return snapshot(current.id);
   });send(res,200,result);return true;
  }
  fail(404,'Not found.');
 };
}
