import {drawAvatar,drawAvatarPose} from './pixel-player.js';

export const STORY_TEMPLATES=Object.freeze([
  Object.freeze({id:'rally',name:'Rally shot',description:'Your player in action.',pose:'swing'}),
  Object.freeze({id:'court',name:'Court pose',description:'A moment on your court.',pose:'victory'}),
  Object.freeze({id:'player',name:'Player card',description:'Your original player poster.',pose:'ready'})
]);

const P={paper:'#f5f4ed',ink:'#232922',lime:'#d5ed8b',coral:'#ed9275',green:'#6e8855',line:'#f3f1dc'};
const face='"Space Grotesk", Arial, sans-serif';
const body='"DM Sans", Arial, sans-serif';
const templateFor=id=>STORY_TEMPLATES.find(item=>item.id===id)||STORY_TEMPLATES[0];
export const storyFilename=template=>`sideout-${templateFor(template).id}-story.png`;

// Share only the server's current match totals, never the avatar's legacy demo values.
export function getStoryDetails(profile={},stats=null){
  const games=Number.isSafeInteger(stats?.games)&&stats.games>=0?stats.games:null;
  const wins=games!==null&&Number.isSafeInteger(stats?.wins)&&stats.wins>=0&&stats.wins<=games?stats.wins:null;
  const rating=Number.isSafeInteger(stats?.rating)&&stats.rating>=100?stats.rating:null;
  return{
    name:typeof profile?.name==='string'&&profile.name.trim()?profile.name.trim():'Player',
    rating:rating===null?'—':rating.toLocaleString('en-US'),
    games:games===null?'—':games.toLocaleString('en-US'),
    wins:wins===null?'—':wins.toLocaleString('en-US'),
    level:games===null?'Rating loading':games<5?'Finding your level':'Rating established',
    summary:games===null||wins===null?'YOUR DOUBLES JOURNEY':`${games} ${games===1?'GAME':'GAMES'} · ${wins} ${wins===1?'WIN':'WINS'}`
  };
}

function box(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function shape(ctx,points,color){ctx.beginPath();ctx.moveTo(...points[0]);for(const point of points.slice(1))ctx.lineTo(...point);ctx.closePath();ctx.fillStyle=color;ctx.fill();}
function line(ctx,points,color,width=4){ctx.beginPath();ctx.moveTo(...points[0]);for(const point of points.slice(1))ctx.lineTo(...point);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function text(ctx,value,x,y,size,color=P.ink,{weight=600,align='left',font=face,width=900,min=18}={}){
  let content=String(value),fontSize=size;ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillStyle=color;
  while(fontSize>min){ctx.font=`${weight} ${fontSize}px ${font}`;if(ctx.measureText(content).width<=width)break;fontSize-=2;}
  ctx.font=`${weight} ${fontSize}px ${font}`;
  if(ctx.measureText(content).width>width){while(content.length&&ctx.measureText(content+'…').width>width)content=Array.from(content).slice(0,-1).join('');content+='…';}
  ctx.fillText(content,x,y);
}
function label(ctx,value,x,y,color=P.ink,align='left',width=880){text(ctx,value,x,y,21,color,{font:body,weight:600,align,width,min:16});}
function brand(ctx,{dark=false}={}){
  const color=dark?P.paper:P.ink;
  box(ctx,82,92,41,41,dark?P.lime:P.ink);box(ctx,91,102,10,10,dark?P.ink:P.lime);box(ctx,104,115,10,10,dark?P.ink:P.lime);
  text(ctx,'sideout.',140,132,52,color,{weight:700});
  label(ctx,'VALENCIA CITY, BUKIDNON',84,191,dark?'#c7cebc':'#67705c');
}
function footer(ctx,color=P.ink){label(ctx,'PLAY LOCAL. SHOW YOUR STYLE.',84,1824,color);label(ctx,'SIDEOUT / PICKLEBALL',996,1824,color,'right',400);}
function plus(ctx,x,y,color,size=18){box(ctx,x+size/3,y,size/3,size,color);box(ctx,x,y+size/3,size,size/3,color);}
function court(ctx,{top=650,bottom=1318,dark=false}={}){
  // A 20 × 44 court in perspective, including the non-volley zones and a woven net.
  const nearLeft=54,nearRight=1026,farLeft=250,farRight=830;
  shape(ctx,[[farLeft-36,top-25],[farRight+36,top-25],[1080,bottom+50],[0,bottom+50]],dark?'#3b5140':'#a5ba7a');
  shape(ctx,[[farLeft,top],[farRight,top],[nearRight,bottom],[nearLeft,bottom]],dark?'#607a4d':'#829d61');
  const netY=top+(bottom-top)*.38;
  const kitchenTop=netY-66,kitchenBottom=netY+96;
  const leftAt=y=>farLeft+(nearLeft-farLeft)*(y-top)/(bottom-top);
  const rightAt=y=>farRight+(nearRight-farRight)*(y-top)/(bottom-top);
  shape(ctx,[[leftAt(kitchenTop),kitchenTop],[rightAt(kitchenTop),kitchenTop],[rightAt(kitchenBottom),kitchenBottom],[leftAt(kitchenBottom),kitchenBottom]],dark?'#82965e':'#a4ba78');
  ctx.save();ctx.globalAlpha=.16;
  for(let y=top+20;y<bottom;y+=32)for(let x=leftAt(y)+18;x<rightAt(y)-10;x+=34)box(ctx,x,y,3,3,P.paper);
  ctx.restore();
  line(ctx,[[farLeft,top],[farRight,top],[nearRight,bottom],[nearLeft,bottom],[farLeft,top]],P.line,7);
  for(const y of [kitchenTop,kitchenBottom])line(ctx,[[leftAt(y),y],[rightAt(y),y]],P.line,6);
  line(ctx,[[540,top],[540,kitchenTop]],P.line,5);line(ctx,[[540,kitchenBottom],[540,bottom]],P.line,5);
  const netLeft=leftAt(netY)-23,netRight=rightAt(netY)+23;
  shape(ctx,[[netLeft,netY-90],[netRight,netY-90],[netRight,netY],[netLeft,netY]],dark?'#24352c':'#4b6148');
  ctx.save();ctx.globalAlpha=.52;
  for(let y=netY-80;y<netY;y+=13)line(ctx,[[netLeft,y],[netRight,y]],'#aebc98',2);
  for(let x=netLeft+12;x<netRight;x+=17)line(ctx,[[x,netY-87],[x,netY]],'#aebc98',2);
  ctx.restore();
  box(ctx,netLeft-5,netY-103,10,126,P.ink);box(ctx,netRight-5,netY-103,10,126,P.ink);
  line(ctx,[[netLeft-5,netY-94],[netRight+5,netY-94]],P.paper,9);
}
function ball(ctx,x,y,size=68){
  const unit=size/12;
  ctx.save();ctx.translate(Math.round(x-size/2),Math.round(y-size/2));
  shape(ctx,[[3*unit,0],[9*unit,0],[9*unit,unit],[11*unit,unit],[11*unit,3*unit],[12*unit,3*unit],[12*unit,9*unit],[11*unit,9*unit],[11*unit,11*unit],[9*unit,11*unit],[9*unit,12*unit],[3*unit,12*unit],[3*unit,11*unit],[unit,11*unit],[unit,9*unit],[0,9*unit],[0,3*unit],[unit,3*unit],[unit,unit],[3*unit,unit]],P.lime);
  box(ctx,3*unit,unit,5*unit,unit,'#eef8b7');
  for(const [hx,hy]of[[3,3],[7,2],[8,6],[3,7],[6,9]])box(ctx,hx*unit,hy*unit,2*unit,2*unit,'#718b40');
  ctx.restore();
}
function shadow(ctx,x,y,w,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,w,26,0,0,Math.PI*2);ctx.fill();}
function matchPanel(ctx,data,{y=1515,dark=false}={}){
  const ink=dark?P.paper:P.ink,muted=dark?'#c0cbb4':'#59624e';
  label(ctx,'SIDEOUT DOUBLES MMR',84,y,muted);
  text(ctx,data.rating,78,y+140,150,ink,{weight:500,width:590,min:60});
  label(ctx,data.level,86,y+189,muted);
  line(ctx,[[690,y+8],[690,y+180]],dark?'#59654e':'#87946d',2);
  label(ctx,'PLAYED',742,y+20,muted);text(ctx,data.games,742,y+76,55,ink,{width:250});
  label(ctx,'WON',742,y+120,muted);text(ctx,data.wins,742,y+176,55,ink,{width:250});
}
function rally(ctx,profile,data){
  box(ctx,0,0,1080,1920,P.ink);brand(ctx,{dark:true});
  text(ctx,'ONE MORE',78,345,121,P.paper,{weight:700,width:930});
  text(ctx,'RALLY.',76,490,152,P.lime,{weight:700,width:900});
  plus(ctx,957,389,P.coral,34);plus(ctx,92,554,P.coral,20);
  court(ctx,{top:675,bottom:1305,dark:true});
  shadow(ctx,475,1260,220,'#344830');
  const pose=drawAvatarPose(ctx,480,1265,5.7,profile,'swing');
  const impact=pose?.paddleTip||{x:792,y:950};
  const bx=Math.min(940,Math.max(680,impact.x+57)),by=Math.max(620,Math.min(1165,impact.y-25));
  // The stepped trail reads as a fast ball, with the impact next to the paddle face.
  ctx.save();ctx.globalAlpha=.23;for(let i=0;i<5;i++)box(ctx,bx+48+i*19,by-13-i*9,37-i*4,8,P.lime);ctx.restore();
  line(ctx,[[bx-48,by-20],[bx-72,by-30]],P.paper,6);line(ctx,[[bx-38,by-46],[bx-44,by-72]],P.coral,7);
  line(ctx,[[bx-29,by+44],[bx-34,by+66]],P.paper,6);ball(ctx,bx,by,67);
  box(ctx,78,1381,112,7,P.coral);label(ctx,'YOUR COURT. YOUR CHARACTER.',214,1398,'#c3cdb7');
  text(ctx,data.name,82,1480,75,P.paper,{width:916,min:32});
  matchPanel(ctx,data,{y:1534,dark:true});footer(ctx,'#c2ccb5');
}
function courtPose(ctx,profile,data){
  box(ctx,0,0,1080,1920,P.paper);brand(ctx);
  box(ctx,900,82,100,7,P.coral);box(ctx,963,109,37,7,P.coral);
  label(ctx,'THE LOCAL CLUBHOUSE',84,282,'#6a774f');
  text(ctx,'YOUR COURT.',78,406,111,P.ink,{weight:700,width:930});
  text(ctx,'YOUR MOMENT.',78,523,104,'#819447',{weight:700,width:930});
  court(ctx,{top:700,bottom:1320});
  plus(ctx,169,640,P.coral,26);plus(ctx,892,609,P.ink,23);plus(ctx,935,1140,P.lime,21);
  shadow(ctx,540,1263,205,'#667f4c');
  drawAvatarPose(ctx,525,1308,5.2,profile,'victory');
  ball(ctx,213,1220,58);
  box(ctx,54,1400,972,356,P.coral);
  label(ctx,'MADE FOR THE COURT.',88,1459,'#634737');
  text(ctx,data.name,84,1546,75,P.ink,{width:910,min:32});
  text(ctx,data.rating,83,1684,112,P.ink,{weight:500,width:510,min:52});
  label(ctx,'DOUBLES MMR',89,1723,'#634737');
  label(ctx,data.level,960,1629,'#634737','right',420);
  label(ctx,data.summary,960,1680,P.ink,'right',420);
  footer(ctx,'#66705c');
}
function player(ctx,profile,data){
  box(ctx,0,0,1080,1920,P.paper);box(ctx,54,54,972,1812,P.lime);
  brand(ctx);text(ctx,'LET’S',77,426,188,'#b8cf6e',{weight:700,width:910});text(ctx,'PLAY.',75,604,188,'#b8cf6e',{weight:700,width:910});
  plus(ctx,911,367,'#819447',30);
  shadow(ctx,540,1163,225,'#b3cb68');drawAvatar(ctx,505,1180,6.8,profile);
  text(ctx,data.name,540,1314,75,P.ink,{align:'center',width:850,min:32});
  label(ctx,'YOUR GAME. YOUR CHARACTER.',540,1372,'#53632f','center');
  box(ctx,54,1430,972,359,P.coral);
  label(ctx,'SIDEOUT DOUBLES MMR',540,1490,'#634737','center');
  text(ctx,data.rating,540,1635,154,P.ink,{align:'center',weight:500,width:850,min:64});
  label(ctx,data.level,540,1697,'#634737','center');label(ctx,data.summary,540,1745,'#634737','center');
  label(ctx,'PLAY LOCAL. SHOW YOUR STYLE.',540,1825,'#53632f','center');
}

/** Render a complete, downloadable 1080 × 1920 story from the selected saved look. */
export function drawStoryCard(canvas,{profile={},stats=null,template='rally'}={}){
  if(canvas.width!==1080)canvas.width=1080;if(canvas.height!==1920)canvas.height=1920;
  const ctx=canvas.getContext('2d');ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,1080,1920);ctx.imageSmoothingEnabled=false;
  const details=getStoryDetails(profile,stats),choice=templateFor(template);
  ({rally,court:courtPose,player})[choice.id](ctx,profile,details);
  ctx.restore();return canvas;
}
