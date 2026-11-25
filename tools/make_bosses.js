// 生成两个 Boss 的像素图（32x32，游戏里 2 倍显示成 64px）
// 古木守卫和虚空祭司不是现成素材，是这个脚本画的
const { Img, writePNG, hex } = require('./pixpng');
const path = require('path');
const OUT = path.join(__dirname, '..', 'assets', 'resources', 'knight');

// ---------------------------------------------------------------- 古木守卫
function woodGuardian() {
  const img = new Img(32, 32);
  const OL = hex('#171009');      // 描边
  const BARK_D = hex('#3b2a19');
  const BARK_M = hex('#5d3f25');
  const BARK_L = hex('#7f5733');
  const BARK_H = hex('#a97a45');
  const MOSS_D = hex('#3d6c31');
  const MOSS_L = hex('#63984a');
  const EYE = hex('#ffd451');
  const EYE2 = hex('#ff9c2b');
  const EYE_W = hex('#fff6c8');

  // 根须（脚下）
  img.ellipse(16, 27.5, 10, 3.2, BARK_D);
  img.rect(7, 25, 18, 4, BARK_D);
  img.ellipse(8, 28, 3.5, 2.2, BARK_M);
  img.ellipse(24, 28, 3.5, 2.2, BARK_M);
  img.ellipse(16, 29, 5, 2, BARK_M);

  // 身体（树干）
  img.ellipse(16, 19, 7.5, 9.5, BARK_M);
  img.rect(9, 12, 15, 14, BARK_M);
  // 树皮竖纹
  for (const [x, y0, h] of [[11, 13, 11], [14, 12, 13], [19, 13, 12]]) {
    img.rect(x, y0, 1, h, BARK_D);
  }
  img.rect(10, 14, 1, 6, BARK_L);
  img.rect(21, 15, 1, 5, BARK_L);
  // 树节
  img.ellipse(13, 21, 1.6, 2.2, BARK_D);
  img.ellipse(19, 18.5, 1.4, 1.8, BARK_D);

  // 枝干手臂
  img.ellipse(6, 14, 3.2, 4.2, BARK_M);
  img.rect(3, 11, 5, 5, BARK_M);
  img.ellipse(4, 12.5, 2.4, 2.6, BARK_L);
  img.ellipse(26, 14, 3.2, 4.2, BARK_M);
  img.rect(24, 11, 5, 5, BARK_M);
  img.ellipse(28, 12.5, 2.4, 2.6, BARK_L);
  // 手臂上的苔藓
  img.ellipse(5, 16.5, 2.4, 1.6, MOSS_D);
  img.ellipse(27, 16.5, 2.4, 1.6, MOSS_D);

  // 头
  img.ellipse(16, 7, 6, 5, BARK_M);
  img.rect(11, 4, 11, 8, BARK_M);
  img.rect(12, 5, 9, 3, BARK_L);
  img.rect(13, 3, 7, 2, BARK_H);
  // 头顶枝杈
  img.rect(15, 0, 2, 4, BARK_D);
  img.rect(12, 1, 3, 2, BARK_D);
  img.rect(18, 1, 3, 2, BARK_D);
  // 眉骨阴影
  img.rect(11, 6, 11, 1, BARK_D);
  // 发光的眼睛
  img.rect(13, 7, 2, 2, EYE2); img.rect(13, 7, 1, 1, EYE_W);
  img.rect(18, 7, 2, 2, EYE2); img.rect(18, 7, 1, 1, EYE_W);
  // 嘴（獠牙）
  img.rect(14, 10, 5, 1, BARK_D);
  img.set(14, 11, hex('#efe6c8')); img.set(18, 11, hex('#efe6c8'));

  // 肩膀苔藓
  img.ellipse(11.5, 11.5, 2.6, 1.6, MOSS_D);
  img.ellipse(20.5, 11.5, 2.6, 1.6, MOSS_D);
  img.ellipse(11, 11, 1.4, 0.9, MOSS_L);
  img.ellipse(21, 11, 1.2, 0.8, MOSS_L);

  img.outline(OL);
  return img;
}

// ---------------------------------------------------------------- 虚空祭司
function voidPriest() {
  const img = new Img(32, 32);
  const OL = hex('#0d0713');
  const ROBE_D = hex('#241633');
  const ROBE_M = hex('#3b2552');
  const ROBE_L = hex('#573a75');
  const ROBE_H = hex('#75549b');
  const MASK = hex('#e3d9f0');
  const MASK_D = hex('#a294bd');
  const HORN = hex('#efe8f8');
  const CORE = hex('#b673ff');
  const CORE_H = hex('#efd0ff');

  // 浮空碎片
  img.ellipse(4, 22, 1.4, 1.4, ROBE_L);
  img.ellipse(28, 19, 1.6, 1.6, ROBE_L);
  img.ellipse(26, 27, 1.2, 1.2, ROBE_M);
  img.ellipse(6, 14, 1.0, 1.0, ROBE_M);

  // 长袍（下宽上窄）
  for (let y = 13; y <= 28; y++) {
    const t = (y - 13) / 15;
    const half = 5 + t * 8.5;
    const x0 = Math.round(16 - half);
    const x1 = Math.round(16 + half);
    for (let x = x0; x <= x1; x++) {
      const edge = (x - x0) / Math.max(1, x1 - x0);
      let c = ROBE_M;
      if (edge < 0.14 || edge > 0.86) c = ROBE_D;
      else if (edge > 0.3 && edge < 0.7) c = ROBE_L;
      if (y > 24) c = ROBE_D;
      img.set(x, y, c);
    }
  }
  // 袍子褶皱
  for (const x of [11, 14, 18, 21]) img.rect(x, 16, 1, 11, ROBE_D);
  // 下摆锯齿
  for (let x = 6; x <= 26; x += 3) img.rect(x, 28, 2, 2, ROBE_D);

  // 胸口核心
  img.ellipse(16, 18, 3.4, 3.4, hex('#6a3fa8'));
  img.ellipse(16, 18, 2.2, 2.2, CORE);
  img.ellipse(15.4, 17.2, 1.0, 1.0, CORE_H);

  // 双手（浮起）
  img.ellipse(6, 19, 2.0, 2.0, MASK_D);
  img.ellipse(26, 19, 2.0, 2.0, MASK_D);
  img.ellipse(6, 19, 1.0, 1.0, CORE);
  img.ellipse(26, 19, 1.0, 1.0, CORE);

  // 兜帽
  img.ellipse(16, 9, 6.4, 6.4, ROBE_D);
  img.rect(10, 7, 13, 7, ROBE_D);
  img.rect(11, 5, 11, 4, ROBE_M);
  img.ellipse(16, 6, 5, 3.2, ROBE_M);

  // 骨面具
  img.ellipse(16, 9.5, 3.6, 4.2, MASK);
  img.rect(14, 7, 5, 5, MASK);
  img.ellipse(16, 12, 2.6, 1.6, MASK_D);
  // 面具上的发光眼
  img.rect(14, 9, 1, 2, CORE);
  img.rect(18, 9, 1, 2, CORE);
  img.set(14, 9, CORE_H); img.set(18, 9, CORE_H);
  // 面具裂纹
  img.set(17, 11, MASK_D); img.set(16, 12, MASK_D);

  // 双角
  for (let i = 0; i < 6; i++) {
    img.rect(11 - i, 5 - i, 2, 2, HORN);
    img.rect(19 + i, 5 - i, 2, 2, HORN);
  }
  img.set(6, 0, HORN); img.set(7, 0, HORN); img.set(24, 0, HORN); img.set(25, 0, HORN);

  img.outline(OL);
  return img;
}

writePNG(path.join(OUT, 'boss2.png'), woodGuardian());
writePNG(path.join(OUT, 'boss4.png'), voidPriest());
console.log('已生成 boss2.png（古木守卫·重造）和 boss4.png（虚空祭司）');
