#!/usr/bin/env node
/* =====================================================================
 * 图标引用一致性检查
 * ---------------------------------------------------------------------
 * 内联 SVG 图标是「静默失败」的：名字打错一个字母，页面不报错，
 * 只是那儿什么都不显示。这个脚本把所有引用点和 sprite 里的
 * <symbol id> 对一遍，把这类 bug 变成构建期错误。
 *
 * 用法：node scripts/check_icons.js
 * 退出码：0 = 一致；1 = 有悬空引用
 * ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = [
  'mortar-map.html',
  'app/renderer/index.html',
  'app/renderer/app.js',
  'app/renderer/engine.js',
  'app/renderer/app.css',
].map((f) => path.join(ROOT, f));

const src = TARGETS.map((f) => ({ file: path.relative(ROOT, f).replace(/\\/g, '/'), text: fs.readFileSync(f, 'utf8') }));

/* 扫描前先去掉注释：图标辅助函数的文档注释里写着占位符 <use href="#i-name">，
   不去掉会被当成真实引用报悬空。只去 <!-- --> 与 C 风格块注释，
   不动 //（会把 https:// 里的斜杠切掉）。 */
const stripComments = (t) => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

/* 1. sprite 里定义了哪些 symbol */
const defined = new Set();
for (const { text } of src) {
  for (const m of text.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)) defined.add(m[1]);
}
if (!defined.size) {
  console.error('没找到任何 <symbol id="i-*"> —— sprite 没注入？先跑 node scripts/make_icons.js');
  process.exit(1);
}

/* 2. 静态引用：<use href="#i-X"> */
const dangling = [];
const used = new Set();
for (const { file, text } of src) {
  stripComments(text).split(/\r?\n/).forEach((ln, i) => {
    for (const m of ln.matchAll(/href="#i-([a-z0-9-]+)"/g)) {
      used.add(m[1]);
      if (!defined.has(m[1])) dangling.push(`${file}:${i + 1}  <use #i-${m[1]}> 未定义`);
    }
  });
}

/* 3. JS 调用：icon('X') / iconImage('X') / icoImg('X')，第二个参数忽略 */
const dynamic = [];
for (const { file, text } of src) {
  text.split(/\r?\n/).forEach((ln, i) => {
    for (const m of ln.matchAll(/\b(?:icon|iconImage|icoImg)\(\s*'([^']*)'/g)) {
      const name = m[1];
      used.add(name);
      if (!defined.has(name)) dangling.push(`${file}:${i + 1}  ${m[0]}…) 未定义`);
    }
    // icon(变量) 这种没法静态判定，列出来供人工确认
    for (const m of ln.matchAll(/\b(?:icon|iconImage|icoImg)\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g)) {
      if (m[1] !== 'name') dynamic.push(`${file}:${i + 1}  ${m[0]}`);
    }
  });
}

/* 3b. 上面那两类动态引用的取值来源是两个字面量表，把它们捞出来，
       否则「已定义但未引用」会误报一屏。捞出来的同样要校验。 */
for (const { file, text } of src) {
  const claim = (name, why) => {
    used.add(name);
    if (!defined.has(name)) dangling.push(`${file}  ${why} 引用了未定义的图标 '${name}'`);
  };
  for (const m of text.matchAll(/\bic:\s*'([a-z0-9-]+)'/g)) claim(m[1], 'NAV 表');  // 导航表
  /* 工具表 ['id','图标','中文标签']。第三项必须是中文，
     否则会误匹配 ['auto','local','cdn']、['valkyra','manticore','lonestar'] 这类三元字符串数组。 */
  for (const m of text.matchAll(/\[\s*'[a-z-]+'\s*,\s*'([a-z0-9-]+)'\s*,\s*'(?=[^\x00-\x7f])/g)) {
    claim(m[1], '工具表');
  }
}

/* 4. 定义了但没用到（不是错误，只是白背着体积） */
const unused = [...defined].filter((n) => !used.has(n)).sort();

console.log(`sprite 定义 ${defined.size} 个图标，被引用 ${used.size} 个。`);
if (dynamic.length) {
  console.log('\n动态引用（无法静态判定，需人工确认取值合法）：');
  for (const d of new Set(dynamic)) console.log('  ' + d);
}
if (unused.length) console.log('\n已定义但未引用（可考虑删掉以省体积）：' + unused.join(' '));

if (dangling.length) {
  console.error(`\n悬空引用 ${dangling.length} 处：`);
  for (const d of dangling) console.error('  ' + d);
  process.exit(1);
}
console.log('\n图标引用一致，无悬空引用。');
