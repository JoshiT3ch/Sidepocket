import qrcode from './vendor/qrcode-generator.js';
import jsQR from './vendor/jsqr.js';

const CODE_PATTERN = /^SO-[A-F0-9]{12}$/i;
const QUIET_ZONE = 4;
const DUO_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const preferredWidths = new WeakMap();

function website(base=globalThis.location?.href) {
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

/** Never navigate to a scanned origin; only accept the invite on this website. */
export function parseDuoInvite(input,origin=globalThis.location?.origin) {
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

/** Draw a standards-compliant QR at an integer number of pixels per module. */
export function renderPlayerQr(canvas, code,base) {
  return renderQrUrl(canvas,playerLink(code,base));
}

export function renderDuoQr(canvas,token,base) {
  return renderQrUrl(canvas,duoLink(token,base));
}

function renderQrUrl(canvas,payload) {
  const qr = qrcode(0, 'H');
  qr.addData(payload, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  const modules = count + QUIET_ZONE * 2;
  if(!preferredWidths.has(canvas))preferredWidths.set(canvas,Number(canvas.width)||360);
  const scale = Math.max(2, Math.floor(preferredWidths.get(canvas) / modules));
  canvas.width = canvas.height = modules * scale;
  if (canvas.style) canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot display a player QR code.');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (qr.isDark(y, x)) ctx.fillRect((x + QUIET_ZONE) * scale, (y + QUIET_ZONE) * scale, scale, scale);
    }
  }
  return payload;
}

/** Decode a camera frame or uploaded image without sending it off the device. */
export function decodePlayerQr(imageData) {
  const { width, height, data } = imageData || {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  if (!(data instanceof Uint8ClampedArray || data instanceof Uint8Array) || data.length !== width * height * 4) return null;
  try {
    return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data || null;
  } catch {
    return null;
  }
}
