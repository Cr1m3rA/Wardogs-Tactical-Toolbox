#!/usr/bin/env node
/* =====================================================================
 * 图标生成器：把 scripts/lucide/*.svg 编译成项目内联 SVG 图标资源。
 * ---------------------------------------------------------------------
 * 为什么内联而不是引 CDN：桌面版要求零网络依赖、单文件分发，图标必须
 * 随代码走。Lucide 是 ISC 许可（宽松，可商用），24 个图标合计约 28 KB。
 *
 * 产物（两处，内容同源，避免手改一份漏一份）：
 *   1. app/renderer/icons.js  —— ESM，供桌面版 engine.js / app.js 使用
 *   2. mortar-map.html        —— 内联 <script>（经典脚本），供网页版使用
 * 另在 index.html / mortar-map.html 注入 <symbol> sprite，供静态 HTML 用
 * <svg class="ico"><use href="#i-xxx"/></svg> 引用。
 *
 * 用法：node scripts/make_icons.js
 * ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'lucide');
const OUT_JS = path.join(ROOT, 'app', 'renderer', 'icons.js');

/* ---------- 1. 读取并抽取每个 SVG 的子元素 ---------- */
function inner(svg) {
  const m = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  if (!m) throw new Error('无法解析 SVG');
  return m[1].replace(/\s*\n\s*/g, ' ').trim();
}

const names = fs.readdirSync(SRC).filter((f) => f.endsWith('.svg'))
  .map((f) => path.basename(f, '.svg')).sort();
if (!names.length) throw new Error('scripts/lucide/ 下没有 SVG');

const PATHS = {};
for (const n of names) PATHS[n] = inner(fs.readFileSync(path.join(SRC, n + '.svg'), 'utf8'));

const version = (fs.readFileSync(path.join(SRC, names[0] + '.svg'), 'utf8')
  .match(/lucide-static v([\d.]+)/) || [, 'unknown'])[1];

/* ---------- 2. 生成共享的 JS 主体（ESM 与经典脚本共用同一段逻辑） ---------- */
const BODY = `
const ICON_PATHS = ${JSON.stringify(PATHS, null, 2)};

/* 供 HTML 内联使用：<svg class="ico"><use href="#i-name"/></svg> */
function icon(name, cls) {
  return '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
}

/* 供 canvas 使用：canvas 画不了 <use>，必须走独立 SVG 图片。
   颜色与线宽烧进 data-URI（canvas 里没法用 currentColor）。 */
const _uriCache = new Map();
function iconURI(name, color, strokeWidth) {
  const key = name + '|' + (color || '') + '|' + (strokeWidth || '');
  let uri = _uriCache.get(key);
  if (uri) return uri;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"' +
    ' stroke="' + (color || '#fff') + '" stroke-width="' + (strokeWidth || 2) + '"' +
    ' stroke-linecap="round" stroke-linejoin="round">' + ICON_PATHS[name] + '</svg>';
  uri = 'data:image/svg+xml,' + encodeURIComponent(svg);
  _uriCache.set(key, uri);
  return uri;
}

/* canvas 用图标需预加载成 Image 后再 drawImage；这里做一次性预热缓存。
   SVG data-URI 的解码是异步的，首次 drawImage 会画不出东西，
   所以支持传 onReady：图还没就绪时登记回调，解码完成后回调一次（用于重绘）。 */
const _imgCache = new Map();
function iconImage(name, color, strokeWidth, onReady) {
  const key = name + '|' + (color || '') + '|' + (strokeWidth || '');
  let img = _imgCache.get(key);
  if (!img) {
    img = new Image();
    img._ready = [];
    img.onload = function () {
      const fs = img._ready; img._ready = [];
      for (const f of fs) f();
    };
    img.src = iconURI(name, color, strokeWidth);
    _imgCache.set(key, img);
  }
  // 已解码完的不用回调（当前这帧就能画对）；未就绪的去重登记
  if (onReady && !img.complete && img._ready.indexOf(onReady) < 0) img._ready.push(onReady);
  return img;
}
`.trim();

const HEADER = `/* 本文件由 scripts/make_icons.js 生成，请勿手改。
 * 图标来源：Lucide v${version}（ISC 许可，见 scripts/lucide/LICENSE）
 * 重新生成：node scripts/make_icons.js
 */
`;

/* ---------- 3. 写 app/renderer/icons.js（ESM） ---------- */
fs.writeFileSync(OUT_JS, HEADER + '\n' + BODY.replace(/^/gm, '') +
  '\nexport { ICON_PATHS, icon, iconURI, iconImage };\n');
// ESM 里 const 声明需要 export 前缀，直接改写声明行
let js = fs.readFileSync(OUT_JS, 'utf8');
js = js.replace(/^const ICON_PATHS =/m, 'export const ICON_PATHS =')
       .replace(/^function icon\(/m, 'export function icon(')
       .replace(/^function iconURI\(/m, 'export function iconURI(')
       .replace(/^function iconImage\(/m, 'export function iconImage(')
       .replace(/\nexport \{ ICON_PATHS, icon, iconURI, iconImage \};\n/, '');
fs.writeFileSync(OUT_JS, js);

/* ---------- 4. 生成 sprite（供静态 HTML 用 <use> 引用） ---------- */
const sprite =
  '<!-- @@ICONS@@ 由 scripts/make_icons.js 生成，勿手改 @@ -->\n' +
  '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n' +
  names.map((n) => `  <symbol id="i-${n}" viewBox="0 0 24 24">${PATHS[n]}</symbol>`).join('\n') +
  '\n</svg>\n' +
  '<!-- @@/ICONS@@ -->';

/* ---------- 5. 注入 index.html 的 sprite ---------- */
const IDX = path.join(ROOT, 'app', 'renderer', 'index.html');
let idx = fs.readFileSync(IDX, 'utf8');
const RE = /<!-- @@ICONS@@[\s\S]*?<!-- @@\/ICONS@@ -->/;
if (RE.test(idx)) idx = idx.replace(RE, sprite);
else idx = idx.replace(/(<body>)/, '$1\n' + sprite);
fs.writeFileSync(IDX, idx);

/* ---------- 6. 注入 mortar-map.html 的 sprite + 经典脚本helper ---------- */
const MM = path.join(ROOT, 'mortar-map.html');
let mm = fs.readFileSync(MM, 'utf8');
// 经典脚本里不能有 import/export，直接挂到 window
const classic = sprite +
  '\n<script>\n/* @@ICONS@@ 图标辅助（由 scripts/make_icons.js 生成，勿手改） */\n' +
  BODY + '\nwindow.ICONS = { ICON_PATHS, icon, iconURI, iconImage };\n</script>\n' +
  '<!-- @@/ICONSJS@@ -->';
const REJS = /<!-- @@ICONS@@[\s\S]*?<!-- @@\/ICONSJS@@ -->/;
if (REJS.test(mm)) mm = mm.replace(REJS, classic);
else mm = mm.replace(/(<body[^>]*>)/, '$1\n' + classic);
fs.writeFileSync(MM, mm);

/* ---------- 7. 打印清单 ---------- */
console.log(`Lucide v${version} · ${names.length} 个图标`);
console.log('  app/renderer/icons.js', fs.statSync(OUT_JS).size, 'bytes');
console.log('  sprite 注入 index.html / mortar-map.html');
console.log('  ' + names.join(' '));
