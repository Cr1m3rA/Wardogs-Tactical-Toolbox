/* postinstall：从 node_modules 重建 renderer/vendor/
 * （Shoelace dist + lit 运行时依赖，import map 按本地路径解析，仓库不存这些包） */
const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..');
const nm = path.join(appDir, 'node_modules');
const out = path.join(appDir, 'renderer', 'vendor');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

function cp(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn('[vendor] 缺少 ' + src + '，跳过（npm install 未完成？）');
    return;
  }
  fs.cpSync(src, dest, { recursive: true });
}

/* Shoelace 本体（dist 为未打包 ESM，配合 index.html 的 import map 使用） */
cp(path.join(nm, '@shoelace-style/shoelace/dist'), path.join(out, 'shoelace'));

/* 运行时依赖（裸模块名 → 本地路径映射见 index.html import map） */
const RUNTIME = [
  'lit', 'lit-element', 'lit-html',
  '@lit/reactive-element', '@lit/react',
  '@shoelace-style/animations', '@shoelace-style/localize',
  '@ctrl/tinycolor',
  '@floating-ui/dom', '@floating-ui/core', '@floating-ui/utils',
  'composed-offset-position',
];
for (const p of RUNTIME) cp(path.join(nm, ...p.split('/')), path.join(out, 'npm', p));

console.log('[vendor] renderer/vendor 已从 node_modules 重建');
