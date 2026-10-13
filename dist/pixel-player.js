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
