export const MIN_WIN_AWARD=20;
export const MAX_WIN_AWARD=40;
export const MIN_RATING=100;

export function teamAverage(players){
 if(!Array.isArray(players)||players.length!==2)throw new TypeError('A doubles team must contain two ratings.');
 const values=players.map(player=>typeof player==='number'?player:player.rating);
 if(values.some(value=>!Number.isSafeInteger(value)||value<MIN_RATING))throw new TypeError('Player ratings must be safe integers of at least 100.');
 return values[0]/2+values[1]/2;
}

export function winAward(winnerRating,opponentRating){
 if(!Number.isFinite(winnerRating)||!Number.isFinite(opponentRating))throw new TypeError('Ratings must be finite numbers.');
 const expected=1/(1+10**((opponentRating-winnerRating)/400));
 return MIN_WIN_AWARD+Math.round((MAX_WIN_AWARD-MIN_WIN_AWARD)*(1-expected));
}

export function ratingPreview(teams){
 const a=teamAverage(teams.a),b=teamAverage(teams.b);
 return{a:winAward(a,b),b:winAward(b,a)};
}

export function matchDeltas(teams,winnerSide){
 if(!['a','b'].includes(winnerSide))throw new TypeError('Choose a winning side.');
 const award=ratingPreview(teams)[winnerSide];
 return['a','b'].flatMap(side=>teams[side].map(player=>{
  const before=player.rating;
  const after=Math.max(MIN_RATING,before+(side===winnerSide?award:-award));
  if(!Number.isSafeInteger(after))throw new TypeError('The resulting player rating is too large.');
  return{playerId:player.id,before,after,delta:after-before};
 }));
}
