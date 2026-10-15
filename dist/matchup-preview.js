import {drawAvatar as renderAvatar} from './pixel-player.js';

const identity=value=>typeof value==='string'&&value.trim().length>0;
const identified=player=>Boolean(player&&typeof player==='object'&&(identity(player.id)||identity(player.code)));
const samePlayer=(a,b)=>Boolean(a&&b&&((identity(a.id)&&identity(b.id)&&a.id===b.id)||(identity(a.code)&&identity(b.code)&&a.code===b.code)));
const validRating=player=>(typeof player.rating==='number'||(typeof player.rating==='string'&&player.rating.trim()!==''))&&Number.isFinite(Number(player.rating))&&Number(player.rating)>=0;
const average=players=>Math.round(players.reduce((sum,player)=>sum+Number(player.rating),0)/players.length);

/** A three-second opponent introduction. Pairing and game creation stay with the caller. */
export function createMatchupPreview({document:documentRef=globalThis.document,setTimeout:delay=globalThis.setTimeout,clearTimeout:cancel=globalThis.clearTimeout,drawAvatar:paintAvatar=renderAvatar}={}){
 let overlay=null,slots=[],averages=[],timer=null,destroyed=false;
 const element=(tag,className,text)=>{const node=documentRef.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};

 function build(){
  if(overlay)return;
  overlay=element('div','matchup-preview');overlay.hidden=true;
  overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');overlay.setAttribute('aria-atomic','true');
  const scene=element('div','matchup-preview-scene'),header=element('div','matchup-preview-header');
  header.append(element('div','matchup-preview-eyebrow','OPPONENTS FOUND'),element('div','matchup-preview-title','2v2'));
  const arena=element('div','matchup-preview-arena');
  for(let side=0;side<2;side++){
   if(side){const versus=element('div','matchup-preview-versus','VS');arena.append(versus);}
   const team=element('section',`matchup-preview-team matchup-preview-team-${side===0?'own':'opponent'}`);
   const teamHeader=element('div','matchup-preview-team-header'),teamAverage=element('span','matchup-preview-team-average');
   teamHeader.append(element('span','matchup-preview-team-label',side===0?'YOUR DUO':'OPPONENT DUO'),teamAverage);averages.push(teamAverage);
   const pair=element('div','matchup-preview-pair');
   for(let index=0;index<2;index++){
    const player=element('div','matchup-preview-player'),stage=element('div','matchup-preview-stage');
    const canvas=element('canvas','matchup-preview-avatar');canvas.width=200;canvas.height=260;canvas.setAttribute('aria-hidden','true');
    const name=element('strong','matchup-preview-name'),rating=element('span','matchup-preview-rating');
    stage.append(canvas);player.append(stage,name,rating);pair.append(player);slots.push({canvas,name,rating});
   }
   team.append(teamHeader,pair);arena.append(team);
  }
  scene.append(header,arena);overlay.append(scene);documentRef.body.append(overlay);
 }

 function hide(){
  if(timer!==null){cancel(timer);timer=null;}
  if(overlay){overlay.hidden=true;overlay.classList.remove('is-visible');}
  documentRef.documentElement?.classList.remove('sideout-matchup-previewing');
 }

 function show(player,ownDuo,opposingDuo){
  if(destroyed||!identified(player)||!Array.isArray(ownDuo?.players)||ownDuo.players.length!==2||!Array.isArray(opposingDuo?.players)||opposingDuo.players.length!==2)return false;
  const all=[...ownDuo.players,...opposingDuo.players];
  if(all.some(member=>!identified(member)||!validRating(member))||all.some((member,index)=>all.slice(index+1).some(other=>samePlayer(member,other))))return false;
  const current=ownDuo.players.find(member=>samePlayer(member,player));
  if(!current||all.filter(member=>samePlayer(member,player)).length!==1)return false;
  const teammate=ownDuo.players.find(member=>member!==current),ordered=[current,teammate,...opposingDuo.players];
  build();hide();
  ordered.forEach((member,index)=>{
   const {canvas,name,rating}=slots[index];name.textContent=String(member.name||'Player');rating.textContent=`${Number(member.rating)} MMR`;
   canvas.hidden=false;
   try{
    const context=canvas.getContext('2d');if(!context){canvas.hidden=true;return;}
    context.clearRect(0,0,canvas.width,canvas.height);context.imageSmoothingEnabled=false;
    paintAvatar(context,88,246,2,{...(member.avatar||{}),name:member.name});
   }catch{canvas.hidden=true;}
  });
  averages[0].textContent=`${average(ownDuo.players)} AVG. MMR`;averages[1].textContent=`${average(opposingDuo.players)} AVG. MMR`;
  overlay.hidden=false;documentRef.documentElement?.classList.add('sideout-matchup-previewing');
  // Force the entrance to restart when another opposing duo replaces this one.
  void overlay.offsetWidth;overlay.classList.add('is-visible');
  timer=delay(()=>{timer=null;hide();},3000);
  return true;
 }

 function destroy(){hide();overlay?.remove();overlay=null;slots=[];averages=[];destroyed=true;}
 return{show,hide,destroy};
}
