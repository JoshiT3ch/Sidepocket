const formatKeys=['bestOf','pointsToWin','winBy'];
const scoreKeys=['a','b'];
const hasKeys=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));

export function normalizeMatchFormat(value){
 if(!hasKeys(value,formatKeys)||![1,3,5].includes(value.bestOf)||![11,15,21].includes(value.pointsToWin)||![1,2].includes(value.winBy))throw new TypeError('Choose best of 1, 3, or 5 sets, play to 11, 15, or 21 points, and win by 1 or 2.');
 return{bestOf:value.bestOf,pointsToWin:value.pointsToWin,winBy:value.winBy};
}

export function validateMatchScores(format,scores){
 const {bestOf,pointsToWin,winBy}=normalizeMatchFormat(format);
 if(!Array.isArray(scores)||scores.length<1||scores.length>bestOf)throw new TypeError(`Enter the completed set scores, up to ${bestOf} sets.`);
 const needed=Math.floor(bestOf/2)+1,wins={a:0,b:0};
 for(const score of scores){
  if(wins.a===needed||wins.b===needed)throw new TypeError('The match already ended. Remove the extra set scores.');
  if(!hasKeys(score,scoreKeys)||!Number.isInteger(score.a)||!Number.isInteger(score.b)||score.a<0||score.a>99||score.b<0||score.b>99)throw new TypeError('Each set needs whole-number scores from 0 to 99 for both duos.');
  if(score.a===score.b)throw new TypeError('A completed set cannot end in a tie.');
  const side=score.a>score.b?'a':'b',winner=score[side],loser=score[side==='a'?'b':'a'];
  const terminal=winBy===1?winner===pointsToWin:loser<=pointsToWin-winBy?winner===pointsToWin:winner===loser+winBy;
  if(winner<pointsToWin||!terminal)throw new TypeError(`Each set must finish at ${pointsToWin} points${winBy===2?', or continue until a duo leads by 2':''}.`);
  wins[side]++;
 }
 if(wins.a<needed&&wins.b<needed)throw new TypeError(`Enter enough completed sets for one duo to win ${needed}.`);
 return wins.a===needed?'a':'b';
}
