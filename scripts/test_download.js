#!/usr/bin/env node
/* =====================================================================
 * 下载进度条验收测试（桌面版，取消 / 暂停 / 收尾）
 * ---------------------------------------------------------------------
 * 为什么单独一个：这条链路的前端分支全藏在 desktop.js 的 IS_TAURI 后面，
 * 网页版跑一遍是空操作，一个字都覆盖不到；而用户报的恰恰是这里——
 * 「下载时点击取消进度条会卡住一会，然后才消失」。
 *
 * 做法：在模块加载【之前】塞一个假 Tauri 桥（scripts/test/fake_tauri.js），
 *       让 IS_TAURI 为真，再由断言正文自己 emit 'dl-progress' 驱动界面。
 * 边界：只覆盖渲染层。Rust 侧的分片睡眠 / 取消标志何时被看到，这里测不到,
 *       那部分需要起真进程手工验（见 README「验收」）。
 *
 * 用法：node scripts/test_download.js
 *       node scripts/test_download.js --keep   保留生成的测试页便于排查
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
const touch = (p, s) => fs.writeFileSync(R(p), s);

const temps = [];

/* ---------- 组装测试页 ---------- */
(function build(){
  const appJs = read('app/renderer/app.js');
  const body = read('scripts/test/download_ui.js');

  /* 正文是 async 的：IPC 回包和事件派发都要等回合，同步 IIFE 装不下。 */
  const hook = `
/* ===== 下载测试钩子（生成物，勿手改；见 scripts/test_download.js） ===== */
window.__R = [];
(async function(){
  try {
${body.split('\n').map(l => l ? '    ' + l : l).join('\n')}
  } catch (e) {
    window.__R.push('FAIL | 抛异常 | ' + e.message + ' @ '
      + (e.stack || '').split('\\n').slice(0, 4).join(' <- '));
  }
  var out = document.createElement('pre');
  out.id = '__result';
  out.textContent = window.__R.join('\\n');
  document.body.append(out);
})();
`;
  touch('app/renderer/_app_dltest.js', appJs + hook);
  temps.push('app/renderer/_app_dltest.js');

  /* 假 Tauri 桥必须在模块之前执行——desktop.js 是在模块求值时读
     window.__TAURI_INTERNALS__ 定下 IS_TAURI 的，晚一步就变不回桌面版。 */
  touch('app/renderer/_fake_tauri.js', read('scripts/test/fake_tauri.js'));
  temps.push('app/renderer/_fake_tauri.js');

  /* 未捕获异常也要能报出来，否则页面静默失败看着像全过 */
  const ERR = '<script>window.__ERR=null;window.addEventListener("error",function(e){'
            + 'window.__ERR=e.message+" @"+(e.filename||"")+":"+e.lineno;});</script>\n';

  const html = read('app/renderer/index.html').replace(
    '<script type="module" src="app.js"></script>',
    ERR + '<script src="_fake_tauri.js"></script>\n'
        + '<script type="module" src="_app_dltest.js"></script>');
  touch('app/renderer/_test_dl.html', html);
  temps.push('app/renderer/_test_dl.html');
})();

/* ---------- 跑 ---------- */
function run(url){
  const dom = execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--virtual-time-budget=20000', '--dump-dom', url,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const m = dom.match(/<pre id="__result">([\s\S]*?)<\/pre>/);
  if (!m) return null;
  return m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

if (!CHROME){
  console.error('找不到 Chrome。用 CHROME=/path/to/chrome 指定。');
  process.exit(2);
}

const txt = run(`${BASE}/app/renderer/_test_dl.html`);
if (txt === null){
  console.log('未取到结果。服务起了吗？(' + BASE + ') 页面是否报错？');
  console.log('  提示：先跑 node scripts/serve.js');
  process.exit(1);
}
const lines = txt.split('\n').filter(Boolean);
const bad = lines.filter(l => l.startsWith('FAIL'));
console.log(`\n桌面版 下载进度条  ${lines.length} 项` + (bad.length ? `  [FAIL] ${bad.length} 项失败` : '  [OK] 全通过'));
for (const l of bad) console.log('   ' + l);
console.log(bad.length ? `\n[FAIL] ${bad.length} / ${lines.length} 项失败` : `\n[OK] ${lines.length} 项全部通过`);

if (!KEEP) for (const p of temps) { try { fs.unlinkSync(R(p)); } catch {} }
else console.log('（--keep：测试页已保留 ' + temps.join(' ') + '）');

process.exit(bad.length ? 1 : 0);
