#!/usr/bin/env node
/* =====================================================================
 * emoji 清零检查（出货前必跑）
 * ---------------------------------------------------------------------
 * 逐码点扫描（不用正则——正则的 emoji 类在不同 V8 版本上行为不一致，
 * 且 U+FE0F 变体选择符单独存在时扫不出来，会留下豆腐块）。
 *
 * 用法：node scripts/check_emoji.js
 * 退出码：0 = 干净；1 = 有残留
 * ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* 不扫的目录：第三方产物 / 游戏素材 / 构建中间物 / spike 临时件 /
   调研时抓下来的别家页面（.research 已在 .gitignore，永不入库、永不出货） */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'tiles', 'vendor', 'dist', 'target', '.spike-test', '.research']);
const SCAN_EXT = new Set(['.html', '.js', '.css', '.md', '.txt', '.json', '.py', '.cmd', '.rs', '.toml']);

/* 明确豁免：这份文档记录的是一个【已放弃】的小程序方案（2026-09-15 决定不做），
   里面的对勾/警告符是历史表格的状态标记，不是出货界面文字。
   （本文件自身不写这些字面量，否则会被自己扫到。） */
const EXEMPT = new Set(['小程序开发计划.md', 'package-lock.json']);

function isEmoji(cp) {
  return (cp >= 0x1f300 && cp <= 0x1faff) ||   // 各类 emoji / 符号
         (cp >= 0x1f000 && cp <= 0x1f2ff) ||   // 麻将、扑克、括号字母
         (cp >= 0x1f1e6 && cp <= 0x1f1ff) ||   // 区域指示符（国旗）
         (cp >= 0x2600 && cp <= 0x27bf) ||     // 杂项符号 + 装饰符号
         (cp >= 0x2b00 && cp <= 0x2bff);       // 杂项符号与箭头
}
/* 注意：刻意【不】把 → ↓ ← ° ± × ² √ Δ ≈ − 这类排版/数学符号算作 emoji。
   它们是中文技术文本的正常标点，替换成图标反而降低可读性。 */

const hits = [];
let scanned = 0;

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) { walk(full); continue; }
    if (!SCAN_EXT.has(path.extname(name))) continue;
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (EXEMPT.has(rel)) continue;
    scanned++;
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((ln, i) => {
      const found = [...ln].filter((ch) => {
        const cp = ch.codePointAt(0);
        return isEmoji(cp) || cp === 0xfe0f;     // U+FE0F 单独查，防豆腐块
      });
      if (found.length) {
        hits.push({ file: rel, line: i + 1, chars: found.join(''), text: ln.trim().slice(0, 80) });
      }
    });
  }
}

walk(ROOT);

if (hits.length) {
  console.error(`emoji 残留 ${hits.length} 处（扫描了 ${scanned} 个文件）：\n`);
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}  ${JSON.stringify(h.chars)}  | ${h.text}`);
  }
  console.error('\n豁免（不参与判定）：');
  for (const e of EXEMPT) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`emoji 清零通过：扫描 ${scanned} 个文件，0 处残留（含 U+FE0F 变体选择符）。`);
console.log(`豁免：${[...EXEMPT].join(', ')}`);
