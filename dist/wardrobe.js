// Original pixel clothing designs for the prototype wardrobe.
export const WARDROBE = {
  caps: [
    {id:'nike-court-cap',brand:'Nike',name:'Court Cap',color:'#eee9d5',trim:'#343d49',style:'classic'},
    {id:'nike-night-cap',brand:'Nike',name:'Night Cap',color:'#283342',trim:'#a5b7c8',style:'panel'},
    {id:'nike-coral-cap',brand:'Nike',name:'Coral Club Cap',color:'#e97e64',trim:'#f9e5d5',style:'classic'},
    {id:'nike-mesh-cap',brand:'Nike',name:'Mesh Cap',color:'#a4b6bf',trim:'#f0eddc',style:'mesh'},
    {id:'nike-court-visor',brand:'Nike',name:'Court Visor',color:'#b7cdb2',trim:'#263f38',style:'visor'},
    {id:'adidas-three-cap',brand:'Adidas',name:'Three Stripe Cap',color:'#253b3b',trim:'#eae9d8',style:'stripe'},
    {id:'adidas-sky-cap',brand:'Adidas',name:'Sky Cap',color:'#a6bce0',trim:'#344a6e',style:'panel'},
    {id:'adidas-lilac-cap',brand:'Adidas',name:'Lilac Club Cap',color:'#b59fc6',trim:'#f0e7ed',style:'classic'},
    {id:'adidas-sand-cap',brand:'Adidas',name:'Sand Cap',color:'#cab88f',trim:'#404434',style:'mesh'},
    {id:'adidas-reverse-cap',brand:'Adidas',name:'Reverse Cap',color:'#393549',trim:'#c8b9d9',style:'reverse'}
  ],
  shirts: [
    {id:'nike-coral-tee',brand:'Nike',name:'Coral Court Tee',color:'#ed795d',trim:'#f3e5d3',style:'tee'},
    {id:'nike-night-tee',brand:'Nike',name:'Night Court Tee',color:'#293444',trim:'#e7eccf',style:'panel'},
    {id:'nike-cloud-tank',brand:'Nike',name:'Cloud Tank',color:'#eee9d5',trim:'#536f83',style:'tank'},
    {id:'nike-club-polo',brand:'Nike',name:'Club Polo',color:'#445d78',trim:'#cfddb8',style:'polo'},
    {id:'nike-lilac-zip',brand:'Nike',name:'Lilac Zip Top',color:'#b59fc6',trim:'#eee9d5',style:'zip'},
    {id:'adidas-cream-tee',brand:'Adidas',name:'Cream Stripe Tee',color:'#ede8cd',trim:'#374d43',style:'stripe'},
    {id:'adidas-forest-jersey',brand:'Adidas',name:'Forest Jersey',color:'#8da65d',trim:'#e4e9d2',style:'jersey'},
    {id:'adidas-sky-raglan',brand:'Adidas',name:'Sky Raglan',color:'#a6bce0',trim:'#e9edf0',style:'raglan'},
    {id:'adidas-clay-polo',brand:'Adidas',name:'Clay Polo',color:'#bc7959',trim:'#ead6c3',style:'polo'},
    {id:'adidas-track-top',brand:'Adidas',name:'Midnight Track Top',color:'#363345',trim:'#cebddb',style:'zip'}
  ],
  shorts: [
    {id:'nike-field-shorts',brand:'Nike',name:'Field Shorts',color:'#59644c',trim:'#c2cda7',style:'court'},
    {id:'nike-night-shorts',brand:'Nike',name:'Night Shorts',color:'#293444',trim:'#bccfe0',style:'split'},
    {id:'nike-sand-shorts',brand:'Nike',name:'Sand Club Shorts',color:'#c7b98f',trim:'#505744',style:'panel'},
    {id:'nike-coral-shorts',brand:'Nike',name:'Coral Training Shorts',color:'#dc806a',trim:'#f0dfcc',style:'split'},
    {id:'nike-cloud-shorts',brand:'Nike',name:'Cloud Court Shorts',color:'#e4e7d9',trim:'#57758a',style:'court'},
    {id:'adidas-three-shorts',brand:'Adidas',name:'Three Stripe Shorts',color:'#303b42',trim:'#e9e7d8',style:'stripe'},
    {id:'adidas-moss-shorts',brand:'Adidas',name:'Moss Shorts',color:'#7e9374',trim:'#dbe4ce',style:'stripe'},
    {id:'adidas-sky-shorts',brand:'Adidas',name:'Sky Club Shorts',color:'#a1b9d0',trim:'#334d67',style:'panel'},
    {id:'adidas-lilac-shorts',brand:'Adidas',name:'Lilac Court Shorts',color:'#a58cad',trim:'#f0e4eb',style:'court'},
    {id:'adidas-clay-shorts',brand:'Adidas',name:'Clay Training Shorts',color:'#b97b5f',trim:'#ead5bd',style:'split'}
  ],
  pants: [
    {id:'nike-night-joggers',brand:'Nike',name:'Night Joggers',color:'#293444',trim:'#becddb',style:'jogger'},
    {id:'nike-field-pants',brand:'Nike',name:'Field Track Pants',color:'#59644c',trim:'#d8dfbd',style:'track'},
    {id:'nike-sand-cargo',brand:'Nike',name:'Sand Cargo Pants',color:'#c7b98f',trim:'#73684f',style:'cargo'},
    {id:'nike-cloud-joggers',brand:'Nike',name:'Cloud Joggers',color:'#dddeda',trim:'#647b8c',style:'jogger'},
    {id:'nike-lilac-pants',brand:'Nike',name:'Lilac Panel Pants',color:'#ad99bc',trim:'#e4dceb',style:'panel'},
    {id:'adidas-three-pants',brand:'Adidas',name:'Three Stripe Pants',color:'#303b42',trim:'#ecebdc',style:'stripe'},
    {id:'adidas-forest-pants',brand:'Adidas',name:'Forest Track Pants',color:'#789075',trim:'#e6ebd6',style:'stripe'},
    {id:'adidas-sky-pants',brand:'Adidas',name:'Sky Panel Pants',color:'#9db5ce',trim:'#334d67',style:'panel'},
    {id:'adidas-clay-joggers',brand:'Adidas',name:'Clay Joggers',color:'#ae7158',trim:'#e8d1bc',style:'jogger'},
    {id:'adidas-club-pants',brand:'Adidas',name:'Club Track Pants',color:'#4a425f',trim:'#d6c7e5',style:'track'}
  ]
};
export const DEFAULT_EQUIPMENT={capId:'nike-court-cap',shirtId:'custom',bottomId:'nike-field-shorts'};
export const CATEGORY_LABELS={caps:'Caps',shirts:'Shirts',shorts:'Shorts',pants:'Pants'};
export function getItem(id){for(const [category,items]of Object.entries(WARDROBE)){const item=items.find(x=>x.id===id);if(item)return{...item,category};}return null;}
export function outfitItems(profile){return{cap:getItem(profile.capId)||getItem(DEFAULT_EQUIPMENT.capId),shirt:profile.shirtId==='custom'||!getItem(profile.shirtId)?{id:'custom',brand:'Sideout',name:'Custom Court Tee',color:profile.shirt||'#ed795d',trim:'#f3e5d3',style:'tee',category:'shirts'}:getItem(profile.shirtId),bottom:getItem(profile.bottomId)||getItem(DEFAULT_EQUIPMENT.bottomId)};}
export function equipmentError(profile){if(!WARDROBE.caps.some(x=>x.id===profile.capId))return'Choose an available cap.';if(profile.shirtId!=='custom'&&!WARDROBE.shirts.some(x=>x.id===profile.shirtId))return'Choose an available shirt.';if(![...WARDROBE.shorts,...WARDROBE.pants].some(x=>x.id===profile.bottomId))return'Choose available shorts or pants.';return null;}
