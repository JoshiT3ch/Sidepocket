export const HAIRSTYLES = Object.freeze([
  {id:'short',name:'Short crop',characterType:'male'},
  {id:'buzz',name:'Buzz cut',characterType:'male'},
  {id:'side-part',name:'Side part',characterType:'male'},
  {id:'spiky',name:'Spiky',characterType:'male'},
  {id:'curly',name:'Curly',characterType:'male'},
  {id:'afro',name:'Afro',characterType:'male'},
  {id:'bob',name:'Bob',characterType:'female'},
  {id:'long',name:'Long waves',characterType:'female'},
  {id:'ponytail',name:'Ponytail',characterType:'female'},
  {id:'bun',name:'Top bun',characterType:'female'}
]);

export const HAIR_COLORS = Object.freeze([
  {color:'#292727',name:'Black'},
  {color:'#43352f',name:'Espresso'},
  {color:'#87583c',name:'Chestnut'},
  {color:'#d6b66b',name:'Blonde'},
  {color:'#b66a40',name:'Ginger'},
  {color:'#b7b8ba',name:'Silver'}
]);

export function hairstylesFor(characterType) {
  const type=characterType==='female'?'female':'male';
  return HAIRSTYLES.filter(style=>style.characterType===type);
}

export function normalizeHair(profile = {}) {
  return {
    hairStyle:hairstylesFor(profile.characterType).some(style=>style.id===profile.hairStyle)?profile.hairStyle:profile.characterType==='female'?'ponytail':'short',
    hairColor:HAIR_COLORS.some(tone=>tone.color===profile.hairColor)?profile.hairColor:'#43352f'
  };
}

export function hairError(profile) {
  if(!hairstylesFor(profile.characterType).some(style=>style.id===profile.hairStyle))return 'Choose a hairstyle available for your selected character.';
  if(!HAIR_COLORS.some(tone=>tone.color===profile.hairColor))return 'Choose a hair color from the available colors.';
  return null;
}
