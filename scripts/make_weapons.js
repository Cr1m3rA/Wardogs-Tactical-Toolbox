#!/usr/bin/env node
/* =====================================================================
 * 武器/射表数据生成器
 * ---------------------------------------------------------------------
 * 数据源：apollyon-sys/wardogs-calculator 的 ref/weapons.json（社区测量）。
 * 但 ref/ 在 .gitignore 里（不随仓库分发），所以这里把用得到的那部分
 * 内联成代码，让运行时零外部依赖、且网页版与桌面版共用同一份数据。
 *
 * 产物（同源，避免只改一份导致两边数值不一致）：
 *   1. app/renderer/weapons.js —— ESM，供桌面版 engine.js / app.js 使用
 *   2. mortar-map.html        —— 内联 <script>（经典脚本），供网页版使用
 *
 * 用法：node scripts/make_weapons.js
 * ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'ref', 'weapons.json');

if (!fs.existsSync(SRC)) {
  console.error(`找不到 ${SRC}`);
  console.error('这是本地数据源（.gitignore 排除）。社区版：apollyon-sys/wardogs-calculator');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));

/* 游戏没给 zh-cn 名字的武器，这里补一个中文说明。
   注意：这是我们自己的中文注释，不是游戏内文本。 */
const ZH_OVERRIDE = {
  spg: 'SPH-2 自行火炮',
};

/* 弹道弧的中文名。single = 只有一条弹道（迫击炮）；low/high = 低/高弹道。 */
const ARC_LABEL = { single: '单弹道', low: '低弹道', high: '高弹道' };
const ARC_ORDER = ['single', 'low', 'high'];   // 展示顺序，low 在前（平射优先）

/* 把一条弹道弧整理成「距离升序」的表。
   上游 spg.high 是按射击顺序给的（距离递减），必须翻转，
   否则插值函数（假设 r 递增）会算出完全错误的密位。

   另外要按距离去重：弹道顶点附近距离会「停住」，上游 spg.high 就有
   [2629,610] 和 [2629,620] 两个同距离点。距离→密位是函数映射，
   同一个距离只能给一个答案；留两个会让插值除零得 NaN。
   保留先出现的那个（原表里 610 在前，也就是该距离上的低仰角解）。 */
function normalizeArc(key, pts) {
  const asc = pts.slice().sort((a, b) => a[0] - b[0]);
  const reversed = asc[0][0] !== pts[0][0];
  const tbl = [];
  let dropped = 0;
  for (const p of asc) {
    if (tbl.length && tbl[tbl.length - 1][0] === p[0]) { dropped++; continue; }
    tbl.push(p);
  }
  return {
    key,
    label: ARC_LABEL[key] || key,
    reversed,                                   // 记录是否翻转过，便于溯源
    dropped,                                    // 因距离重复被丢弃的点数
    tbl,
  };
}

const weapons = raw.weapons.map((w) => {
  const arcs = Object.entries(w.ballistics)
    .map(([k, pts]) => normalizeArc(k, pts))
    .sort((a, b) => ARC_ORDER.indexOf(a.key) - ARC_ORDER.indexOf(b.key));
  return {
    id: w.id,
    name: w.names['zh-cn'] || ZH_OVERRIDE[w.id] || w.names.en || w.id,
    nameEn: w.names.en || w.id,
    minR: Math.round(w.minRangeKm * 1000),      // 标称有效射程（社区值）
    maxR: Math.round(w.maxRangeKm * 1000),
    minElev: w.minElevationMil,
    maxElev: w.maxElevationMil,
    arcs,
  };
});

if (!weapons.length) { console.error('weapons.json 里没有武器'); process.exit(1); }

/* 自检：翻转后必须是严格升序，否则插值结果是错的 */
for (const w of weapons) {
  for (const a of w.arcs) {
    for (let i = 1; i < a.tbl.length; i++) {
      if (a.tbl[i][0] <= a.tbl[i - 1][0]) {
        console.error(`${w.id}.${a.key}: 第 ${i} 点距离未递增（${a.tbl[i-1][0]} → ${a.tbl[i][0]}）`);
        process.exit(1);
      }
    }
  }
}

const defaultId = raw.default || weapons[0].id;

const BODY = `
const WEAPONS = ${JSON.stringify(weapons)};
const DEFAULT_WEAPON = ${JSON.stringify(defaultId)};

/* 表内插值：给定距离求密位。表必须按距离升序（见 scripts/make_weapons.js）。 */
function rangeToMil(r, tbl){
  if (r <= tbl[0][0]) return tbl[0][1];
  const last = tbl[tbl.length - 1];
  if (r >= last[0]) return last[1];
  for (let i = 0; i < tbl.length - 1; i++){
    const [r1, m1] = tbl[i], [r2, m2] = tbl[i + 1];
    if (r <= r2) return m1 + (r - r1) * (m2 - m1) / (r2 - r1);
  }
  return last[1];
}

/* 反向插值：给定密位求落点距离。
   密位随距离是升是降要看具体弹道弧——迫击炮 950→120 递减，
   SPH-2 低弹道 20→600 递增。所以这里先判断方向再插值，
   不然低弹道会算出完全相反的答案。 */
function milToRange(m, tbl){
  const last = tbl[tbl.length - 1];
  const asc = last[1] > tbl[0][1];
  if (asc ? m <= tbl[0][1] : m >= tbl[0][1]) return tbl[0][0];
  if (asc ? m >= last[1]  : m <= last[1])  return last[0];
  for (let i = 0; i < tbl.length - 1; i++){
    const [r1, m1] = tbl[i], [r2, m2] = tbl[i + 1];
    if (asc ? m <= m2 : m >= m2) return r1 + (m - m1) * (r2 - r1) / (m2 - m1);
  }
  return last[0];
}

/* 某个距离上有哪几条弹道可用。SPG 的 780–1181 m 只有高弹道，
   1181 m 以上低/高两条都有——这是自行火炮最容易被忽略的一点。 */
function arcsFor(w, r){
  return w.arcs.filter(a => r >= a.tbl[0][0] && r <= a.tbl[a.tbl.length - 1][0]
                            && r >= w.minR && r <= w.maxR);
}
function weaponById(id){
  return WEAPONS.find(w => w.id === id) || WEAPONS.find(w => w.id === DEFAULT_WEAPON);
}
`.trim();

const HEADER = `/* 本文件由 scripts/make_weapons.js 生成，请勿手改。
 * 数据源：apollyon-sys/wardogs-calculator 的 weapons.json（社区测量，MIT）
 * 重新生成：node scripts/make_weapons.js
 */
`;

/* ---- 1. ESM 版 ---- */
const OUT = path.join(ROOT, 'app', 'renderer', 'weapons.js');
let esm = HEADER + '\n' + BODY
  .replace(/^const WEAPONS =/m, 'export const WEAPONS =')
  .replace(/^const DEFAULT_WEAPON =/m, 'export const DEFAULT_WEAPON =')
  .replace(/^function rangeToMil\(/m, 'export function rangeToMil(')
  .replace(/^function milToRange\(/m, 'export function milToRange(')
  .replace(/^function arcsFor\(/m, 'export function arcsFor(')
  .replace(/^function weaponById\(/m, 'export function weaponById(') + '\n';
fs.writeFileSync(OUT, esm);

/* ---- 2. 经典脚本版（注入 mortar-map.html） ---- */
const MM = path.join(ROOT, 'mortar-map.html');
let mm = fs.readFileSync(MM, 'utf8');
/* 用 IIFE 包住：classic <script> 的顶层 const 落在「全局词法环境」里，
   而页面后面那个主 <script> 也要声明同名的 WEAPONS / rangeToMil 等，
   两次顶层 const 同名 = SyntaxError，整个主脚本会直接不执行。
   包一层函数作用域，只把 API 挂到 window 上。 */
const classic =
  '<script>\n/* @@WEAPONS@@ 武器射表（由 scripts/make_weapons.js 生成，勿手改） */\n' +
  '(function(){\n' +
  BODY.split('\n').map(l => l ? '  ' + l : l).join('\n') + '\n' +
  '  window.WEAPONS_API = { WEAPONS, DEFAULT_WEAPON, rangeToMil, milToRange, arcsFor, weaponById };\n' +
  '})();\n</script>\n' +
  '<!-- @@/WEAPONSJS@@ -->';

const RE = /<!-- @@WEAPONS_BEGIN@@[\s\S]*?<!-- @@\/WEAPONSJS@@ -->/;
if (RE.test(mm)) {
  mm = mm.replace(RE, '<!-- @@WEAPONS_BEGIN@@ -->\n' + classic);
} else {
  // 首次运行：插到图标脚本之后、主脚本之前
  const anchor = '<!-- @@/ICONSJS@@ -->';
  if (!mm.includes(anchor)) { console.error('找不到 @@/ICONSJS@@ 锚点，先跑 make_icons.js'); process.exit(1); }
  mm = mm.replace(anchor, anchor + '\n<!-- @@WEAPONS_BEGIN@@ -->\n' + classic);
}
fs.writeFileSync(MM, mm);

/* ---- 3. 汇报 ---- */
console.log(`武器 ${weapons.length} 把，默认 ${defaultId}`);
for (const w of weapons) {
  console.log(`  ${w.id}  ${w.name}  ${w.minR}–${w.maxR} m  仰角 ${w.minElev}–${w.maxElev} mil`);
  for (const a of w.arcs) {
    console.log(`      ${a.key.padEnd(7)} ${String(a.tbl.length).padStart(3)} 点  ` +
      `${a.tbl[0][0]}–${a.tbl[a.tbl.length-1][0]} m  mil ${a.tbl[0][1]}–${a.tbl[a.tbl.length-1][1]}` +
      (a.reversed ? '  (已翻转为距离升序)' : '') +
      (a.dropped ? `  (去重 ${a.dropped} 点)` : ''));
  }
}
console.log('  app/renderer/weapons.js', fs.statSync(OUT).size, 'bytes');
