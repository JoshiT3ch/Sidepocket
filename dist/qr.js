import qrcode from './vendor/qrcode-generator.js';
import {playerLink,duoLink} from './player-links.js';
export {playerLink,duoLink,parsePlayerCode,parseDuoInvite} from './player-links.js';

const QUIET_ZONE = 4;
const preferredWidths = new WeakMap();

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
