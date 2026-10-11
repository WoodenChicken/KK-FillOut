/**
 * 生成插件图标（16/32/48/128）：蓝色圆角方块 + 白色「表单线条 + 对勾」。
 * 零依赖：手写 PNG 编码（zlib + CRC32）。
 * 运行：node scripts/gen-icons.js
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** 线段距离 */
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const S = size;
  const R = S * 0.22; // 圆角半径
  const BG = [37, 99, 235];   // #2563EB
  const BG2 = [124, 58, 237]; // #7C3AED
  const WHITE = [255, 255, 255];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = (x + 0.5) / S, py = (y + 0.5) / S;
      // 圆角方块的 SDF
      const qx = Math.max(Math.abs(px - 0.5) - (0.5 - R), 0);
      const qy = Math.max(Math.abs(py - 0.5) - (0.5 - R), 0);
      const inBox = Math.hypot(qx, qy) <= R;
      if (!inBox) continue;
      // 对角渐变
      const t = (px + py) / 2;
      let c = [
        Math.round(BG[0] + (BG2[0] - BG[0]) * t),
        Math.round(BG[1] + (BG2[1] - BG[1]) * t),
        Math.round(BG[2] + (BG2[2] - BG[2]) * t)
      ];
      let alpha = 255;
      // 表单线条（上半部分三条）
      const lines = [[0.24, 0.30, 0.62, 0.30], [0.24, 0.44, 0.62, 0.44], [0.24, 0.58, 0.50, 0.58]];
      let isWhite = false;
      for (const [x1, y1, x2, y2] of lines) {
        if (segDist(px, py, x1, y1, x2, y2) <= 0.032) { isWhite = true; break; }
      }
      // 对勾（右下）
      if (segDist(px, py, 0.50, 0.68, 0.66, 0.82) <= 0.036) isWhite = true;
      if (segDist(px, py, 0.66, 0.82, 0.92, 0.42) <= 0.036) isWhite = true;
      if (isWhite) c = WHITE;
      const edge = Math.hypot(qx, qy);
      if (edge > R - 0.02) alpha = Math.max(0, Math.round((R - edge) / 0.02 * 255)); // 抗锯齿边
      const off = (y * S + x) * 4;
      rgba[off] = c[0]; rgba[off + 1] = c[1]; rgba[off + 2] = c[2]; rgba[off + 3] = alpha;
    }
  }
  return encodePNG(S, S, rgba);
}

const outDir = path.join(__dirname, '..', 'extension', 'icons');
fs.mkdirSync(outDir, { recursive: true });
[16, 32, 48, 128].forEach((s) => {
  fs.writeFileSync(path.join(outDir, `icon${s}.png`), render(s));
  console.log(`icon${s}.png written`);
});
