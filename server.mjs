import http from 'node:http';
import {WARDROBE,DEFAULT_EQUIPMENT,equipmentError} from './dist/wardrobe.js';
import {normalizeHair,hairError} from './dist/hairstyles.js';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes, randomUUID, scrypt, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {createPlayStore} from './play-store.mjs';
import {createFriendStore} from './friend-store.mjs';
import connection from './dist/connection.js';

const root=path.dirname(fileURLToPath(import.meta.url));
const staticRoot=path.join(root,'dist');
const port=Number(process.env.PORT||3000);
const host=process.env.HOST||'127.0.0.1';
const cloudOrigin=connection.provider==='supabase'?new URL(connection.url).origin:'';
const origins=new Set(process.env.PUBLIC_ORIGIN?[new URL(process.env.PUBLIC_ORIGIN).origin]:[`http://127.0.0.1:${port}`,`http://localhost:${port}`]);
const secureCookie=process.env.COOKIE_SECURE==='true'||process.env.PUBLIC_ORIGIN?.startsWith('https://');
const cookieName=secureCookie?'__Host-sideout_session':'sideout_session';
const dataDir=process.env.SIDEOUT_DATA_DIR?path.resolve(process.env.SIDEOUT_DATA_DIR):path.join(root,'.data');
fs.mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(path.join(dataDir,'sideout.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT NOT NULL);`);
const SESSION_SECONDS=7*24*60*60;
const derive=promisify(scrypt);
const hashPassword=(password,salt)=>derive(password,salt,64,{N:65536,r:8,p:2,maxmem:128*1024*1024});
const tokenHash=token=>createHash('sha256').update(token).digest('hex');
const defaultProfile=name=>({name,skin:'#cf986c',shirt:'#ed795d',paddle:'#7286bb',hat:'cap',height:170,bodyType:'regular',characterType:'male',avatarCreated:false,...normalizeHair({characterType:'male'}),...DEFAULT_EQUIPMENT,rating:1200,games:0,wins:0,history:[]});
function storedProfile(name,data){const saved=JSON.parse(data);return{...defaultProfile(name),...saved,...normalizeHair(saved)};}
const limits=new Map();
let activeHashes=0;
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
function userView(row){return{id:row.id,email:row.email,name:row.name};}
function cookie(token,maxAge=SESSION_SECONDS){return`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookie?'; Secure':''}`;}
function session(req){const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!raw||!/^[a-f0-9]{64}$/.test(raw))return null;const row=db.prepare('SELECT users.*,sessions.token_hash FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(tokenHash(raw),Date.now());return row||null;}
function createSession(req,res,user){const previous=session(req);if(previous)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(previous.token_hash);db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token),user.id,Date.now()+SESSION_SECONDS*1000);res.setHeader('Set-Cookie',cookie(token));}
function limit(req){const ip=req.socket.remoteAddress||'unknown';const now=Date.now();const old=limits.get(ip);const record=old&&old.until>now?old:{count:0,until:now+15*60*1000};record.count++;limits.set(ip,record);if(record.count>20)throw new HttpError(429,'Too many attempts. Please try again in 15 minutes.');if(limits.size>1000)for(const [key,value]of limits)if(value.until<=now)limits.delete(key);}
async function passwordKey(password,salt){if(activeHashes>=4)throw new HttpError(503,'Please try again in a moment.');activeHashes++;try{return await hashPassword(password,salt);}finally{activeHashes--;}}
async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)throw new HttpError(413,'Request is too large.');chunks.push(chunk);}try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new HttpError(400,'Please send valid form data.');}}
function credentials(data){const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';const password=typeof data.password==='string'?data.password:'';if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new HttpError(400,'Enter a valid email address.');if(password.length<8||password.length>128)throw new HttpError(400,'Use a password between 8 and 128 characters.');return{email,password};}
function cleanProfile(value){
 const accepted={skin:['#f1c49b','#cf986c','#a96c4b','#704630'],shirt:['#ed795d','#a6bce0','#ede8cd','#8da65d','#b59fc6'],paddle:['#7286bb','#ed795d','#d2e48e','#8f709d'],hat:['none','cap','headband']};
 accepted.shirt=[...new Set([...accepted.shirt,...WARDROBE.shirts.map(item=>item.color)])];
 const outfitError=equipmentError(value);if(outfitError)throw new HttpError(400,outfitError);
 const hairstyleError=hairError(value);if(hairstyleError)throw new HttpError(400,hairstyleError);
 const name=typeof value.name==='string'?value.name.trim():'';if(name.length<1||name.length>24)throw new HttpError(400,'Use a player name between 1 and 24 characters.');
 if(!Number.isInteger(value.height)||value.height<120||value.height>220)throw new HttpError(400,'Choose a height between 120 and 220 cm.');
 if(!['lean','regular','broad'].includes(value.bodyType))throw new HttpError(400,'Choose an available body type.');
 if(!['male','female'].includes(value.characterType))throw new HttpError(400,'Choose an available character style.');
 if(typeof value.avatarCreated!=='boolean')throw new HttpError(400,'Invalid avatar setup status.');
 for(const key of Object.keys(accepted))if(!accepted[key].includes(value[key]))throw new HttpError(400,'Choose an available character option.');
 if(!Number.isInteger(value.rating)||value.rating<100||value.rating>5000||!Number.isInteger(value.games)||value.games<0||value.games>1000000||!Number.isInteger(value.wins)||value.wins<0||value.wins>value.games)throw new HttpError(400,'Invalid demo statistics.');
 if(!Array.isArray(value.history)||value.history.length>20||value.history.some(x=>!x||typeof x.win!=='boolean'||!Number.isInteger(x.opponent)||x.opponent<100||x.opponent>3000||!Number.isInteger(x.delta)||Math.abs(x.delta)>32||!Number.isInteger(x.after)||x.after<100||x.after>5000))throw new HttpError(400,'Invalid demo game history.');
 return{name,skin:value.skin,shirt:value.shirt,paddle:value.paddle,hat:value.hat,height:value.height,bodyType:value.bodyType,characterType:value.characterType,avatarCreated:value.avatarCreated,hairStyle:value.hairStyle,hairColor:value.hairColor,capId:value.capId,shirtId:value.shirtId,bottomId:value.bottomId,rating:value.rating,games:value.games,wins:value.wins,history:value.history.map(x=>({win:x.win,opponent:x.opponent,delta:x.delta,after:x.after}))};
}
async function api(req,res,url){
 if(req.method!=='GET'){
   if(req.headers['x-sideout-request']!=='1'||!origins.has(req.headers.origin)||!String(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(403,'This request could not be verified. Refresh the page and try again.');
 }
 if(await handlePlay(req,res,url))return;
 if(await handleFriends(req,res,url))return;
 if(url.pathname==='/api/auth/session'&&req.method==='GET'){const current=session(req);return send(res,200,{user:current?userView(current):null});}
 if(url.pathname==='/api/auth/signup'&&req.method==='POST'){
   limit(req);const data=await body(req);const {email,password}=credentials(data);const name=typeof data.name==='string'?data.name.trim():'';
   if(name.length<1||name.length>24)throw new HttpError(400,'Use a player name between 1 and 24 characters.');
   if(db.prepare('SELECT id FROM users WHERE email=?').get(email))throw new HttpError(409,'An account with that email already exists. Try logging in.');
   const salt=randomBytes(16).toString('hex');const key=await passwordKey(password,salt);const user={id:randomUUID(),email,name};
   db.exec('BEGIN');try{db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(user.id,email,name,key.toString('hex'),salt,Date.now());db.prepare('INSERT INTO profiles VALUES(?,?)').run(user.id,JSON.stringify(defaultProfile(name)));db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');if(db.prepare('SELECT id FROM users WHERE email=?').get(email))throw new HttpError(409,'An account with that email already exists. Try logging in.');throw error;}
   createSession(req,res,user);return send(res,201,{user:userView(user)});
 }
 if(url.pathname==='/api/auth/login'&&req.method==='POST'){
   limit(req);const {email,password}=credentials(await body(req));const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
   const key=await passwordKey(password,user?.salt||'00000000000000000000000000000000');const stored=user?Buffer.from(user.password_hash,'hex'):Buffer.alloc(64);
   if(!timingSafeEqual(key,stored)||!user)throw new HttpError(401,'Email or password is incorrect.');createSession(req,res,user);return send(res,200,{user:userView(user)});
 }
 if(url.pathname==='/api/auth/logout'&&req.method==='POST'){const current=session(req);if(current)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(current.token_hash);res.setHeader('Set-Cookie',cookie('',0));return send(res,200,{ok:true});}
 if(url.pathname==='/api/profile'&&['GET','PUT'].includes(req.method)){
   const current=session(req);if(!current)throw new HttpError(401,'Please log in to continue.');
   const previous=db.prepare('SELECT data FROM profiles WHERE user_id=?').get(current.id);
   const saved=storedProfile(current.name,previous.data);
   if(req.method==='GET')return send(res,200,{profile:saved});
   const incoming=await body(req);const next={...saved,...incoming};
   if(Object.hasOwn(incoming,'characterType')&&incoming.characterType!==saved.characterType&&!Object.hasOwn(incoming,'hairStyle'))next.hairStyle=normalizeHair(next).hairStyle;
   const profile=cleanProfile(next);
   db.prepare('UPDATE profiles SET data=? WHERE user_id=?').run(JSON.stringify(profile),current.id);return send(res,200,{ok:true});
 }
 throw new HttpError(404,'Not found.');
}
const handlePlay=createPlayStore({db,session,body,send,HttpError,storedProfile});
const handleFriends=createFriendStore({db,session,body,send,HttpError,players:handlePlay.players});
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ${cloudOrigin}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
 try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname.startsWith('/api/')){await api(req,res,url);return;}
   if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'Method not allowed.');
   const pathname=decodeURIComponent(url.pathname);const relative=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');const file=path.resolve(staticRoot,relative);
   if(!file.startsWith(staticRoot+path.sep))throw new HttpError(404,'Not found.');
   const allowed={'.webmanifest':'application/manifest+json; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
   if(!allowed[path.extname(file)])throw new HttpError(404,'Not found.');
   let bytes;try{bytes=await fs.promises.readFile(file);}catch{throw new HttpError(404,'Not found.');}res.writeHead(200,{'Content-Type':allowed[path.extname(file)]});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(error){if(res.headersSent){res.end();return;}if(!(error instanceof HttpError))console.error('Request failed:',error.code||error.name);send(res,error.status||500,{error:error.status?error.message:'Something went wrong. Please try again.'});}
});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(port,host,()=>console.log(`Sideout website: http://${host}:${port}\nPress Ctrl+C to stop.`));
function shutdown(){server.close(()=>{db.close();process.exit(0);});}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
