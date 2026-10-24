import {randomUUID} from 'node:crypto';
import {normalizeMatchFormat} from './dist/match-format.js';

// A room is a lobby, not a duo. Choosing a slot never changes saved duos.
export function createRoomStore({db,session,body,send,HttpError,players}){
 db.exec(`CREATE TABLE IF NOT EXISTS play_rooms(
  id TEXT PRIMARY KEY,leader_id TEXT NOT NULL REFERENCES users(id),waiting_slots INTEGER NOT NULL DEFAULT 2 CHECK(waiting_slots BETWEEN 2 AND 12),
  closed_at INTEGER,match_id TEXT REFERENCES play_matches(id),created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS play_room_members(
  user_id TEXT PRIMARY KEY REFERENCES users(id),room_id TEXT NOT NULL REFERENCES play_rooms(id),slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 15),
  UNIQUE(room_id,slot));`);
 if(!db.prepare('PRAGMA table_info(play_matches)').all().some(column=>column.name==='room_id'))db.exec('ALTER TABLE play_matches ADD COLUMN room_id TEXT REFERENCES play_rooms(id)');
 const fail=(status,message)=>{throw new HttpError(status,message);};
 const transaction=operation=>{db.exec('BEGIN IMMEDIATE');try{const value=operation();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}};
 const membership=id=>db.prepare('SELECT * FROM play_room_members WHERE user_id=?').get(id);
 const unfinished=id=>db.prepare("SELECT id FROM play_matches WHERE status IN ('pending','active') AND (player_a1=? OR player_a2=? OR player_b1=? OR player_b2=?) AND (status='active' OR expires_at>?)").get(id,id,id,id,Date.now());
 const view=id=>{
  const room=db.prepare('SELECT * FROM play_rooms WHERE id=? AND closed_at IS NULL').get(id);if(!room)fail(404,'This room is closed or unavailable. Ask the leader for a room QR.');
  const match=room.match_id?db.prepare('SELECT status FROM play_matches WHERE id=?').get(room.match_id):null;
  return{id:room.id,leaderId:room.leader_id,leader:players.player(room.leader_id),waitingSlots:room.waiting_slots,matchId:room.match_id,matchActive:match?.status==='active',
   slots:Array.from({length:4+room.waiting_slots},(_,slot)=>{const member=db.prepare('SELECT user_id FROM play_room_members WHERE room_id=? AND slot=?').get(id,slot);return member?players.player(member.user_id):null;})};
 };
 return async(req,res,url)=>{
  if(url.pathname!=='/api/rooms'&&!url.pathname.startsWith('/api/rooms/'))return false;
  const user=session(req);if(!user)fail(401,'Please log in to continue.');players.requireReady(user.id);players.player(user.id);
  if(url.pathname==='/api/rooms'&&req.method==='GET'){const member=membership(user.id);send(res,200,{room:member?view(member.room_id):null,playerId:user.id});return true;}
  if(url.pathname==='/api/rooms'&&req.method==='POST'){
   await body(req);const room=transaction(()=>{
    if(membership(user.id))fail(409,'Leave or close your current room before making another room.');
    if(unfinished(user.id))fail(409,'Finish or cancel your current match before making a room.');
    const id=randomUUID();db.prepare('INSERT INTO play_rooms(id,leader_id,created_at) VALUES(?,?,?)').run(id,user.id,Date.now());
    db.prepare('INSERT INTO play_room_members VALUES(?,?,0)').run(user.id,id);return view(id);
   });send(res,201,{room,playerId:user.id});return true;
  }
  const route=/^\/api\/rooms\/([0-9a-f-]{36})(?:\/(slot|waiting|start|leave|close))?$/.exec(url.pathname);
  if(!route)fail(404,'Room not found.');const [,id,action]=route;
  if(!action&&req.method==='GET'){send(res,200,{room:view(id),playerId:user.id});return true;}
  if(req.method!=='POST'||!action)fail(404,'Room action not found.');
  const data=await body(req);
  const room=transaction(()=>{
   const room=view(id),member=membership(user.id),leader=room.leaderId===user.id;
   if(action==='slot'){
    if(!Number.isInteger(data.slot)||data.slot<0||data.slot>=room.slots.length)fail(400,'Choose an available slot.');
    if(member&&member.room_id!==id)fail(409,'Leave your current room before joining another room.');
    if(room.slots[data.slot]?.id===user.id)return room;
    if(room.slots[data.slot])fail(409,'Someone just took that slot. Refresh and choose another +.');
    if(unfinished(user.id))fail(409,'Finish or cancel your match before changing slots.');
    if(room.matchActive&&(data.slot<4||member?.slot<4))fail(409,'Playing slots stay fixed until the match finishes. Choose a waiting slot.');
    db.prepare('INSERT INTO play_room_members(user_id,room_id,slot) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET slot=excluded.slot').run(user.id,id,data.slot);
   }else{
    if(!member||member.room_id!==id)fail(403,'Join this room first.');
    if(action==='leave'){
     if(leader)fail(409,'The room leader must close the room.');
     if(unfinished(user.id))fail(409,'Finish or cancel your match before leaving.');
     db.prepare('DELETE FROM play_room_members WHERE user_id=?').run(user.id);return null;
    }
    if(!leader)fail(403,'Only the room leader can do that.');
    if(action==='waiting'){
     if(room.waitingSlots>=12)fail(409,'This room already has 12 waiting slots.');
     db.prepare('UPDATE play_rooms SET waiting_slots=waiting_slots+1 WHERE id=?').run(id);
    }else if(action==='close'){
     if(room.matchActive)fail(409,'Finish or cancel the match before closing the room.');
     db.prepare('DELETE FROM play_room_members WHERE room_id=?').run(id);db.prepare('UPDATE play_rooms SET closed_at=? WHERE id=?').run(Date.now(),id);return null;
    }else if(action==='start'){
     if(room.matchActive)fail(409,'This room already has a match in progress.');
     const roster=room.slots.slice(0,4);if(roster.some(player=>!player))fail(409,'Fill all four playing slots before starting.');
     for(const player of roster){players.requireReady(player.id);if(unfinished(player.id))fail(409,'A player has an unfinished match. Finish or cancel it first.');}
     let format;try{format=normalizeMatchFormat(data.format);}catch(error){fail(400,error.message);}
     const now=Date.now(),duos=[randomUUID(),randomUUID()],matchId=randomUUID();
     duos.forEach((duo,index)=>db.prepare('INSERT INTO play_duos VALUES(?,?,?,?,?)').run(duo,roster[index*2].id,roster[index*2+1].id,now,now));
     db.prepare("INSERT INTO play_matches(id,status,duo_a,duo_b,player_a1,player_a2,player_b1,player_b2,teams,created_by,created_at,expires_at,format,room_id) VALUES(?,'active',?,?,?,?,?,?,?,?,?,?,?,?)").run(matchId,...duos,...roster.map(player=>player.id),JSON.stringify({a:roster.slice(0,2),b:roster.slice(2)}),user.id,now,now+86400000,JSON.stringify(format),id);
     db.prepare('UPDATE play_rooms SET match_id=? WHERE id=?').run(matchId,id);
    }
   }
   return view(id);
  });send(res,200,{room,playerId:user.id});return true;
 };
}
