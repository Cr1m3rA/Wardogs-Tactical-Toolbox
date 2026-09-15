#!/usr/bin/env node
/* =====================================================================
 * 零依赖静态文件服务器（serve.cmd 在没装 Python 的机器上的后备）
 * ---------------------------------------------------------------------
 * 为什么需要：file:// 下浏览器会拦截 tiles/ 的本地读取，且 ESM 模块
 * 与 import map 在 file:// 下行为不一致。原 serve.cmd 只认 Python，
 * 而 Windows 自带的 python.exe 往往是应用商店占位符（一运行就报
 * "Python was not found"）。Node 现在几乎必备，这里补一条路。
 *
 * 用法：node scripts/serve.js [端口] [根目录]
 * 默认：端口 8099，根目录为仓库根
 * ===================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2]) || 8099;
const ROOT = path.resolve(process.argv[3] || path.join(__dirname, '..'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400); return res.end('bad request');
  }
  /* /__hold?ms=N —— 拖延 N 毫秒再回 204。
     给性能测量脚本用：无头 Chrome 的 --dump-dom 是在 load 事件后取快照的，
     而 --virtual-time-budget 会把 performance.now() 一起虚拟化（同步代码量出来
     恒等于 0，全是假数），所以只能不用虚拟时间、改用「往页面里塞一张慢图」
     把 load 拖到测量结束。 */
  if (rel === '/__hold'){
    const ms = Math.min(60000, Number(new URL(req.url, 'http://localhost').searchParams.get('ms')) || 0);
    return setTimeout(() => { res.writeHead(204); res.end(); }, ms);
  }

  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, rel);

  // 目录穿越防护：解析后的绝对路径必须仍在 ROOT 内
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403); return res.end('forbidden');
  }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`serving ${ROOT}`);
  console.log(`  http://127.0.0.1:${PORT}/mortar-map.html`);
  console.log('Ctrl+C to stop.');
});
