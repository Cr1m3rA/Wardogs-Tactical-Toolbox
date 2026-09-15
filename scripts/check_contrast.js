#!/usr/bin/env node
/* =====================================================================
 * 主题对比度扫描：找出「文字与背景同色系、实际看不见」的元素
 * ---------------------------------------------------------------------
 * 起因：指针坐标浮标把底色写死成深色、文字用 var(--ink)，浅色主题下
 * --ink 本身是深色，于是深字压深底，整个浮标等于隐形。用户报成
 * 「悬浮窗光标不带坐标」＋「浅色模式看不清」。
 *
 * 这类 bug 肉眼看不出规律、写了也不会抛异常，只能机器扫：
 * 在真实浏览器里把两种主题各渲染一遍，逐个带文字的元素算对比度。
 *
 * 标准：分两档，因为这两档的含义完全不同。
 *   [FAIL] < 3:1 —— 硬失败。3:1 是 AA 对大字的最低要求，低于它无论多大都读不清，
 *                   属于「设计事故」：写死的浅色字撞上深色底，或者反过来。
 *   [WARN] 3:1 ~ 4.5:1 —— 只报告不失败。次要文字（--ink-3 那一档）本来就该比正文淡，
 *                   强行拉到 4.5 会让它和 --ink-2 撞成同一个灰度、层级塌掉。
 * 半透明背景按图层逐层合成，不靠猜。
 *
 * 前置：先起本地服务（node scripts/serve.js）。
 * 用法：node scripts/check_contrast.js
 * ===================================================================== */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 8099;
const BASE = `http://127.0.0.1:${PORT}`;

const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });

const R = p => path.join(ROOT, p);
const read = p => fs.readFileSync(R(p), 'utf8');
const write = (p, s) => fs.writeFileSync(R(p), s);

/* ---------- 注入的扫描器：跑在真实页面里 ---------- */
const SCAN_JS = `
(function(){
  function parse(c){
    var m = c.match(/[\\d.]+/g); if (!m || m.length < 3) return null;
    return { r:+m[0], g:+m[1], b:+m[2], a: m.length > 3 ? +m[3] : 1 };
  }
  function lin(v){ v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }
  function lum(c){ return 0.2126*lin(c.r) + 0.7152*lin(c.g) + 0.0722*lin(c.b); }
  function ratio(a, b){
    var l1 = lum(a), l2 = lum(b);
    return (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05);
  }
  /* top 覆盖在 bottom 上 */
  function over(bottom, top){
    var a = top.a + bottom.a*(1-top.a);
    if (a === 0) return { r:0, g:0, b:0, a:0 };
    return {
      r: (top.r*top.a + bottom.r*bottom.a*(1-top.a))/a,
      g: (top.g*top.a + bottom.g*bottom.a*(1-top.a))/a,
      b: (top.b*top.a + bottom.b*bottom.a*(1-top.a))/a,
      a: a
    };
  }
  /* 沿祖先链收集背景图层，从最外层往内逐层合成。
     遇到渐变/背景图就认输返回 null —— 颜色算不出来就别猜，
     否则会把「琥珀渐变 + 深字」这种完全正常的徽标误报成对比度 1.02。 */
  function bgOf(el){
    var layers = [], cur = el;
    while (cur){
      var cs = getComputedStyle(cur);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      var c = parse(cs.backgroundColor);
      if (c && c.a > 0.001){
        layers.push(c);
        if (c.a >= 0.999) break;
      }
      cur = cur.parentElement;
    }
    var out = { r:255, g:255, b:255, a:1 };   /* 兜底：页面假定白底 */
    for (var i = layers.length - 1; i >= 0; i--) out = over(out, layers[i]);
    return out;
  }
  function hasText(el){
    for (var i = 0; i < el.childNodes.length; i++){
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue.trim()) return n.nodeValue.trim();
    }
    return null;
  }
  function sel(el){
    var s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    if (el.className && typeof el.className === 'string'){
      var c = el.className.trim().split(/\\s+/).slice(0, 2).join('.');
      if (c) s += '.' + c;
    }
    return s;
  }
  function rgb(c){ return 'rgb(' + [c.r,c.g,c.b].map(function(v){ return Math.round(v); }).join(',') + ')'; }

  var hard = [], soft = [], checked = 0;
  var all = document.querySelectorAll('body *');
  for (var i = 0; i < all.length; i++){
    var el = all[i];
    var txt = hasText(el);
    if (!txt) continue;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    var fg = parse(cs.color);
    if (!fg || fg.a === 0) continue;
    var bg = bgOf(el);
    if (!bg) continue;          /* 背景是渐变/图片，算不出来就不判 */
    var eff = fg.a >= 0.999 ? fg : over(bg, fg);
    var size = parseFloat(cs.fontSize) || 16;
    var bold = (+cs.fontWeight || 400) >= 700;
    var large = size >= 24 || (size >= 18.66 && bold);
    var min = large ? 3 : 4.5;
    var got = ratio(bg, eff);
    checked++;
    if (got >= min) continue;
    var line = '  ' + sel(el) + '  ' + got.toFixed(2) + ':1 (需 ' + min + ')  "' +
      txt.slice(0, 18) + '"  字 ' + rgb(eff) + ' / 底 ' + rgb(bg);
    (got < 3 ? hard : soft).push(line);
  }
  var out = document.createElement('pre');
  out.id = '__contrast';
  out.textContent =
    (hard.length ? hard.join('\\n') + '\\n' : '') +
    (soft.length ? '@@SOFT\\n' + soft.join('\\n') + '\\n' : '') +
    '@@CHECKED ' + checked + ' @@BAD ' + hard.length + ' @@WARN ' + soft.length;
  document.body.append(out);
})();
`;

const tasks = [];
const temps = [];

/* 主题要先写进存档再让页面自己的脚本跑：两边的配色都跟着存档里的 theme 走，
   事后硬改 class 会被它们自己的 render/applyTheme 覆盖回去。
   PRE 插在 <body> 之后（早于页面脚本），POST 插在 </body> 之前负责扫描。 */
const PRE_JS =
  'try{var d=new URLSearchParams(location.search).get("contrast")==="dark";' +
  'var k="wardogs-mortar-map-v1";' +
  'var st=JSON.parse(localStorage.getItem(k)||"{}");' +
  'st.theme=d?"dark":"light";localStorage.setItem(k,JSON.stringify(st));}catch(e){}';

/* 扫描必须等：app.js 是 ESM（延迟执行），面板要等它渲染完才有元素可测 */
const POST_JS =
  'function __scan(){' + SCAN_JS + '}' +
  'window.addEventListener("load",function(){setTimeout(__scan,1200);});';

function inject(srcPath, outPath){
  let s = read(srcPath);
  if (!/<body[^>]*>/.test(s)) throw new Error(srcPath + ' 里找不到 <body>');
  s = s.replace(/<body[^>]*>/, m => m + '\n<script>' + PRE_JS + '</scr' + 'ipt>');
  s = s.replace('</body>', '<script>' + POST_JS + '</scr' + 'ipt>\n</body>');
  write(outPath, s);
  temps.push(outPath);
}

(function web(){
  inject('mortar-map.html', '_contrast_web.html');
  tasks.push({ name: '网页版 mortar-map.html', base: `${BASE}/_contrast_web.html` });
})();

(function desktop(){
  inject('app/renderer/index.html', 'app/renderer/_contrast.html');
  tasks.push({ name: '桌面版 app/renderer', base: `${BASE}/app/renderer/_contrast.html` });
})();

function scan(url){
  const dom = execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--virtual-time-budget=15000', '--dump-dom', url,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const m = dom.match(/<pre id="__contrast">([\s\S]*?)<\/pre>/);
  if (!m) return null;
  return m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
}

if (!CHROME){
  console.error('找不到 Chrome。用 CHROME=/path/to/chrome 指定。');
  process.exit(2);
}

let totalBad = 0, totalWarn = 0;
for (const t of tasks){
  for (const theme of ['light', 'dark']){
    let txt;
    try { txt = scan(`${t.base}?contrast=${theme}`); }
    catch (e){ console.log(`\n${t.name} [${theme}] 启动 Chrome 失败 — ${e.message}`); totalBad++; continue; }
    if (txt == null){
      console.log(`\n${t.name} [${theme}] 拿不到结果（先跑 node scripts/serve.js？）`);
      totalBad++; continue;
    }
    const m = txt.match(/@@CHECKED (\d+) @@BAD (\d+) @@WARN (\d+)/);
    const n = m ? +m[2] : 0, w = m ? +m[3] : 0;
    totalBad += n; totalWarn += w;
    const label = theme === "light" ? "浅色" : "深色";
    console.log(`\n${t.name}  ${label}  检查 ${m ? m[1] : '?'} 个元素` +
      (n ? `  [FAIL] ${n} 处看不清` : '  [FAIL] 0') + (w ? `  [WARN] ${w} 处偏淡` : ''));
    const [hardPart, softPart] = txt.split('@@SOFT');
    if (n) console.log(hardPart.replace(/\n@@CHECKED[\s\S]*$/, ''));
    if (w) console.log('  —— 以下为次要文字（3~4.5:1，设计如此，仅提示）——\n' +
      softPart.replace(/\n@@CHECKED[\s\S]*$/, ''));
  }
}

for (const p of temps){ try { fs.unlinkSync(R(p)); } catch {} }

if (totalBad){
  console.log(`\n[FAIL] ${totalBad} 处文字对比度低于 3:1（无论字号多大都读不清）` +
    (totalWarn ? `；另有 ${totalWarn} 处次要文字偏淡` : ''));
} else {
  console.log(`\n[OK] 无低于 3:1 的文字` + (totalWarn ? `（${totalWarn} 处次要文字处于 3~4.5:1，已设计为较淡）` : ''));
}
process.exit(totalBad ? 1 : 0);
