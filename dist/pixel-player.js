import {outfitItems,DEFAULT_EQUIPMENT} from './wardrobe.js';
import {normalizeHair} from './hairstyles.js';

// Draw at native sprite resolution, then enlarge without smoothing.
const OUTLINE='#25313b';
function colorShift(hex,amount){const n=parseInt(hex.slice(1),16);return'#'+[n>>16,(n>>8)&255,n&255].map(c=>Math.max(0,Math.min(255,c+amount)).toString(16).padStart(2,'0')).join('');}
function box(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));}
function shape(ctx,points,color){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...points[0]);for(const point of points.slice(1))ctx.lineTo(...point);ctx.closePath();ctx.fill();}
function hairPalette(color){return{base:color,shadow:colorShift(color,-28),mid:colorShift(color,-12),light:colorShift(color,27)};}
function hairLayer(ctx,covered,draw){
 ctx.save();
 // A fitted cap tucks the crown away while side strands and tails stay visible.
 if(covered){ctx.beginPath();ctx.rect(0,17,88,103);ctx.clip();}
 draw();ctx.restore();
}
function hairBack(ctx,style,palette,covered,tieColor){
 const {base,shadow,mid,light}=palette;
 hairLayer(ctx,covered,()=>{
  if(style==='bob'){
   shape(ctx,[[22,6],[42,6],[47,11],[49,25],[48,33],[39,35],[25,35],[17,32],[17,14]],OUTLINE);
   shape(ctx,[[22,8],[41,8],[45,12],[47,26],[46,31],[39,33],[25,33],[19,30],[19,15]],shadow);
   box(ctx,19,16,3,14,base);box(ctx,20,21,1,8,light);box(ctx,44,17,2,13,mid);
  }else if(style==='long'){
   shape(ctx,[[23,5],[41,5],[47,11],[49,25],[47,33],[51,44],[49,49],[41,51],[24,51],[17,47],[18,36],[16,26],[18,12]],OUTLINE);
   shape(ctx,[[23,7],[40,7],[45,12],[47,25],[45,34],[49,44],[47,47],[40,49],[25,49],[19,45],[20,36],[18,26],[20,13]],base);
   shape(ctx,[[43,15],[46,24],[43,33],[47,44],[45,47],[41,44],[40,34]],shadow);
   shape(ctx,[[21,17],[23,24],[21,33],[24,43],[22,47],[20,44],[19,34]],light);
   box(ctx,24,34,2,13,mid);box(ctx,44,37,1,8,light);
  }else if(style==='ponytail'){
   shape(ctx,[[43,15],[48,13],[53,17],[55,25],[53,34],[56,42],[52,47],[46,43],[46,34],[44,26]],OUTLINE);
   shape(ctx,[[46,17],[49,16],[51,19],[53,25],[51,34],[53,41],[51,44],[48,41],[48,33],[46,25]],base);
   shape(ctx,[[49,19],[51,25],[49,33],[51,40],[50,42],[48,35],[48,26]],light);
   box(ctx,51,24,2,8,shadow);box(ctx,46,18,6,3,tieColor);box(ctx,47,18,4,1,colorShift(tieColor,28));
  }else if(style==='bun'&&!covered){
   shape(ctx,[[29,2],[32,0],[38,0],[42,3],[42,8],[38,11],[30,10],[27,6]],OUTLINE);
   shape(ctx,[[30,3],[33,1],[37,1],[40,4],[40,7],[37,9],[31,8],[29,6]],base);
   box(ctx,32,2,5,2,light);box(ctx,37,5,3,2,shadow);box(ctx,31,7,6,1,mid);box(ctx,29,8,12,2,tieColor);
  }else if(style==='afro'){
   shape(ctx,[[23,4],[27,1],[38,1],[42,4],[47,5],[50,10],[50,19],[47,25],[41,28],[24,28],[18,24],[15,18],[15,10],[18,6]],OUTLINE);
   shape(ctx,[[24,5],[28,3],[37,3],[41,6],[45,7],[48,11],[48,18],[45,23],[40,26],[25,26],[20,22],[17,17],[17,11],[20,8]],shadow);
   box(ctx,18,12,4,5,base);box(ctx,19,19,4,3,mid);box(ctx,45,12,3,5,mid);box(ctx,44,20,2,3,base);
  }
 });
}
function hairFront(ctx,style,palette,covered){
 const {base,shadow,mid,light}=palette;
 hairLayer(ctx,covered,()=>{
  if(style==='buzz'){
   shape(ctx,[[22,12],[23,8],[27,6],[38,6],[42,9],[44,13],[42,15],[40,11],[27,11],[24,15]],shadow);
   box(ctx,27,7,11,2,base);box(ctx,25,9,3,2,base);box(ctx,31,9,1,1,light);box(ctx,36,8,1,1,light);box(ctx,40,12,2,3,mid);
  }else if(style==='side-part'){
   shape(ctx,[[21,14],[22,8],[26,4],[38,3],[43,6],[45,12],[43,16],[40,13],[40,10],[34,9],[31,13],[26,15],[23,16]],OUTLINE);
   shape(ctx,[[23,13],[24,8],[27,6],[34,5],[34,9],[30,12],[26,13]],base);
   shape(ctx,[[36,5],[40,7],[43,10],[42,13],[40,11],[35,9]],mid);
   box(ctx,28,6,5,2,light);box(ctx,25,9,5,1,light);box(ctx,34,5,1,5,shadow);box(ctx,22,16,2,6,shadow);box(ctx,42,15,2,7,shadow);
  }else if(style==='spiky'){
   shape(ctx,[[21,14],[22,8],[24,9],[23,3],[28,7],[30,0],[34,6],[38,1],[39,7],[44,4],[43,11],[45,12],[43,17],[39,13],[35,11],[29,12],[24,16]],OUTLINE);
   shape(ctx,[[24,13],[25,9],[26,7],[29,9],[31,3],[34,9],[37,5],[38,10],[42,8],[41,13],[38,11],[34,10],[28,11]],base);
   box(ctx,30,6,2,4,light);box(ctx,36,7,1,3,light);box(ctx,27,10,3,1,mid);box(ctx,39,11,3,2,shadow);box(ctx,22,16,2,5,shadow);box(ctx,42,16,2,6,shadow);
  }else if(style==='curly'){
   shape(ctx,[[21,15],[19,11],[20,7],[24,6],[25,3],[30,3],[32,1],[36,2],[38,4],[42,4],[45,8],[46,12],[43,17],[39,15],[37,12],[33,14],[29,12],[25,16]],OUTLINE);
   shape(ctx,[[22,12],[21,9],[25,8],[27,5],[31,5],[33,3],[36,4],[37,6],[41,6],[43,9],[44,12],[41,15],[38,12],[35,11],[33,12],[29,10],[25,14]],base);
   for(const [x,y]of [[23,9],[28,6],[33,4],[38,7],[40,11],[31,10]]){box(ctx,x,y,3,1,light);box(ctx,x,y+1,1,2,light);box(ctx,x+2,y+2,2,2,shadow);}
   box(ctx,21,15,3,6,shadow);box(ctx,42,16,2,6,shadow);
  }else if(style==='afro'){
   shape(ctx,[[19,13],[18,9],[21,6],[25,5],[28,2],[37,2],[41,5],[45,7],[47,11],[46,16],[43,17],[40,13],[36,12],[32,14],[28,12],[24,16]],base);
   for(const [x,y]of [[21,8],[26,5],[31,3],[37,5],[42,9],[20,13],[27,10],[34,8],[39,12]]){box(ctx,x,y,3,1,light);box(ctx,x,y+1,1,2,mid);box(ctx,x+2,y+2,2,2,shadow);}
   box(ctx,18,17,3,5,base);box(ctx,45,17,3,5,base);box(ctx,20,21,2,3,mid);box(ctx,43,22,2,3,shadow);
  }else if(style==='bob'){
   shape(ctx,[[20,14],[21,8],[25,5],[39,5],[44,9],[46,17],[46,28],[43,32],[41,28],[41,14],[37,13],[34,10],[29,14],[24,14],[23,30],[20,31],[19,26]],base);
   box(ctx,25,7,12,2,light);box(ctx,21,13,2,16,mid);box(ctx,22,16,1,12,light);box(ctx,43,14,2,14,shadow);box(ctx,40,10,3,3,mid);box(ctx,25,12,4,1,shadow);
  }else if(style==='long'){
   shape(ctx,[[21,16],[21,9],[25,5],[39,5],[44,9],[45,18],[43,28],[46,36],[44,44],[41,41],[40,32],[41,22],[40,13],[34,10],[28,13],[24,20],[23,30],[25,39],[23,45],[20,39],[20,29]],base);
   box(ctx,26,7,7,2,light);box(ctx,33,6,1,4,shadow);box(ctx,35,8,5,2,mid);
   shape(ctx,[[22,15],[23,15],[22,28],[24,38],[22,41],[21,30]],light);
   shape(ctx,[[42,13],[44,17],[42,28],[45,36],[43,41],[42,34],[40,29]],shadow);box(ctx,43,33,1,6,mid);
  }else if(style==='ponytail'||style==='bun'){
   shape(ctx,[[22,13],[23,7],[28,4],[38,4],[43,8],[45,14],[42,17],[40,12],[36,10],[28,11],[24,16]],base);
   box(ctx,28,6,9,2,light);box(ctx,24,9,3,3,mid);box(ctx,38,8,4,2,mid);box(ctx,40,12,3,3,shadow);
   box(ctx,22,16,2,10,shadow);box(ctx,23,18,1,6,light);box(ctx,42,16,2,11,shadow);
   if(style==='bun'){box(ctx,26,11,2,1,shadow);box(ctx,34,9,3,1,mid);}
  }else{
   shape(ctx,[[21,13],[22,8],[26,4],[37,4],[42,7],[44,12],[43,16],[40,14],[40,11],[35,11],[32,13],[28,11],[24,15]],OUTLINE);
   shape(ctx,[[23,12],[24,8],[27,6],[36,6],[40,8],[42,12],[41,13],[38,10],[33,10],[31,11],[28,9],[25,12]],base);
   box(ctx,28,6,8,2,light);box(ctx,25,9,2,2,mid);box(ctx,39,10,3,3,shadow);box(ctx,22,16,2,6,shadow);box(ctx,42,16,2,6,shadow);
  }
 });
}
function mark(ctx,x,y,brand,color){const rows=brand==='Nike'?['       #','     ## ','#  ###  ','#####   ',' ###    ']:brand==='Adidas'?['      # ','   # ## ','# ## ## ','# ## ## ']:[];rows.forEach((row,dy)=>[...row].forEach((pixel,dx)=>{if(pixel==='#')box(ctx,x+dx,y+dy,1,1,color);}));}
function cap(ctx,item,x=20,y=5){
 const c=item.color,dark=colorShift(c,-28),light=colorShift(c,19);
 if(item.style==='visor'){box(ctx,x,y+7,25,4,c);box(ctx,x+18,y+10,19,3,dark);box(ctx,x+3,y+7,19,1,light);mark(ctx,x+7,y+7,item.brand,item.trim);return;}
 shape(ctx,[[x+3,y],[x+18,y],[x+23,y+4],[x+24,y+11],[x,y+11],[x,y+5]],OUTLINE);
 shape(ctx,[[x+4,y+1],[x+17,y+1],[x+21,y+5],[x+22,y+10],[x+2,y+10],[x+2,y+5]],c);
 box(ctx,x+3,y+4,3,6,light);box(ctx,x+19,y+5,3,5,dark);box(ctx,x+10,y+1,2,6,dark);box(ctx,x+10,y-1,3,2,c);
 const brimX=item.style==='reverse'?x-10:x+17;box(ctx,brimX,y+11,20,3,OUTLINE);box(ctx,brimX+1,y+11,18,2,item.trim);box(ctx,brimX+3,y+11,13,1,colorShift(item.trim,15));
 if(item.style==='panel'){box(ctx,x+7,y+3,10,7,item.trim);mark(ctx,x+8,y+4,item.brand,c);}
 else if(item.style==='mesh'){for(let dy=3;dy<10;dy+=2)for(let dx=3;dx<22;dx+=3)box(ctx,x+dx,y+dy,1,1,dark);mark(ctx,x+7,y+5,item.brand,item.trim);}
 else{mark(ctx,x+7,y+5,item.brand,item.trim);}
 if(item.style==='stripe'){box(ctx,x+3,y+3,1,7,item.trim);box(ctx,x+5,y+2,1,8,item.trim);box(ctx,x+7,y+2,1,8,item.trim);}
}
function jersey(ctx,item,left,width,female=false){
 const right=left+width,c=item.color,shadow=colorShift(c,-26),light=colorShift(c,19),waist=female?3:1;
 shape(ctx,[[left+4,31],[right-4,31],[right,35],[right-1,45],[right-waist,57],[left+waist,57],[left+1,45],[left,35]],OUTLINE);
 shape(ctx,[[left+4,33],[right-4,33],[right-2,36],[right-3,44],[right-waist-1,55],[left+waist+1,55],[left+2,44],[left+2,36]],c);
 box(ctx,right-waist-4,36,2,19,shadow);box(ctx,left+3,36,1,16,light);box(ctx,left+waist+2,54,width-waist*2-4,1,light);
 if(item.style!=='tank'){box(ctx,left-5,35,7,10,OUTLINE);box(ctx,left-4,36,7,8,item.style==='raglan'?item.trim:c);box(ctx,right-1,35,7,10,OUTLINE);box(ctx,right-1,36,6,8,item.style==='raglan'?item.trim:c);box(ctx,left-4,43,7,1,shadow);box(ctx,right,43,5,1,shadow);}
 const neckX=left+width/2-5;
 if(item.style==='polo'){shape(ctx,[[neckX-2,32],[neckX+5,35],[neckX+12,32],[neckX+8,39],[neckX+5,36],[neckX+2,39]],item.trim);box(ctx,neckX+5,37,1,7,shadow);box(ctx,neckX+5,39,1,1,item.trim);box(ctx,neckX+5,42,1,1,item.trim);}
 else{box(ctx,neckX,33,10,2,item.trim);box(ctx,neckX+2,35,6,1,item.trim);}
 if(item.style==='zip'){box(ctx,left+width/2,36,1,19,item.trim);box(ctx,left+width/2-1,38,3,2,OUTLINE);box(ctx,left+4,48,6,1,shadow);box(ctx,right-10,48,6,1,shadow);}
 if(item.style==='panel'){box(ctx,left+3,44,width-6,3,item.trim);box(ctx,left+3,47,width-6,1,shadow);}
 if(item.style==='jersey'){box(ctx,left+3,44,width-6,4,item.trim);box(ctx,left+width/2-2,44,4,4,c);}
 if(item.brand==='Adidas'){for(let n=0;n<3;n++){box(ctx,left-3+n*2,36,1,6,item.trim);box(ctx,right+n*2,36,1,6,item.trim);}}
 mark(ctx,right-12,39,item.brand,item.trim);
}
function bottoms(ctx,item,left,width,footY,skin=null){
 const c=item.color,shadow=colorShift(c,-28),light=colorShift(c,17),pants=item.category==='pants',legWidth=Math.floor((width-4)/2),right=left+width;
 const hem=pants?footY+1:70;
 box(ctx,left,55,width,5,OUTLINE);box(ctx,left+1,56,width-2,3,c);
 shape(ctx,[[left,59],[right,59],[right-1,hem],[left+legWidth+4,hem],[left+legWidth+2,64],[left+legWidth,hem],[left+1,hem]],OUTLINE);
 box(ctx,left+2,60,legWidth-1,hem-61,c);box(ctx,left+legWidth+4,60,legWidth-1,hem-61,c);
 box(ctx,left+legWidth-1,60,2,hem-61,shadow);box(ctx,right-4,60,2,hem-61,shadow);box(ctx,left+3,61,1,hem-64,light);
 box(ctx,left+width/2-2,57,1,4,item.trim);box(ctx,left+width/2+1,57,1,4,item.trim);
 if(item.style==='stripe'){for(let n=0;n<3;n++){box(ctx,left+1+n*2,61,1,hem-62,item.trim);box(ctx,right-6+n*2,61,1,hem-62,item.trim);}}
 if(item.style==='panel'){box(ctx,left+2,63,3,hem-65,item.trim);box(ctx,right-5,63,3,hem-65,item.trim);}
 if(item.style==='split'){box(ctx,left+2,hem-3,legWidth-2,1,item.trim);box(ctx,left+legWidth+4,hem-3,legWidth-2,1,item.trim);if(skin){box(ctx,left,hem-2,2,2,skin);box(ctx,right-1,hem-2,2,2,skin);}else{ctx.clearRect(left,hem-2,2,2);ctx.clearRect(right-1,hem-2,2,2);}}
 if(item.style==='cargo'){box(ctx,left+3,66,7,9,shadow);box(ctx,left+4,67,5,7,c);box(ctx,left+3,66,7,2,item.trim);box(ctx,right-10,66,7,9,shadow);box(ctx,right-10,66,7,2,item.trim);}
 if(item.style==='jogger'){box(ctx,left+2,hem-3,legWidth-1,3,shadow);box(ctx,left+legWidth+4,hem-3,legWidth-1,3,shadow);box(ctx,left+3,hem-2,legWidth-3,1,item.trim);}
 mark(ctx,right-12,61,item.brand,item.trim);
}
function sprite(profile){
 const canvas=document.createElement('canvas');canvas.width=88;canvas.height=120;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
 const female=profile.characterType==='female',skin=profile.skin||'#cf986c',shade=colorShift(skin,-24),highlight=colorShift(skin,19);
 const torsoWidth={lean:24,regular:28,broad:34}[profile.bodyType]||28,left=33-torsoWidth/2,right=left+torsoWidth;
 const footY=83+Math.round(((profile.height||170)-170)/5),outfit=outfitItems({...DEFAULT_EQUIPMENT,...profile}),ankleWidth={lean:7,regular:8,broad:10}[profile.bodyType]||8;
 const {hairStyle,hairColor}=normalizeHair(profile),hair=hairPalette(hairColor),covered=profile.hat==='cap'&&outfit.cap.style!=='visor';
 // Hair and neck are behind the clothes; the paddle hand bends toward the grip.
 hairBack(ctx,hairStyle,hair,covered,outfit.shirt.color);
 box(ctx,28,26,10,9,OUTLINE);box(ctx,29,27,8,7,skin);box(ctx,34,28,3,6,shade);
 // Legs have separate shading and socks. Pants cover them without changing stature.
 for(const x of [left+4,right-ankleWidth-4]){box(ctx,x-1,65,ankleWidth+2,footY-64,OUTLINE);box(ctx,x,66,ankleWidth,footY-65,skin);box(ctx,x+ankleWidth-2,66,2,footY-65,shade);box(ctx,x-1,footY-4,ankleWidth+2,6,'#f0eedc');box(ctx,x,footY-3,ankleWidth,1,'#98b181');}
 bottoms(ctx,outfit.bottom,left+1,torsoWidth-2,footY,skin);
 // Small stepped running shoes with laces and a contrasting sole.
 for(const [x,flip]of [[left+1,false],[right-ankleWidth-5,true]]){shape(ctx,[[x+2,footY],[x+ankleWidth+3,footY],[x+ankleWidth+4,footY+3],[x+ankleWidth+6,footY+5],[x+ankleWidth+6,footY+9],[x,footY+9],[x,footY+4]],OUTLINE);box(ctx,x+2,footY+1,ankleWidth+1,5,'#eeeedd');box(ctx,x+2,footY+2,3,2,'#fffdf1');box(ctx,x+6,footY+3,3,1,'#7b8792');box(ctx,x+5,footY+5,5,1,'#a0b195');box(ctx,x+1,footY+7,ankleWidth+4,2,'#d4d6ca');}
 // Arm skin appears beneath sleeves. The hands have individual finger highlights.
 box(ctx,left-6,39,7,24,OUTLINE);box(ctx,left-5,40,5,21,skin);box(ctx,left-5,43,1,16,highlight);box(ctx,left-1,45,1,16,shade);box(ctx,left-5,60,5,6,OUTLINE);box(ctx,left-4,60,4,5,skin);box(ctx,left-3,62,1,2,shade);
 box(ctx,right,38,7,17,OUTLINE);box(ctx,right+1,39,5,14,skin);box(ctx,right+2,51,15,7,OUTLINE);box(ctx,right+3,52,13,5,skin);box(ctx,right+3,55,11,1,shade);
 jersey(ctx,outfit.shirt,left,torsoWidth,female);
 // A softer head silhouette, brows, eye glints, nose and cheek highlights.
 shape(ctx,[[23,7],[41,7],[45,11],[45,23],[41,29],[36,31],[27,30],[21,25],[20,13]],OUTLINE);
 shape(ctx,[[24,9],[40,9],[43,12],[43,22],[40,27],[35,29],[28,28],[23,24],[22,14]],skin);
 box(ctx,23,13,2,10,highlight);box(ctx,40,14,3,10,shade);box(ctx,29,28,7,1,shade);
 box(ctx,18,18,4,7,OUTLINE);box(ctx,19,19,3,5,skin);box(ctx,19,21,1,2,shade);box(ctx,44,18,4,7,OUTLINE);box(ctx,44,19,3,5,skin);box(ctx,46,20,1,3,shade);
 hairFront(ctx,hairStyle,hair,covered);
 box(ctx,25,17,5,1,hair.shadow);box(ctx,36,17,5,1,hair.shadow);box(ctx,26,19,3,3,'#25313b');box(ctx,37,19,3,3,'#25313b');box(ctx,26,19,1,1,'#fbf3df');box(ctx,37,19,1,1,'#fbf3df');
 box(ctx,32,21,2,4,shade);box(ctx,32,21,1,2,highlight);box(ctx,29,26,7,1,'#795041');box(ctx,30,27,5,1,colorShift(skin,-10));box(ctx,24,24,3,1,colorShift(skin,-8));box(ctx,38,24,2,1,colorShift(skin,-8));
 if(profile.hat==='cap')cap(ctx,outfit.cap);
 if(profile.hat==='headband'){box(ctx,21,13,24,3,'#eee9d5');box(ctx,22,13,22,1,'#fffae8');box(ctx,44,14,4,2,outfit.shirt.color);box(ctx,46,16,2,7,outfit.shirt.color);}
 // Textured pickleball paddle with a wrapped handle.
 const paddle=profile.paddle||'#7286bb',px=right+8;
 box(ctx,px+4,49,5,22,OUTLINE);box(ctx,px+5,50,3,20,'#725849');for(let y=53;y<69;y+=4)box(ctx,px+5,y,3,1,'#a6947a');
 shape(ctx,[[px+1,32],[px+10,32],[px+14,36],[px+14,48],[px+10,53],[px+1,53],[px-3,48],[px-3,37]],OUTLINE);
 shape(ctx,[[px+2,34],[px+9,34],[px+12,37],[px+12,47],[px+9,51],[px+2,51],[px-1,47],[px-1,38]],paddle);
 box(ctx,px+1,37,2,10,colorShift(paddle,33));box(ctx,px+9,38,2,10,colorShift(paddle,-25));for(let y=38;y<49;y+=3)for(let x=px+4;x<px+9;x+=3)box(ctx,x,y,1,1,colorShift(paddle,13));box(ctx,px+4,42,4,3,'#d4dfd5');
 box(ctx,px+3,55,4,3,skin);box(ctx,px+4,55,1,2,highlight);
 return{canvas,ground:footY+10};
}
export function drawAvatar(ctx,cx,ground,scale,profile){const image=sprite(profile);ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(image.canvas,Math.round(cx-36*scale),Math.round(ground-image.ground*scale),Math.round(88*scale),Math.round(120*scale));ctx.restore();}

// Story sprites are articulated at native resolution. The profile renderer above
// stays unchanged: these poses have their own arms, bent legs and paddle grip.
function pixelStroke(ctx,a,b,width,color){
 const steps=Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]),1),half=Math.floor(width/2);
 for(let i=0;i<=steps;i++){const t=i/steps;box(ctx,Math.round(a[0]+(b[0]-a[0])*t)-half,Math.round(a[1]+(b[1]-a[1])*t)-half,width,width,color);}
}
function pointBetween(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}
function storyLimb(ctx,a,joint,b,width,color,shadow,highlight){
 for(const [start,end]of [[a,joint],[joint,b]])pixelStroke(ctx,start,end,width+2,OUTLINE);
 for(const [start,end]of [[a,joint],[joint,b]])pixelStroke(ctx,start,end,width,color);
 for(const [start,end]of [[a,joint],[joint,b]]){pixelStroke(ctx,[start[0]+width/2-1,start[1]],[end[0]+width/2-1,end[1]],2,shadow);if(highlight)pixelStroke(ctx,[start[0]-width/2+1,start[1]],[end[0]-width/2+1,end[1]],1,highlight);}
}
function storyShoe(ctx,ankle,direction,width){
 const x=ankle[0],y=ankle[1];
 pixelStroke(ctx,[x,y-4],[x,y+1],width+1,'#f0eedc');box(ctx,x-width/2,y-3,width,1,'#98b181');
 const left=x-width/2-(direction<0?5:1),right=x+width/2+(direction>0?5:1);
 shape(ctx,[[left+2,y],[right-3,y],[right-1,y+3],[right+1,y+4],[right+1,y+8],[left-1,y+8],[left-1,y+3]],OUTLINE);
 box(ctx,left+1,y+2,right-left-1,4,'#eeeedd');box(ctx,left+2,y+2,Math.max(3,width-2),1,'#fffdf1');
 box(ctx,x-2,y+3,5,1,'#7b8792');box(ctx,x-1,y+5,5,1,'#a0b195');box(ctx,left,y+6,right-left,2,'#d4d6ca');
}
function storyLeg(ctx,hip,knee,ankle,width,item,skin){
 const pants=item.category==='pants',shade=colorShift(skin,-24),highlight=colorShift(skin,19),c=item.color,dark=colorShift(c,-28),light=colorShift(c,17);
 storyLimb(ctx,hip,knee,ankle,width,skin,shade,highlight);
 const hem=pants?ankle:pointBetween(hip,knee,.72);
 if(pants)storyLimb(ctx,hip,knee,hem,width+2,c,dark,light);
 else{pixelStroke(ctx,hip,hem,width+4,OUTLINE);pixelStroke(ctx,hip,hem,width+2,c);pixelStroke(ctx,[hip[0]+width/2,hip[1]],[hem[0]+width/2,hem[1]],2,dark);}
 if(item.style==='stripe')for(let n=0;n<3;n++)pixelStroke(ctx,[hip[0]-width/2+n*2,hip[1]+1],[hem[0]-width/2+n*2,hem[1]-1],1,item.trim);
 if(item.style==='panel')pixelStroke(ctx,[hip[0]-width/2+1,hip[1]+2],[hem[0]-width/2+1,hem[1]-2],3,item.trim);
 if(item.style==='split'){pixelStroke(ctx,[hem[0]-width/2,hem[1]],[hem[0]+width/2,hem[1]],1,item.trim);box(ctx,hem[0]+width/2,hem[1]-1,2,2,skin);}
 if(item.style==='cargo'){const pocket=pointBetween(hip,knee,.46);box(ctx,pocket[0]-3,pocket[1]-2,7,7,dark);box(ctx,pocket[0]-2,pocket[1]-1,5,5,c);box(ctx,pocket[0]-3,pocket[1]-2,7,1,item.trim);}
 if(item.style==='jogger'){pixelStroke(ctx,pointBetween(knee,ankle,.88),ankle,width+2,dark);pixelStroke(ctx,[ankle[0]-width/2,ankle[1]-1],[ankle[0]+width/2,ankle[1]-1],1,item.trim);}
}
function storyHead(ctx,profile,shirt,originX,originY,layer,celebrating=false){
 const skin=profile.skin||'#cf986c',shade=colorShift(skin,-24),highlight=colorShift(skin,19),outfit=outfitItems({...DEFAULT_EQUIPMENT,...profile});
 const {hairStyle,hairColor}=normalizeHair(profile),hair=hairPalette(hairColor),covered=profile.hat==='cap'&&outfit.cap.style!=='visor';
 ctx.save();ctx.translate(Math.round(originX),Math.round(originY));
 if(layer==='back'){hairBack(ctx,hairStyle,hair,covered,shirt.color);box(ctx,28,26,10,9,OUTLINE);box(ctx,29,27,8,7,skin);box(ctx,34,28,3,6,shade);ctx.restore();return;}
 shape(ctx,[[23,7],[41,7],[45,11],[45,23],[41,29],[36,31],[27,30],[21,25],[20,13]],OUTLINE);
 shape(ctx,[[24,9],[40,9],[43,12],[43,22],[40,27],[35,29],[28,28],[23,24],[22,14]],skin);
 box(ctx,23,13,2,10,highlight);box(ctx,40,14,3,10,shade);box(ctx,29,28,7,1,shade);
 box(ctx,18,18,4,7,OUTLINE);box(ctx,19,19,3,5,skin);box(ctx,19,21,1,2,shade);box(ctx,44,18,4,7,OUTLINE);box(ctx,44,19,3,5,skin);box(ctx,46,20,1,3,shade);
 hairFront(ctx,hairStyle,hair,covered);
 box(ctx,25,17,5,1,hair.shadow);box(ctx,36,17,5,1,hair.shadow);
 if(celebrating){box(ctx,26,20,3,1,OUTLINE);box(ctx,27,19,1,1,OUTLINE);box(ctx,37,20,3,1,OUTLINE);box(ctx,38,19,1,1,OUTLINE);box(ctx,29,25,8,3,'#795041');box(ctx,30,25,6,1,'#fff8e4');box(ctx,31,28,4,1,shade);}
 else{for(const x of [27,38]){box(ctx,x,19,3,3,OUTLINE);box(ctx,x,19,1,1,'#fbf3df');}box(ctx,29,26,7,1,'#795041');box(ctx,30,27,5,1,colorShift(skin,-10));}
 box(ctx,32,21,2,4,shade);box(ctx,32,21,1,2,highlight);box(ctx,24,24,3,1,colorShift(skin,-8));box(ctx,38,24,2,1,colorShift(skin,-8));
 if(profile.hat==='cap')cap(ctx,outfit.cap);
 if(profile.hat==='headband'){box(ctx,21,13,24,3,'#eee9d5');box(ctx,22,13,22,1,'#fffae8');box(ctx,44,14,4,2,shirt.color);box(ctx,46,16,2,7,shirt.color);}
 ctx.restore();
}
function storyPaddle(ctx,hand,direction,paddle,skin){
 const axis=direction,side=[-axis[1],axis[0]],center=[hand[0]+axis[0]*18,hand[1]+axis[1]*18];
 const at=(along,across)=>[Math.round(center[0]+axis[0]*along+side[0]*across),Math.round(center[1]+axis[1]*along+side[1]*across)];
 pixelStroke(ctx,hand,at(-7,0),6,OUTLINE);pixelStroke(ctx,hand,at(-7,0),4,'#725849');
 for(let n=2;n<9;n+=3){const p=[hand[0]+axis[0]*n,hand[1]+axis[1]*n];pixelStroke(ctx,[p[0]-side[0]*1.5,p[1]-side[1]*1.5],[p[0]+side[0]*1.5,p[1]+side[1]*1.5],1,'#b8a387');}
 const outline=[at(-11,-4),at(-7,-9),at(7,-9),at(11,-4),at(11,4),at(7,9),at(-7,9),at(-11,4)];
 shape(ctx,outline,OUTLINE);shape(ctx,[at(-9,-3),at(-6,-7),at(6,-7),at(9,-3),at(9,3),at(6,7),at(-6,7),at(-9,3)],paddle);
 pixelStroke(ctx,at(-5,-6),at(5,-6),2,colorShift(paddle,33));pixelStroke(ctx,at(-5,6),at(5,6),2,colorShift(paddle,-25));
 for(const a of [-5,0,5])for(const s of [-3,2]){const p=at(a,s);box(ctx,p[0],p[1],1,1,colorShift(paddle,17));}
 const badge=at(0,0);box(ctx,badge[0]-2,badge[1]-1,4,3,'#d4dfd5');
 // The thumb sits over the handle, so the paddle is visibly held.
 box(ctx,hand[0]-2,hand[1]-2,5,5,OUTLINE);box(ctx,hand[0]-1,hand[1]-2,4,4,skin);box(ctx,hand[0],hand[1]-2,1,2,colorShift(skin,19));
 return outline.reduce((furthest,p)=>p[0]>furthest[0]?p:furthest,outline[0]);
}
function storySprite(profile,requestedPose){
 const pose=['swing','ready','victory'].includes(requestedPose)?requestedPose:'ready';
 const canvas=document.createElement('canvas');canvas.width=168;canvas.height=164;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
 const origin=[80,156],height=Math.max(120,Math.min(220,Number(profile.height)||170)),h=(height-170)/5;
 const female=profile.characterType==='female',width={lean:24,regular:28,broad:34}[profile.bodyType]||28,legWidth={lean:7,regular:8,broad:10}[profile.bodyType]||8;
 const outfit=outfitItems({...DEFAULT_EQUIPMENT,...profile}),skin=profile.skin||'#cf986c',shade=colorShift(skin,-24),highlight=colorShift(skin,19);
 const hip=pose==='swing'?[-4,-37-h*.7]:pose==='victory'?[-3,-43-h]:[0,-43-h],lean=pose==='swing'?8:pose==='victory'?1:0,shoulderY=hip[1]-26,shoulderX=hip[0]+lean;
 const leftShoulder=[shoulderX-width/2+1,shoulderY+5],rightShoulder=[shoulderX+width/2-1,shoulderY+5];
 const leftArm=pose==='swing'?[leftShoulder,[-30,shoulderY+14],[-46,shoulderY+6]]:pose==='victory'?[leftShoulder,[-28,-84-h],[-34,-103-h]]:[leftShoulder,[-27,-52-h*.7],[-12,-44-h*.7]];
 const rightArm=pose==='swing'?[rightShoulder,[34,shoulderY+12],[48,shoulderY-1]]:pose==='victory'?[rightShoulder,[28,-81-h],[36,-99-h]]:[rightShoulder,[31,-52-h*.7],[23,-44-h*.7]];
 const leftLeg=pose==='swing'?[[hip[0]-8,hip[1]+2],[-28,-20-h*.3],[-37,-8]]:[[hip[0]-8,hip[1]+2],[-22,-24-h*.4],[-26,-8]];
 const rightLeg=pose==='swing'?[[hip[0]+8,hip[1]+2],[14,-23-h*.3],[29,-8]]:pose==='victory'?[[hip[0]+8,hip[1]+2],[16,-25-h*.4],[21,-8]]:[[hip[0]+8,hip[1]+2],[22,-24-h*.4],[26,-8]];
 ctx.translate(...origin);
 storyHead(ctx,profile,outfit.shirt,shoulderX-33,shoulderY-31,'back');
 storyLimb(ctx,...leftArm,6,skin,shade,highlight);
 storyLeg(ctx,...leftLeg,legWidth,outfit.bottom,skin);storyShoe(ctx,leftLeg[2],-1,legWidth);
 storyLeg(ctx,...rightLeg,legWidth,outfit.bottom,skin);storyShoe(ctx,rightLeg[2],1,legWidth);
 // Belt, pockets and brand stay attached to the player's selected bottoms.
 box(ctx,hip[0]-width/2+1,hip[1]-3,width-2,7,OUTLINE);box(ctx,hip[0]-width/2+2,hip[1]-2,width-4,5,outfit.bottom.color);
 box(ctx,hip[0]-1,hip[1]-1,1,5,outfit.bottom.trim);box(ctx,hip[0]+2,hip[1]-1,1,4,outfit.bottom.trim);
 mark(ctx,rightLeg[0][0]-3,rightLeg[0][1]+6,outfit.bottom.brand,outfit.bottom.trim);
 storyLimb(ctx,...rightArm,6,skin,shade,highlight);
 // Crop only the torso from the wardrobe renderer, then shear its individual
 // pixel rows for the forward lean. Sleeves follow their upper arms below.
 const shirt=document.createElement('canvas');shirt.width=88;shirt.height=64;const shirtCtx=shirt.getContext('2d');shirtCtx.imageSmoothingEnabled=false;
 const shirtLeft=33-width/2;jersey(shirtCtx,outfit.shirt,shirtLeft,width,female);
 for(let row=31;row<58;row++){const t=(row-31)/26,x=shoulderX+(hip[0]-shoulderX)*t-width/2;ctx.drawImage(shirt,shirtLeft,row,width,1,Math.round(x),Math.round(shoulderY+row-31),width,1);}
 if(outfit.shirt.style!=='tank')for(const arm of [leftArm,rightArm]){
  const sleeveEnd=pointBetween(arm[0],arm[1],.43),sleeveColor=outfit.shirt.style==='raglan'?outfit.shirt.trim:outfit.shirt.color;
  pixelStroke(ctx,arm[0],sleeveEnd,10,OUTLINE);pixelStroke(ctx,arm[0],sleeveEnd,8,sleeveColor);
  pixelStroke(ctx,[sleeveEnd[0]-3,sleeveEnd[1]],[sleeveEnd[0]+3,sleeveEnd[1]],1,colorShift(sleeveColor,-26));
  if(outfit.shirt.brand==='Adidas')for(let n=0;n<3;n++)pixelStroke(ctx,[arm[0][0]-2+n*2,arm[0][1]],[sleeveEnd[0]-2+n*2,sleeveEnd[1]-1],1,outfit.shirt.trim);
 }
 storyHead(ctx,profile,outfit.shirt,shoulderX-33,shoulderY-31,'front',pose==='victory');
 const direction=pose==='swing'?[.78,-.626]:pose==='victory'?[.32,-.947]:[.16,-.987];
 const paddleTip=storyPaddle(ctx,rightArm[2],direction,profile.paddle||'#7286bb',skin);
 if(pose==='victory'){const fist=leftArm[2];box(ctx,fist[0]-4,fist[1]-5,8,8,OUTLINE);box(ctx,fist[0]-3,fist[1]-4,6,6,skin);box(ctx,fist[0]-2,fist[1]-4,4,1,highlight);box(ctx,fist[0]+1,fist[1]-1,2,2,shade);}
 return{canvas,origin,pose,paddleTip};
}
/**
 * Draw a story-only action pose around the player's grounded feet.
 * Reserve native bounds x=[-66,76], y=[-140,0] for all supported profiles;
 * at scale 6 these become a maximum 852 by 840 canvas-pixel footprint.
 * paddleTip and bounds are returned in destination canvas coordinates.
 */
export function drawAvatarPose(ctx,cx,ground,scale,profile,pose='ready'){
 const image=storySprite(profile,pose),x=Math.round(cx-image.origin[0]*scale),y=Math.round(ground-image.origin[1]*scale);
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(image.canvas,x,y,Math.round(image.canvas.width*scale),Math.round(image.canvas.height*scale));ctx.restore();
 return{pose:image.pose,paddleTip:{x:Math.round(cx+image.paddleTip[0]*scale),y:Math.round(ground+image.paddleTip[1]*scale)},bounds:{left:cx-66*scale,top:ground-140*scale,right:cx+76*scale,bottom:ground}};
}
export function drawHairThumbnail(canvas,profile){
 const source=sprite({...profile,hat:'none'}).canvas,out=canvas.getContext('2d');
 out.clearRect(0,0,canvas.width,canvas.height);out.imageSmoothingEnabled=false;
 const crop=[12,0,48,52],fit=Math.min(canvas.width/crop[2],canvas.height/crop[3])*0.9;
 out.drawImage(source,...crop,Math.round((canvas.width-crop[2]*fit)/2),Math.round((canvas.height-crop[3]*fit)/2),Math.round(crop[2]*fit),Math.round(crop[3]*fit));
}
export function drawClothingThumbnail(canvas,item,category){const source=document.createElement('canvas');source.width=64;source.height=80;const ctx=source.getContext('2d');ctx.imageSmoothingEnabled=false;
 if(category==='caps'){cap(ctx,item,16,24);}
 else if(category==='shirts'){ctx.translate(0,-13);jersey(ctx,item,18,28,false);}
 else{ctx.translate(0,-43);bottoms(ctx,{...item,category},18,28,category==='pants'?108:78);}
 const out=canvas.getContext('2d');out.clearRect(0,0,canvas.width,canvas.height);out.imageSmoothingEnabled=false;
 const crop=category==='caps'?[4,18,56,32]:category==='shirts'?[10,16,44,34]:category==='shorts'?[15,10,36,25]:[15,10,36,59];
 const fit=Math.min(canvas.width/crop[2],canvas.height/crop[3])*0.8;
 out.drawImage(source,...crop,Math.round((canvas.width-crop[2]*fit)/2),Math.round((canvas.height-crop[3]*fit)/2),Math.round(crop[2]*fit),Math.round(crop[3]*fit));
}
