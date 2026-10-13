export const HAIRSTYLES = Object.freeze([
  {id:'short',name:'Short crop'},
  {id:'buzz',name:'Buzz cut'},
  {id:'side-part',name:'Side part'},
  {id:'spiky',name:'Spiky'},
  {id:'curly',name:'Curly'},
  {id:'afro',name:'Afro'},
  {id:'bob',name:'Bob'},
  {id:'long',name:'Long waves'},
  {id:'ponytail',name:'Ponytail'},
  {id:'bun',name:'Top bun'}
]);

export const HAIR_COLORS = Object.freeze([
  {color:'#292727',name:'Black'},
  {color:'#43352f',name:'Espresso'},
  {color:'#87583c',name:'Chestnut'},
  {color:'#d6b66b',name:'Blonde'},
  {color:'#b66a40',name:'Ginger'},
  {color:'#b7b8ba',name:'Silver'}
]);

export function normalizeHair(profile = {}) {
  return {
    hairStyle:HAIRSTYLES.some(style=>style.id===profile.hairStyle)?profile.hairStyle:profile.characterType==='female'?'ponytail':'short',
    hairColor:HAIR_COLORS.some(tone=>tone.color===profile.hairColor)?profile.hairColor:'#43352f'
  };
}

export function hairError(profile) {
  if(!HAIRSTYLES.some(style=>style.id===profile.hairStyle))return 'Choose a hairstyle from the available styles.';
  if(!HAIR_COLORS.some(tone=>tone.color===profile.hairColor))return 'Choose a hair color from the available colors.';
  return null;
}
