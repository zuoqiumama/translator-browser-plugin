/*
 * gen-icons.js — generate the extension PNG icons with zero dependencies.
 *
 * Draws a rounded-square gradient badge with a small white "translation card"
 * (two text lines) and writes icons/icon{16,48,128}.png. Run with:  node tools/gen-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// --- minimal PNG encoder -------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (1 + width * 4) + 1 + x * 4;
      raw[dst] = rgba[src];
      raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2];
      raw[dst + 3] = rgba[src + 3];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// --- drawing helpers -----------------------------------------------------

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const lerp = (a, b, t) => a + (b - a) * t;
const blend = (base, top, a) => [
  lerp(base[0], top[0], a),
  lerp(base[1], top[1], a),
  lerp(base[2], top[2], a),
];

// Signed distance to a rounded rectangle (negative inside).
function sdfRoundRect(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - (halfW - r);
  const qy = Math.abs(py - cy) - (halfH - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

function barAlpha(sx, sy, N, x0f, x1f, cyf, thf) {
  const x0 = x0f * N, x1 = x1f * N;
  const half = (thf * N) / 2;
  return clamp(0.5 - sdfRoundRect(sx, sy, (x0 + x1) / 2, cyf * N, (x1 - x0) / 2, half, half), 0, 1);
}

function pixel(x, y, N) {
  const sx = x + 0.5, sy = y + 0.5;
  const pad = N * 0.04;
  const outerA = clamp(0.5 - sdfRoundRect(sx, sy, N / 2, N / 2, N / 2 - pad, N / 2 - pad, N * 0.22), 0, 1);
  if (outerA <= 0) return [0, 0, 0, 0];

  // diagonal indigo -> violet gradient
  const t = (sx + sy) / (2 * N);
  let rgb = [lerp(99, 139, t), lerp(102, 92, t), lerp(241, 246, t)];

  // white card
  const cardA = clamp(0.5 - sdfRoundRect(sx, sy, N / 2, N * 0.5, N * 0.27, N * 0.21, N * 0.06), 0, 1);
  if (cardA > 0) rgb = blend(rgb, [255, 255, 255], cardA);

  // two text lines (gray + accent)
  const b1 = barAlpha(sx, sy, N, 0.3, 0.66, 0.46, 0.05);
  if (b1 > 0) rgb = blend(rgb, [148, 163, 184], b1);
  const b2 = barAlpha(sx, sy, N, 0.34, 0.6, 0.57, 0.05);
  if (b2 > 0) rgb = blend(rgb, [99, 102, 241], b2);

  return [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2]), Math.round(255 * outerA)];
}

function renderIcon(N) {
  const rgba = Buffer.alloc(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const [r, g, b, a] = pixel(x, y, N);
      const i = (y * N + x) * 4;
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
    }
  }
  return encodePNG(N, N, rgba);
}

// --- write files ---------------------------------------------------------

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, renderIcon(size));
  console.log('wrote', file);
}
