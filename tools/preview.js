const { Img, writePNG } = require('./pixpng');
const fs = require('fs'), zlib = require('zlib');
// 读 PNG（只支持自己生成的 RGBA8）并放大
function unfilter(raw, w, h, bpp=4) {
  const out = Buffer.alloc(w*h*bpp); let p = 0;
  for (let y=0;y<h;y++){ const ft=raw[p++]; const row=raw.slice(p,p+w*bpp); p+=w*bpp;
    const prev = y>0 ? out.slice((y-1)*w*bpp, y*w*bpp) : Buffer.alloc(w*bpp);
    const cur = out.slice(y*w*bpp, (y+1)*w*bpp);
    for(let i=0;i<w*bpp;i++){ const a=i>=bpp?cur[i-bpp]:0, b=prev[i], c=i>=bpp?prev[i-bpp]:0; let v=row[i];
      if(ft===1)v=(v+a)&255; else if(ft===2)v=(v+b)&255; else if(ft===3)v=(v+((a+b)>>1))&255;
      else if(ft===4){const pa=Math.abs(b-c),pb=Math.abs(a-c),pc=Math.abs(a+b-2*c);
        v=(v+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255;}
      cur[i]=v; } }
  return out;
}
function readPNG(p) {
  const buf = fs.readFileSync(p);
  let o = 8, w = 0, h = 0, idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o); const type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.slice(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const raw = unfilter(zlib.inflateSync(Buffer.concat(idat)), w, h);
  const img = new Img(w, h);
  let p2 = 0;
  for (let y = 0; y < h; y++) { p2++; for (let x = 0; x < w; x++) {
    img.px[(y*w+x)*4] = raw[p2++]; img.px[(y*w+x)*4+1] = raw[p2++]; img.px[(y*w+x)*4+2] = raw[p2++]; img.px[(y*w+x)*4+3] = raw[p2++];
  } }
  return img;
}
function scale(img, k) {
  const out = new Img(img.w*k, img.h*k);
  for (let y=0;y<img.h;y++) for (let x=0;x<img.w;x++) {
    const c = img.get(x,y);
    for (let j=0;j<k;j++) for (let i=0;i<k;i++) out.set(x*k+i, y*k+j, c);
  }
  return out;
}
const dir = __dirname + '/../assets/resources/knight/';
const names = process.argv.slice(2);
const tiles = names.map(n => readPNG(dir+n+'.png'));
const pad = 8, cell = 32*8;
const W = names.length*cell + (names.length+1)*pad, H = cell + pad*2;
const sheet = new Img(W,H);
sheet.rect(0,0,W,H,[24,26,34,255]);
tiles.forEach((t,i)=>{ const s=scale(t,8); const ox=pad+i*(cell+pad);
  for(let y=0;y<s.h;y++) for(let x=0;x<s.w;x++){ const c=s.get(x,y); if(c[3]>0) sheet.set(ox+x, pad+y, c); } });
writePNG('C:/Users/26775/AppData/Local/Temp/boss_preview.png', sheet);
console.log('预览已生成:', names.join(', '));
