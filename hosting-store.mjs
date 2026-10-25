import {randomUUID} from 'node:crypto';

// Verification is an operator-managed entitlement, never an editable profile field.
export function createHostingStore({db,session,body,send,HttpError,players,now=Date.now}){
 db.exec(`CREATE TABLE IF NOT EXISTS player_verifications(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,verified_until INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS hosted_events(
  id TEXT PRIMARY KEY,host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 100),category TEXT NOT NULL CHECK(category IN ('men','women','mixed','open')),
  capacity INTEGER NOT NULL CHECK(capacity BETWEEN 2 AND 100),starts_at INTEGER NOT NULL,ends_at INTEGER NOT NULL CHECK(ends_at>starts_at AND ends_at-starts_at<=43200000),
  venue TEXT NOT NULL CHECK(length(venue) BETWEEN 3 AND 100),address TEXT NOT NULL CHECK(length(address) BETWEEN 8 AND 250),
  fee INTEGER NOT NULL CHECK(fee BETWEEN 0 AND 10000),notes TEXT NOT NULL CHECK(length(notes)<=1500),
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','cancelled')),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS hosted_events_start ON hosted_events(starts_at,id);
 CREATE INDEX IF NOT EXISTS hosted_events_host ON hosted_events(host_id,starts_at);
 CREATE TABLE IF NOT EXISTS hosting_participants(
  event_id TEXT NOT NULL REFERENCES hosted_events(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('requested','confirmed','maybe','declined')),updated_at INTEGER NOT NULL,PRIMARY KEY(event_id,user_id));
 CREATE INDEX IF NOT EXISTS hosting_participants_user ON hosting_participants(user_id,event_id);
 CREATE INDEX IF NOT EXISTS hosting_participants_status ON hosting_participants(event_id,status,updated_at,user_id);`);
 const fail=(status,message)=>{throw new HttpError(status,message);};
 const transaction=operation=>{db.exec('BEGIN IMMEDIATE');try{const result=operation();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
 const verified=(id,time)=>!!db.prepare('SELECT 1 FROM player_verifications WHERE user_id=? AND verified_until>?').get(id,time);
 const player=(id,time)=>({...players.player(id),isVerified:verified(id,time)});
 const confirmed=id=>db.prepare("SELECT COUNT(*) count FROM hosting_participants WHERE event_id=? AND status='confirmed'").get(id).count;
 const membership=(id,user)=>db.prepare('SELECT status FROM hosting_participants WHERE event_id=? AND user_id=?').get(id,user)?.status||null;
 const text=(data,key,min,max)=>{if(typeof data[key]!=='string')fail(400,`Enter a valid ${key}.`);const value=data[key].trim();if(value.length<min||value.length>max)fail(400,`Use ${min}–${max} characters for ${key}.`);return value;};
 function fields(data,time){
  const title=text(data,'title',3,100),venue=text(data,'venue',3,100),address=text(data,'address',8,250),notes=text({...data,notes:data.notes??''},'notes',0,1500);
  if(!['men','women','mixed','open'].includes(data.category))fail(400,'Choose a session category.');
  const capacity=data.capacity??30,fee=data.fee??0;
  if(!Number.isInteger(capacity)||capacity<2||capacity>100)fail(400,'Choose a capacity between 2 and 100 players.');
  if(!Number.isInteger(fee)||fee<0||fee>10000)fail(400,'Enter a whole-peso fee between 0 and 10000.');
  if(typeof data.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.startTime||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.endTime||''))fail(400,'Choose a valid date and start/end time.');
  const startsAt=Date.parse(`${data.date}T${data.startTime}:00+08:00`),endsAt=Date.parse(`${data.date}T${data.endTime}:00+08:00`);
  if(!Number.isFinite(startsAt)||new Date(startsAt+28800000).toISOString().slice(0,10)!==data.date)fail(400,'Choose a valid calendar date.');
  const lastDate=new Date(time);lastDate.setUTCFullYear(lastDate.getUTCFullYear()+1);
  if(startsAt<=time||startsAt>lastDate.getTime()||endsAt<=startsAt||endsAt-startsAt>43200000)fail(400,'Choose a future session within one year, ending the same day and lasting at most 12 hours.');
  return{title,category:data.category,capacity,startsAt,endsAt,venue,address,fee,notes};
 }
 function snapshot(user,data,time){
  const scope=data.scope??'upcoming';if(!['upcoming','mine','past'].includes(scope))fail(400,'Choose upcoming, mine, or past sessions.');
  const rows=db.prepare('SELECT * FROM hosted_events ORDER BY starts_at,id').all();
  const summary=e=>({id:e.id,title:e.title,category:e.category,host:player(e.host_id,time),capacity:e.capacity,confirmedCount:confirmed(e.id),startsAt:new Date(e.starts_at).toISOString(),endsAt:new Date(e.ends_at).toISOString(),venue:e.venue,address:e.address,fee:e.fee,notes:e.notes,status:e.status,myStatus:membership(e.id,user)});
  const filtered=rows.filter(e=>scope==='mine'?(e.host_id===user||membership(e.id,user)!==null):scope==='past'?e.ends_at<=time:e.status==='published'&&e.ends_at>time);
  if(scope==='past')filtered.reverse();const events=filtered.slice(0,100).map(summary);
  let selectedEvent=null;const eventId=data.eventId??events[0]?.id;
  if(eventId){const event=rows.find(e=>e.id===eventId);if(!event)fail(404,'This hosted session is unavailable.');selectedEvent=summary(event);selectedEvent.participants=db.prepare("SELECT user_id FROM hosting_participants WHERE event_id=? AND status='confirmed' ORDER BY updated_at,user_id").all(event.id).map(m=>player(m.user_id,time));selectedEvent.requests=event.host_id===user?db.prepare("SELECT user_id FROM hosting_participants WHERE event_id=? AND status='requested' ORDER BY updated_at,user_id").all(event.id).map(m=>({player:player(m.user_id,time),status:'requested'})):[];}
  return{events,selectedEvent,me:{player:player(user,time),isVerified:verified(user,time)},scope,serverTime:time};
 }
 return async(req,res,url)=>{
  if(url.pathname!=='/api/hosting')return false;
  if(req.method!=='POST')fail(404,'This hosting action is not available.');
  const user=session(req);if(!user)fail(401,'Please log in to continue.');
  const input=await body(req),action=input.action,data=input.data??{};
  if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'Please send valid form data.');
  if(Object.hasOwn(data,'eventId')&&(typeof data.eventId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.eventId)))fail(400,'Choose a valid hosted session.');
  if(!['list','create','edit','request','respond','rsvp','cancel'].includes(action))fail(404,'This hosting action is not available.');
  const time=now();players.player(user.id);
  if(action==='list'){send(res,200,snapshot(user.id,data,time));return true;}
  const result=transaction(()=>{
   let eventId=data.eventId;
   if(action==='create'||action==='edit'){
    if(!verified(user.id,time))fail(403,'Verify your account before hosting a session.');
    players.requireReady(user.id);const f=fields(data,time);
    if(action==='create'){
     eventId=randomUUID();db.prepare('INSERT INTO hosted_events(id,host_id,title,category,capacity,starts_at,ends_at,venue,address,fee,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(eventId,user.id,f.title,f.category,f.capacity,f.startsAt,f.endsAt,f.venue,f.address,f.fee,f.notes,time,time);
     db.prepare("INSERT INTO hosting_participants VALUES(?,?,'confirmed',?)").run(eventId,user.id,time);
    }else{
     const e=db.prepare('SELECT * FROM hosted_events WHERE id=?').get(eventId||'');if(!e)fail(404,'This hosted session is unavailable.');
     if(e.host_id!==user.id)fail(403,'Only the host can edit this session.');
     if(e.status!=='published'||e.starts_at<=time)fail(409,'Only upcoming published sessions can be edited.');
     if(f.capacity<confirmed(e.id))fail(409,'Capacity cannot be lower than the confirmed player count.');
     db.prepare('UPDATE hosted_events SET title=?,category=?,capacity=?,starts_at=?,ends_at=?,venue=?,address=?,fee=?,notes=?,updated_at=? WHERE id=?').run(f.title,f.category,f.capacity,f.startsAt,f.endsAt,f.venue,f.address,f.fee,f.notes,time,e.id);
    }
   }else{
    const e=db.prepare('SELECT * FROM hosted_events WHERE id=?').get(eventId||'');if(!e)fail(404,'This hosted session is unavailable.');
    const host=e.host_id===user.id,current=membership(e.id,user.id);
    if(action==='cancel'){
     if(!host)fail(403,'Only the host can cancel this session.');
     if(e.status!=='cancelled'&&e.ends_at<=time)fail(409,'This session has already ended.');
     db.prepare("UPDATE hosted_events SET status='cancelled',updated_at=? WHERE id=?").run(time,e.id);
    }else{
     if(e.status!=='published'||e.ends_at<=time)fail(409,'This session has ended or was cancelled.');
     if(action==='request'){
      players.requireReady(user.id);
      if(!['requested','confirmed'].includes(current)){
       if(confirmed(e.id)>=e.capacity)fail(409,'This session is full.');
       db.prepare("INSERT INTO hosting_participants VALUES(?,?,'requested',?) ON CONFLICT(event_id,user_id) DO UPDATE SET status='requested',updated_at=excluded.updated_at").run(e.id,user.id,time);
      }
     }else if(action==='respond'){
      if(!host)fail(403,'Only the host can respond to join requests.');
      if(typeof data.accept!=='boolean'||typeof data.userId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.userId))fail(400,'Choose a player request and accept or decline.');
      if(data.userId===user.id)fail(409,'The host stays confirmed in this session.');
      const target=membership(e.id,data.userId),next=data.accept?'confirmed':'declined';
      if(target!==next){
       if(target!=='requested')fail(409,'This join request is no longer pending.');
       if(data.accept&&confirmed(e.id)>=e.capacity)fail(409,'This session is full.');
       db.prepare('UPDATE hosting_participants SET status=?,updated_at=? WHERE event_id=? AND user_id=?').run(next,time,e.id,data.userId);
      }
     }else if(action==='rsvp'){
      if(host)fail(409,'The host stays confirmed. Cancel the session if you cannot host.');
      if(!['maybe','declined'].includes(data.status))fail(400,'Choose Maybe or Can’t go.');
      db.prepare('INSERT INTO hosting_participants VALUES(?,?,?,?) ON CONFLICT(event_id,user_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at').run(e.id,user.id,data.status,time);
     }
    }
   }
   return snapshot(user.id,{eventId,scope:data.scope??(action==='cancel'?'mine':'upcoming')},time);
  });send(res,200,result);return true;
 };
}
