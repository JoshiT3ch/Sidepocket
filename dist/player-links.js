const CODE_PATTERN = /^SO-[A-F0-9]{12}$/i;
const DUO_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function website(base=globalThis.location?.href) {
  if(base===globalThis.location?.href&&globalThis.window?.sideoutNative?.isNative)base=globalThis.window.sideoutNative.publicOrigin;
  const url=new URL('/',base);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new TypeError('Use a Sideout website address.');
  return url;
}

/** A normal phone camera must see an actual website URL, not custom QR text. */
export function playerLink(code,base) {
  const playerCode=parsePlayerCode(code);
  if(!playerCode)throw new TypeError('Enter a valid Sideout player code.');
  const url=website(base);url.searchParams.set('player',playerCode);url.hash='play';return url.href;
}

export function duoLink(token,base) {
  if(typeof token!=='string'||!DUO_TOKEN_PATTERN.test(token))throw new TypeError('Use a valid duo invitation.');
  const url=website(base);url.searchParams.set('duo',token.toLowerCase());url.hash='play';return url.href;
}

export function roomLink(id,base){
  if(typeof id!=='string'||!DUO_TOKEN_PATTERN.test(id))throw new TypeError('Use a valid room link.');
  const url=website(base);url.searchParams.set('room',id.toLowerCase());url.hash='play';return url.href;
}

export function parseRoomLink(input,origin=globalThis.location?.origin){
  if(origin===globalThis.location?.origin&&globalThis.window?.sideoutNative?.isNative)origin=globalThis.window.sideoutNative.publicOrigin;
  if(typeof input!=='string'||input.length>2048)return null;
  try{const url=new URL(input.trim()),ids=url.searchParams.getAll('room');
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||origin&&url.origin!==origin)return null;
    return ids.length===1&&DUO_TOKEN_PATTERN.test(ids[0])?ids[0].toLowerCase():null;
  }catch{return null;}
}

/** Never navigate to a scanned origin; only accept the invite on this website. */
export function parseDuoInvite(input,origin=globalThis.location?.origin) {
  if(origin===globalThis.location?.origin&&globalThis.window?.sideoutNative?.isNative)origin=globalThis.window.sideoutNative.publicOrigin;
  if(typeof input!=='string'||input.length>2048)return null;
  try{
    const url=new URL(input.trim()),tokens=url.searchParams.getAll('duo');
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||origin&&url.origin!==origin)return null;
    return tokens.length===1&&DUO_TOKEN_PATTERN.test(tokens[0])?tokens[0].toLowerCase():null;
  }catch{return null;}
}

/** Normalize a player code, QR payload, or shared player URL. */
export function parsePlayerCode(input) {
  if (typeof input !== 'string' || input.length > 2048) return null;
  const text = input.trim();
  if (CODE_PATTERN.test(text)) return text.toUpperCase();
  if (/^SIDEOUT:/i.test(text)) {
    const code = text.slice(8).trim();
    return CODE_PATTERN.test(code) ? code.toUpperCase() : null;
  }
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const codes = url.searchParams.getAll('player');
    return codes.length === 1 && CODE_PATTERN.test(codes[0]) ? codes[0].toUpperCase() : null;
  } catch {
    return null;
  }
}
