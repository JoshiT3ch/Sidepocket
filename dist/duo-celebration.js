import {drawAvatar as renderAvatar} from './pixel-player.js';

const samePlayer=(a,b)=>Boolean(a&&b&&((a.id&&b.id&&a.id===b.id)||(a.code&&b.code&&a.code===b.code)));

/** A brief visual celebration. The caller decides when a new duo is formed. */
export function createDuoCelebration({document:documentRef=globalThis.document,setTimeout:delay=globalThis.setTimeout,clearTimeout:cancel=globalThis.clearTimeout,drawAvatar:paintAvatar=renderAvatar}={}){
 let overlay=null,partnerName=null,canvases=[],timer=null,destroyed=false;

 function build(){
  if(overlay)return;
  overlay=documentRef.createElement('div');overlay.className='duo-celebration';overlay.hidden=true;
  overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');overlay.setAttribute('aria-atomic','true');
  const scene=documentRef.createElement('div');scene.className='duo-celebration-scene';
  const title=documentRef.createElement('div');title.className='duo-celebration-title';
  const lead=documentRef.createElement('span');lead.className='duo-celebration-lead';lead.textContent='Duo with ';
  partnerName=documentRef.createElement('span');partnerName.className='duo-celebration-name';title.append(lead,partnerName);
  const pair=documentRef.createElement('div');pair.className='duo-celebration-pair';pair.setAttribute('aria-hidden','true');
  for(let i=0;i<2;i++){
   const player=documentRef.createElement('div');player.className='duo-celebration-player';
   const canvas=documentRef.createElement('canvas');canvas.className='duo-celebration-avatar';canvas.width=200;canvas.height=260;canvas.setAttribute('aria-hidden','true');
   player.append(canvas);pair.append(player);canvases.push(canvas);
  }
  scene.append(title,pair);overlay.append(scene);documentRef.body.append(overlay);
 }

 function hide(){
  if(timer!==null){cancel(timer);timer=null;}
  if(overlay){overlay.hidden=true;overlay.classList.remove('is-visible');}
  documentRef.documentElement?.classList.remove('sideout-duo-celebrating');
 }

 function show(player,duo){
  if(destroyed||!player||!Array.isArray(duo?.players)||duo.players.length!==2)return false;
  const current=duo.players.find(member=>samePlayer(member,player));
  const partner=duo.players.find(member=>member&&!samePlayer(member,player));
  if(!current||!partner)return false;
  build();hide();
  [current,partner].forEach((member,index)=>{
   const canvas=canvases[index],ctx=canvas.getContext('2d');canvas.hidden=!ctx;
   if(!ctx)return;
   ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
   try{paintAvatar(ctx,88,246,2,{...(member.avatar||{}),name:member.name});}catch{canvas.hidden=true;}
  });
  partnerName.textContent=String(partner.name||'your teammate');
  overlay.hidden=false;
  documentRef.documentElement?.classList.add('sideout-duo-celebrating');
  // A replay starts a fresh entrance and a fresh three-second lifetime.
  void overlay.offsetWidth;overlay.classList.add('is-visible');
  timer=delay(()=>{timer=null;hide();},3000);
  return true;
 }

 function destroy(){hide();overlay?.remove();overlay=null;partnerName=null;canvases=[];destroyed=true;}
 return{show,hide,destroy};
}
