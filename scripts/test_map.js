#!/usr/bin/env node
/* =====================================================================
 * 底图投影验收测试（网页版 + 桌面版 + 悬浮窗）
 * ---------------------------------------------------------------------
 * 为什么单开一条：底图铺错范围是个「静默」故障。标点、网格、半径圈全都
 * 按世界坐标自洽地画着，只有底图被放大并平移——数值断言一个都拦不住，
 * 因为算出来的数看着完全正常。用户看到的是「Tower 的点落在塔旁边的野地里，
 * 禁炸区的圈也套不准」。
 *
 * 做法：给页面装一个假瓦片钩子（不联网，直接把瓦片当成已加载），
 *       然后拦截 CanvasRenderingContext2D.drawImage，抓渲染层【真正画出去
 *       的矩形】；把它用渲染层自己的 s2w 反算回世界坐标，和瓦片金字塔的
 *       定义（原点 = 世界西北角，格宽 = 跨度/2^z）比。
 *       期望值是从金字塔定义手推的常数，不是从被测代码里读的。
 *
 * 另有一组不依赖浏览器的一致性检查：mapdata.js 与 mortar-map.html 内联的
 * MAPS 是两份拷贝，瓦片范围必须一致——这次出问题就是因为其中一份少了字段。
 *
 * 用法：node scripts/test_map.js
 *       node scripts/test_map.js --keep   保留生成的测试页便于排查
 * 依赖：本机装有 Chrome（可用 CHROME 环境变量覆盖）。
 * 前置：先起本地服务（node scripts/serve.js）。
 * ===================================================================== */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const KEEP = process.argv.includes('--keep');
const PORT = process.env.PORT || 8099;
const BASE = `http://127.0.0.1:${PORT}`;

const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(p => fs.existsSync(p));

const R = p => path.join(ROOT, p);
const read = p => fs.readFileSync(R(p), 'utf8');
const write = (p, s) => fs.writeFileSync(R(p), s);
const temps = [];

/* ---------------------------------------------------------------------
 * 0. 数据一致性：两份地图数据必须是同一份事实
 * ------------------------------------------------------------------- */
(function data(){
  const lines = [];
  const push = (name, cond, extra) => lines.push((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));

  const md = read('app/renderer/mapdata.js')
    .replace(/^\s*export default\s*/, '').replace(/;\s*$/, '');
  const fromJs = JSON.parse(md);

  /* mortar-map.html 里那坨内联 MAPS：从 `const MAPS=` 到 `};` */
  const html = read('mortar-map.html');
  const m = html.match(/const MAPS=(\{[\s\S]*?\});\n/);
  if (!m){
    push('mortar-map.html 内联 MAPS 可解析', false, '没找到 const MAPS=...;');
  } else {
    const fromHtml = JSON.parse(m[1]);
    push('mortar-map.html 内联 MAPS 可解析', true, Object.keys(fromHtml).join(','));
    const a = Object.keys(fromJs).sort().join(','), b = Object.keys(fromHtml).sort().join(',');
    push('两份地图数据的图集一致', a === b, a === b ? a : ('mapdata.js=' + a + ' html=' + b));
    for (const id of Object.keys(fromJs)){
      if (!fromHtml[id]) continue;
      const sj = JSON.stringify(fromJs[id].tileBounds), sh = JSON.stringify(fromHtml[id].tileBounds);
      push(id + ' 两份拷贝的 tileBounds 一致且非空', !!sj && sj === sh,
           sj === sh ? sj : ('mapdata.js=' + sj + ' html=' + sh));
    }
  }
  for (const l of lines) console.log(l);
})();

/* ---------------------------------------------------------------------
 * 1. 假瓦片钩子
 * ------------------------------------------------------------------- */
/* 不联网也能跑：把 new Image() 造出来的【瓦片图】直接当成已加载（不调真正的
   src setter，所以一个字都不下载），并把 img -> url 记下来。随后拦截
   drawImage：凡是画这种假瓦片，只记矩形不真画（假图没有像素，真画会抛）。 */
const STUB = `
window.__TILEPROBE = (function(){
  var RealImage = window.Image;
  var urlOf = new WeakMap();
  var TILE_URL = /\\/zoom_(\\d+)\\/(\\d+)_(\\d+)\\.\\w+$/;
  function Fake(){
    var im = new RealImage();
    var url = '';
    Object.defineProperty(im, 'src', {
      configurable: true,
      get: function(){ return url; },
      set: function(v){
        url = v;
        if (TILE_URL.test(v)){
          urlOf.set(im, v);
          Object.defineProperty(im, 'complete',      { get: function(){ return true; } });
          Object.defineProperty(im, 'naturalWidth',  { get: function(){ return 256; } });
          Object.defineProperty(im, 'naturalHeight', { get: function(){ return 256; } });
          return;                       // 吞掉，不发请求、不触发 onerror
        }
        Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').set.call(im, v);
      }
    });
    return im;
  }
  Fake.prototype = RealImage.prototype;
  window.Image = Fake;

  var rects = [];
  var orig = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function(){
    var a = arguments;
    var u = (a.length === 5) ? urlOf.get(a[0]) : null;
    if (u){
      var g = TILE_URL.exec(u);
      rects.push({ z:+g[1], tx:+g[2], ty:+g[3], sx:a[1], sy:a[2] });
      return;                           // 假图，别真画
    }
    return orig.apply(this, a);
  };

  return {
    capture: function(){ rects.length = 0; window.__MAPAPI.redraw(); return rects.slice(); }
  };
})();
`;

const ERR_JS =
  'window.__ERR=null;window.addEventListener("error",function(e){' +
  'window.__ERR=e.message+" @"+(e.filename||"")+":"+e.lineno;});';

const STUB_TAG = '<script>' + STUB + '</script>\n';
/* 网页版：替换的是内联脚本的【开标签】，所以要留一个未闭合的 <script> 顶上去。
   桌面版：替换的是一个完整的 <script src=...></script> 元素，必须自成一体，
   否则那个没闭合的标签会把整份文档剩下的部分都当成脚本内容吞掉。 */
const PRE_HEAD = STUB_TAG + '<script>' + ERR_JS + '</script>\n<script>';
const PRE_SOLO = STUB_TAG + '<script>' + ERR_JS + '</script>\n';

const BODY = read('scripts/test/map_projection.js');
const tasks = [];

/* ---------------------------------------------------------------------
 * 2. 网页版
 * ------------------------------------------------------------------- */
(function web(){
  let s = read('mortar-map.html');
  s = s.replace('<script>', PRE_HEAD);
  s = s.replace('</body>', '<script>\n'
    + 'window.__MAPAPI = {\n'
    + '  maps: function(){ return MAPS; },\n'
    + '  setMap: function(id){ S.mapId = id; tileOk = 0; tileFail = 0; fitMap(); draw(); },\n'
    + '  s2w: s2w,\n'
    + '  box: function(m){ return m.tileBounds; },\n'
    + '  zoom: function(s){ S.view.scale = s; draw(); },\n'
    + '  redraw: function(){ S.srcMode = "cdn"; draw(); }\n'
    + '};\nwindow.__R = [];\n'
    + BODY + '\n'
    + 'var out=document.createElement("pre");out.id="__result";out.textContent=window.__R.join("\\n");document.body.append(out);\n'
    + '</scr' + 'ipt>\n</body>');
  const p = '_test_map_web.html';
  write(p, s); temps.push(p);
  tasks.push({ name: '网页版 mortar-map.html', url: `${BASE}/${p}` });
})();

/* ---------------------------------------------------------------------
 * 3. 桌面版（主窗 + 悬浮窗）
 * ------------------------------------------------------------------- */
(function desktop(){
  const appJs = read('app/renderer/app.js');
  const hook = `
/* ===== 底图投影测试钩子（生成物，勿手改；见 scripts/test_map.js） ===== */
window.__MAPAPI = {
  maps: function(){ return E.MAPS; },
  setMap: function(id){ E.setMap(id); },
  s2w: E.s2w,
  box: function(m){ return m.tileBounds; },
  zoom: function(s){ E.S.view.scale = s; E.draw(); },
  redraw: function(){ E.setSrcMode('cdn'); E.draw(); }
};
window.__R = [];
(function(){
  try {
${BODY.split('\n').map(l => l ? '    ' + l : l).join('\n')}
  } catch (e) {
    window.__R.push('FAIL | 抛异常 | ' + e.message + ' @ ' + (e.stack||'').split('\\n')[1]);
  }
  var out = document.createElement('pre');
  out.id = '__result';
  out.textContent = window.__R.join('\\n');
  document.body.append(out);
})();
`;
  write('app/renderer/_app_maptest.js', appJs + hook);
  temps.push('app/renderer/_app_maptest.js');

  for (const [suffix, label] of [['', '桌面版 主窗'], ['?overlay=1', '桌面版 悬浮窗']]){
    const html = read('app/renderer/index.html').replace(
      '<script type="module" src="app.js"></script>',
      PRE_SOLO + '<script type="module" src="_app_maptest.js"></script>');
    const p = '_test_map' + (suffix ? '_ov' : '') + '.html';
    write('app/renderer/' + p, html); temps.push('app/renderer/' + p);
    tasks.push({ name: label, url: `${BASE}/app/renderer/${p}${suffix}` });
  }
})();

/* ---------------------------------------------------------------------
 * 4. 跑
 * ------------------------------------------------------------------- */
function run(url){
  const dom = execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--virtual-time-budget=15000', '--dump-dom', url,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const m = dom.match(/<pre id="__result">([\s\S]*?)<\/pre>/);
  if (!m) return null;
  return m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

if (!CHROME){
  console.error('找不到 Chrome。用 CHROME=/path/to/chrome 指定。');
  process.exit(2);
}

let total = 0, failed = 0;
for (const t of tasks){
  let txt;
  try { txt = run(t.url); }
  catch (e){ console.log(`\n${t.name}: 启动 Chrome 失败 — ${e.message}`); failed++; continue; }
  if (!txt){
    console.log(`\n${t.name}: 未取到结果。服务起了吗？(${BASE}) 页面是否报错？`);
    console.log('  提示：先跑 node scripts/serve.js');
    failed++; continue;
  }
  const lines = txt.split('\n').filter(Boolean);
  const bad = lines.filter(l => l.startsWith('FAIL'));
  total += lines.length; failed += bad.length;
  console.log(`\n${t.name}  ${lines.length} 项` + (bad.length ? `  [FAIL] ${bad.length} 项失败` : '  [OK] 全通过'));
  for (const l of bad) console.log('   ' + l);
}

console.log('');
console.log(failed ? `[FAIL] ${failed} / ${total} 项失败` : `[OK] ${total} 项全部通过`);

if (!KEEP) for (const p of temps) { try { fs.unlinkSync(R(p)); } catch {} }
else console.log('（--keep：测试页已保留 ' + temps.join(' ') + '）');

process.exit(failed ? 1 : 0);
