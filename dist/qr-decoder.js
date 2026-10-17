import jsQR from './vendor/jsqr.js';

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
