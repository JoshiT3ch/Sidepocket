import qrcode from './vendor/qrcode-generator.js';
import jsQR from './vendor/jsqr.js';

const CODE_PATTERN = /^SO-[A-F0-9]{12}$/i;
const QUIET_ZONE = 4;

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
export function renderPlayerQr(canvas, code) {
  const playerCode = parsePlayerCode(code);
  if (!playerCode) throw new TypeError('Enter a valid Sideout player code.');
  const payload = `SIDEOUT:${playerCode}`;
  const qr = qrcode(0, 'H');
  qr.addData(payload, 'Alphanumeric');
  qr.make();
  const count = qr.getModuleCount();
  const modules = count + QUIET_ZONE * 2;
  const scale = Math.max(2, Math.floor((Number(canvas.width) || 290) / modules));
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
