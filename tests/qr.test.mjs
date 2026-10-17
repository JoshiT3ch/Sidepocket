import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPlayerQr, renderDuoQr, parsePlayerCode, playerLink, duoLink, parseDuoInvite } from '../dist/qr.js';
import {decodePlayerQr} from '../dist/qr-decoder.js';
const website='https://sideout-valencia.dchiligan.chatgpt.site';
const token='a2790e87-4509-4625-9dad-c3acc267c2f7';

// Minimal pixel canvas: executes the actual renderer's drawing commands into RGBA.
function pixelCanvas(width = 290) {
  const canvas = { width, height: width, style: {} };
  canvas.getContext = () => {
    canvas.data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    return {
      fillStyle: '#ffffff',
      fillRect(x, y, w, h) {
        for (const number of [x, y, w, h]) assert.ok(Number.isInteger(number));
        const channel = this.fillStyle === '#000000' ? 0 : 255;
        if (channel === 0) canvas.moduleSize = w;
        for (let row = y; row < y + h; row++) {
          for (let col = x; col < x + w; col++) {
            const index = (row * canvas.width + col) * 4;
            canvas.data[index] = canvas.data[index + 1] = canvas.data[index + 2] = channel;
            canvas.data[index + 3] = 255;
          }
        }
      },
    };
  };
  return canvas;
}

test('player code parser accepts typed codes, Sideout QR payloads, and player links', () => {
  const code = 'SO-012345ABCDEF';
  for (const input of [code, '  so-012345abcdef  ', `SIDEOUT:${code}`, 'sideout:so-012345abcdef', `https://sideout.example/?player=${code}#play`, `http://localhost:3000/?player=${code.toLowerCase()}`]) {
    assert.equal(parsePlayerCode(input), code);
  }
});

test('player code parser rejects unrelated text, invalid codes, unsafe URLs, and ambiguous links', () => {
  for (const input of [null, {}, '', 'hello', 'SO-123', 'SO-012345ABCDEG', 'SO-012345ABCDEF extra', 'https://sideout.example/', 'https://sideout.example/?player=hello', 'SIDEOUT:https://sideout.example/?player=SO-012345ABCDEF', 'javascript:alert(1)?player=SO-012345ABCDEF', 'file:///tmp/?player=SO-012345ABCDEF', 'https://name:password@sideout.example/?player=SO-012345ABCDEF', 'https://sideout.example/?player=SO-012345ABCDEF&player=SO-111111111111', 'x'.repeat(2049)]) {
    assert.equal(parsePlayerCode(input), null, String(input));
  }
});

test('rendered player QRs round-trip through the independent jsQR pixel decoder', () => {
  for (const [code, width] of [['SO-012345ABCDEF', 290], ['SO-000000000000', 256], ['SO-FFFFFFFFFFFF', 360]]) {
    const canvas = pixelCanvas(width);
    assert.equal(renderPlayerQr(canvas, code,website), `${website}/?player=${code}#play`);
    assert.equal(canvas.width, canvas.height);
    assert.equal(decodePlayerQr(canvas), `${website}/?player=${code}#play`);
    assert.equal(canvas.style.imageRendering, 'pixelated');
    const moduleSize = canvas.moduleSize;
    assert.ok(Number.isInteger(moduleSize));
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (x < moduleSize * 4 || y < moduleSize * 4 || x >= canvas.width - moduleSize * 4 || y >= canvas.height - moduleSize * 4) {
          assert.equal(canvas.data[(y * canvas.width + x) * 4], 255, 'quiet zone stays white');
        }
      }
    }
  }
});

test('player QRs still decode after rotation and inversion', () => {
  const canvas = pixelCanvas();
  renderPlayerQr(canvas, 'SO-13579BDF2468',website);
  const rotated = new Uint8ClampedArray(canvas.data.length);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const source = (y * canvas.width + x) * 4;
      const target = (x * canvas.width + canvas.width - y - 1) * 4;
      rotated.set(canvas.data.subarray(source, source + 4), target);
    }
  }
  assert.equal(decodePlayerQr({ width: canvas.width, height: canvas.height, data: rotated }), `${website}/?player=SO-13579BDF2468#play`);
  for (let i = 0; i < rotated.length; i += 4) {
    rotated[i] = 255 - rotated[i];
    rotated[i + 1] = 255 - rotated[i + 1];
    rotated[i + 2] = 255 - rotated[i + 2];
  }
  assert.equal(decodePlayerQr({ width: canvas.width, height: canvas.height, data: rotated }), `${website}/?player=SO-13579BDF2468#play`);
});

test('empty images and malformed image data return no QR instead of throwing', () => {
  assert.equal(decodePlayerQr({ width: 100, height: 100, data: new Uint8ClampedArray(40000).fill(255) }), null);
  for (const input of [null, {}, { width: -1, height: 3, data: new Uint8Array(12) }, { width: 3, height: 3, data: new Uint8Array(4) }, { width: 3.2, height: 3, data: new Uint8Array(36) }]) assert.equal(decodePlayerQr(input), null);
  assert.throws(() => renderPlayerQr(pixelCanvas(), 'not-a-player',website), /valid Sideout/);
});

test('duo QRs encode website invite URLs and remain readable when switching QR types repeatedly',()=>{
 const canvas=pixelCanvas(360);
 for(let i=0;i<4;i++){
  const expected=duoLink(token,website);assert.equal(renderDuoQr(canvas,token,website),expected);assert.equal(decodePlayerQr(canvas),expected);
  assert.equal(parseDuoInvite(decodePlayerQr(canvas),website),token);assert.ok(canvas.width>=300);
  renderPlayerQr(canvas,'SO-012345ABCDEF',website);assert.equal(decodePlayerQr(canvas),playerLink('SO-012345ABCDEF',website));
 }
});

test('duo links reject ambiguous, foreign-origin and unsafe scan payloads',()=>{
 assert.equal(parseDuoInvite(`${website}/?duo=${token.toUpperCase()}#play`,website),token);
 for(const input of [null,token,'SIDEOUT:'+token,`${website}/?duo=no`,`${website}/?duo=${token}&duo=${token}`,`https://other.example/?duo=${token}`,`https://user:password@sideout-valencia.dchiligan.chatgpt.site/?duo=${token}`,`javascript:alert(1)?duo=${token}`])assert.equal(parseDuoInvite(input,website),null,String(input));
 assert.throws(()=>duoLink('no',website),/valid duo/);assert.throws(()=>playerLink('SO-012345ABCDEF','file:///tmp/test'),/website/);
});
