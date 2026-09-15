#!/usr/bin/env node
/* =====================================================================
 * 生成应用图标（.ico / .png），零外部依赖。
 * ---------------------------------------------------------------------
 * 为什么不用现成图标：本仓库不携带二进制素材，图标用代码确定性生成，
 * 任何人 clone 后都能复现出逐字节相同的产物。
 *
 * 图案：深色圆角方块（取 app.css 的面板色阶）+ 琥珀色准星
 * （复用 Lucide 的 crosshair 几何比例，与界面里那个准星图标同源）。
 * 圆角方块是为了在 Win11 任务栏/开始菜单里和系统图标同一个体量感——
 * 早先那版是「橙色实心圆 + 白准星」，压在一排彩色图标里像个通知徽标。
 *
 * 用法：node scripts/make_app_icon.js [输出目录]
 *       默认写 app/src-tauri/icons；传目录可以先生成到别处看效果。
 *       （别和 scripts/make_icons.js 搞混——那个生成的是界面里用的
 *         Lucide SVG sprite，这个是 Windows 的应用图标 .ico/.png。）
 * ===================================================================== */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'app', 'src-tauri', 'icons');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SS = 6;                       // 超采样倍数（6 → 每像素 36 个样本），抗锯齿

/* ---------- 调色：直接抄 app.css 里 .brand 那块品牌色板 ----------
   界面上左栏顶部的品牌方块是「琥珀渐变底 + 近黑字」，图标跟着走，
   任务栏里一眼就能和界面里那个方块对上。 */
const BG_TL = [0xf7, 0xb2, 0x47];   // 渐变起（--acc 提亮）
const BG_BR = [0xc9, 0x6a, 0x1a];   // 渐变止
const INK   = [0x1a, 0x12, 0x06];   // --acc-ink，准星颜色

/* ---------- 圆角方块的 SDF（负值在内） ----------
   小尺寸把圆角收小：16px 下 0.225 的圆角占了方块的近四分之一，
   缩到任务栏尺寸会糊成一颗胶囊，认不出是个方块。 */
const HALF = 0.480;
function sdSquircle(px, py, corner) {
  const qx = Math.abs(px) - (HALF - corner), qy = Math.abs(py) - (HALF - corner);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - corner;
}

/* ---------- 准星几何：按 Lucide crosshair 的比例缩放 ----------
   笔画按【全宽】给，别再当成半宽用（先前就是这么写反的，
   实际画出来比设计粗了一倍，256px 下环直接糊成一个甜甜圈）。
   小尺寸另走一套：16/24px 下短划和环会挤成一坨，只留环 + 中心点。 */
const G = 0.700;                    // 图标盒 24 单位 → 归一化后的整体缩放
function geom(size) {
  if (size <= 24) {
    /* 16/24px：环、短划、中心点三者挤在一起只剩一团黑，只留一个环。
       这个尺寸下没人认得出图案，能认出「一个亮色方块 + 一个深色环」就够了。 */
    return { corner: 0.160, ring: 10 / 24 * G * 0.96, spokeIn: 0, half: 0.058, dot: 0, spokes: false };
  }
  return {
    corner: 0.225,
    ring: 10 / 24 * G,
    spokeIn: 6 / 24 * G,
    half: 2 / 24 * G / 2,           // 笔画全宽 2/24，这里存半宽
    dot: 0.050,
    spokes: true,
  };
}
function isGlyph(dx, dy, k) {
  const r = Math.hypot(dx, dy);
  if (Math.abs(r - k.ring) <= k.half) return true;        // 外环
  if (k.dot > 0 && r <= k.dot) return true;               // 中心点
  if (!k.spokes) return false;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax >= k.spokeIn && ax <= k.ring && ay <= k.half) return true;   // 左右短划
  if (ay >= k.spokeIn && ay <= k.ring && ax <= k.half) return true;   // 上下短划
  return false;
}

/* ---------- 逐点着色：返回 [r,g,b,a] ---------- */
const mix = (a, b, t) => a + (b - a) * t;
function shade(u, v, k) {
  const dx = u - 0.5, dy = v - 0.5;
  if (sdSquircle(dx, dy, k.corner) > 0) return null;      // 方块外全透明

  const t = Math.min(1, Math.max(0, (u + v) * 0.5));      // 135° 对角渐变
  let r = mix(BG_TL[0], BG_BR[0], t);
  let g = mix(BG_TL[1], BG_BR[1], t);
  let b = mix(BG_TL[2], BG_BR[2], t);

  if (isGlyph(dx, dy, k)) {                               // 准星：近黑，压得住琥珀底
    r = INK[0]; g = INK[1]; b = INK[2];
  }
  return [r, g, b, 1];
}

/* ---------- CRC32（Node 18+ 内置 zlib.crc32，低版本走手写实现） ---------- */
let crc32 = zlib.crc32;
if (typeof crc32 !== 'function') {
  const T = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    T[n] = c;
  }
  crc32 = (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
}

/* ---------- PNG 编码（RGBA8，无滤波） ---------- */
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;                                   // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 渲染：逐像素超采样，预乘累加后再反预乘 ---------- */
function render(size) {
  const n = size * SS;
  const k = geom(size);
  const acc = new Float64Array(size * size * 4);
  const total = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((x * SS + sx + 0.5) / n, (y * SS + sy + 0.5) / n, k);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const alpha = a / total;
      const i = (y * size + x) * 4;
      if (alpha === 0) continue;
      // 反预乘：把覆盖率平均后的颜色还原成非预乘 RGBA
      acc[i]     = r / total / (alpha / 255);
      acc[i + 1] = g / total / (alpha / 255);
      acc[i + 2] = b / total / (alpha / 255);
      acc[i + 3] = alpha;
    }
  }
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(acc[i])));
  return out;
}

/* ---------- ICO 封装（PNG 载荷，Vista+ 支持；256px 时宽高字节写 0） ---------- */
function buildICO(entries) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(entries.length, 4);
  const table = Buffer.alloc(16 * entries.length);
  let offset = 6 + 16 * entries.length;
  const blobs = [];
  entries.forEach((e, i) => {
    const o = i * 16;
    table[o] = e.size >= 256 ? 0 : e.size;
    table[o + 1] = e.size >= 256 ? 0 : e.size;
    table[o + 2] = 0; table[o + 3] = 0;
    table.writeUInt16LE(1, o + 4);                 // planes
    table.writeUInt16LE(32, o + 6);                // bit count
    table.writeUInt32LE(e.png.length, o + 8);
    table.writeUInt32LE(offset, o + 12);
    offset += e.png.length;
    blobs.push(e.png);
  });
  return Buffer.concat([dir, table, ...blobs]);
}

/* ---------- 主流程 ---------- */
const entries = SIZES.map((size) => ({ size, png: encodePNG(size, size, render(size)) }));
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), buildICO(entries));
const big = entries[entries.length - 1].png;
fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), big);            // 256px，供 Linux/网页使用
for (const s of [32, 128]) {
  fs.writeFileSync(path.join(OUT_DIR, `${s}x${s}.png`), encodePNG(s, s, render(s)));
}
console.log('图标已生成 ->', OUT_DIR);
for (const f of fs.readdirSync(OUT_DIR)) {
  console.log('  ', f, fs.statSync(path.join(OUT_DIR, f)).size, 'bytes');
}
