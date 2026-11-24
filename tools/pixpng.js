// 像素画生成器：直接在 Node 里画 PNG（自带 zlib + CRC32，无依赖）
const zlib = require('zlib');
const fs = require('fs');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function writePNG(path, img) {
  const raw = Buffer.alloc(img.h * (1 + img.w * 4));
  let o = 0;
  for (let y = 0; y < img.h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4;
      raw[o++] = img.px[i]; raw[o++] = img.px[i + 1]; raw[o++] = img.px[i + 2]; raw[o++] = img.px[i + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

const hex = (h) => {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), 255];
};

class Img {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Uint8Array(w * h * 4); }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = c[3];
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    return [this.px[i], this.px[i + 1], this.px[i + 2], this.px[i + 3]];
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
  }
  // 给不透明像素加一圈暗描边（像素风的关键）
  outline(c) {
    const src = this.px.slice();
    const alpha = (x, y) => {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
      return src[(y * this.w + x) * 4 + 3];
    };
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (alpha(x, y) > 0) continue;
        if (alpha(x - 1, y) > 0 || alpha(x + 1, y) > 0 || alpha(x, y - 1) > 0 || alpha(x, y + 1) > 0) this.set(x, y, c);
      }
    }
  }
  // 竖直渐变（上亮下暗）
  shade(x0, y0, w, h, top, bot) {
    for (let y = y0; y < y0 + h; y++) {
      const t = (y - y0) / Math.max(1, h - 1);
      const c = [0, 1, 2].map((i) => Math.round(top[i] + (bot[i] - top[i]) * t)).concat([255]);
      for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
    }
  }
}
module.exports = { Img, writePNG, hex };
