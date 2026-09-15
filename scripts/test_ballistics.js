#!/usr/bin/env node
/* =====================================================================
 * 弹道解算验收测试（网页版 + 桌面版，共 60+ 项断言）
 * ---------------------------------------------------------------------
 * 为什么要有这个：射表是按武器参数化的，密位与距离的关系随弹道弧反向
 * （迫击炮 950→120 递减，SPH-2 低弹道 20→600 递增）。这类错误不会抛异常，
 * 只会安静地算出一个「看起来正常但其实完全错」的密位——只能靠断言拦住。
 * 改了 scripts/make_weapons.js 的数据或 engine.js 的插值后，务必跑一遍。
 *
 * 做法：把断言正文注入两个页面的副本，用无头 Chrome 跑真实渲染层，
 *       再把结果从 DOM 里读回来。用完的临时文件自动删除。
 *
 * 用法：node scripts/test_ballistics.js
 *       node scripts/test_ballistics.js --keep   保留生成的测试页便于排查
 * 依赖：本机装有 Chrome。缺省路径可用 CHROME 环境变量覆盖。
 * 前置：先起本地服务（serve.cmd 或 node scripts/serve.js）。
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

/* 注入到页面最前面：未捕获异常也要能报出来，否则页面静默失败看着像全过。
   ERR_HEAD 自带一个未闭合的 <script>，用来「吃掉」被替换掉的那个开标签；
   ERR_SOLO 是完整独立的一对标签，用在不能替换标签、只能往后追加的地方。 */
const ERR_JS =
  'window.__ERR=null;window.addEventListener("error",function(e){' +
  'window.__ERR=e.message+" @"+(e.filename||"")+":"+e.lineno;});' +
  /* 数一数启动阶段到底画了几帧。draw() 第一件事就是 clearRect，拿它当探针。
     分开记 resize 次数，是为了让「画过了」这条断言不会因为一次 resize 事件
     碰巧触发重绘而变得没有意义——两个数一起看才说明问题。 */
  'window.__draws=0;window.__resizes=0;' +
  '(function(){var f=CanvasRenderingContext2D.prototype.clearRect;' +
  'CanvasRenderingContext2D.prototype.clearRect=function(){window.__draws++;return f.apply(this,arguments);};' +
  'window.addEventListener("resize",function(){window.__resizes++;});})();';
const ERR_HEAD = '<script>' + ERR_JS + '</script>\n<script>';
const ERR_SOLO = '<script>' + ERR_JS + '</script>\n';

const tasks = [];
const temps = [];

/* ---------- 1. 网页版：把正文追加成一个普通 <script> ---------- */
(function web(){
  let s = read('mortar-map.html');
  const body = read('scripts/test/ballistics_web.js');
  s = s.replace('<script>', ERR_HEAD);
  s = s.replace('</body>', '<script>\n' + body + '\n</scr' + 'ipt>\n</body>');
  const p = '_test_web.html';
  write(p, s); temps.push(p);
  tasks.push({ name: '网页版 mortar-map.html', url: `${BASE}/${p}` });
})();

/* ---------- 2. 桌面版：app.js 是 ESM，内部绑定不挂 window，
                  复制一份并在末尾追加导出钩子，再让页面加载副本 ---------- */
(function desktop(){
  const appJs = read('app/renderer/app.js');
  const body = read('scripts/test/ballistics_desktop.js');
  const hook = `
/* ===== 测试钩子（生成物，勿手改；见 scripts/test_ballistics.js） ===== */
window.__T = { E, CW, CA, milAt, nSol, milHint, weaponBar, viewIntel, WEAPONS };
window.__R = [];
(function(){
  function ck(name, cond, extra){ window.__R.push((cond?'PASS':'FAIL')+' | '+name+(extra?' | '+extra:'')); }
  try {
${body.split('\n').map(l => l ? '    ' + l : l).join('\n')}
  } catch (e) {
    window.__R.push('FAIL | 抛异常 | ' + e.message + ' @ ' + (e.stack||'').split('\\n')[1]);
  }
  var out = document.createElement('pre');
  out.id = '__result';
  out.textContent = window.__R.join('\\n');
  document.body.append(out);
})();
`;
  write('app/renderer/_app_test.js', appJs + hook);
  temps.push('app/renderer/_app_test.js');

  let html = read('app/renderer/index.html').replace(
    '<script type="module" src="app.js"></script>',
    ERR_SOLO + '<script type="module" src="_app_test.js"></script>');
  write('app/renderer/_test.html', html);
  temps.push('app/renderer/_test.html');

  tasks.push({ name: '桌面版 app/renderer', url: `${BASE}/app/renderer/_test.html` });
  /* 悬浮窗模式再跑一遍：它用的是另一张画布（#mapOv）和另一套布局，
     主窗全绿完全不能说明悬浮窗没问题——用户报的恰恰是悬浮窗。 */
  tasks.push({ name: '桌面版 悬浮窗模式', url: `${BASE}/app/renderer/_test.html?overlay=1` });
})();

/* ---------- 3. 跑 ---------- */
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
    console.log('  提示：先跑 node scripts/serve.js，且本机要能访问 ' + BASE);
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
