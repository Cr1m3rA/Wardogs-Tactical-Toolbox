/* ============================================================
 * WARDOGS 战术工具箱 — 桌面版 UI（Shoelace 组件层）
 * ============================================================ */
import { setBasePath } from './vendor/shoelace/utilities/base-path.js';
setBasePath('vendor/shoelace/assets/');

import './vendor/shoelace/components/button/button.js';
import './vendor/shoelace/components/input/input.js';
import './vendor/shoelace/components/select/select.js';
import './vendor/shoelace/components/option/option.js';
import './vendor/shoelace/components/switch/switch.js';
import './vendor/shoelace/components/badge/badge.js';
import './vendor/shoelace/components/alert/alert.js';
import './vendor/shoelace/components/tag/tag.js';
import './vendor/shoelace/components/tooltip/tooltip.js';
import './vendor/shoelace/components/divider/divider.js';
import './vendor/shoelace/components/textarea/textarea.js';
import './vendor/shoelace/components/icon/icon.js';

import {
  createEngine, TBL, MIN_R, MAX_R, MAPS,
  rangeToMil, solveVector, fx, fm0, faz, parseNum, parsePair, distM, poisOf,
  BUILD_CATALOG, BUILD_PRESETS, FOB_RADIUS, UNIT_PRICE, PALLET, UNIT_KG,
  MARK_COLORS, RADIUS_PRESETS, SRC_SEQ, SRC_TXT,
} from './engine.js';

/* ---------- 环境 ---------- */
const qs = new URLSearchParams(location.search);
const isOverlay = qs.has('overlay');
if (isOverlay) document.body.classList.add('overlay');

const $ = id => document.getElementById(id);

/* ---------- 引擎 ---------- */
const canvas = $(isOverlay ? 'mapOv' : 'map');
const E = createEngine(canvas, {
  onFlash: toast,
  onCursor: w => { $('cursorCoord').textContent = `X ${fx(w.x)} / Y ${fx(w.y)}`; },
  onChange: scheduleRender,
});

/* ---------- 常用小组件 ---------- */
function toast(msg){
  const a = document.createElement('sl-alert');
  a.variant = 'primary'; a.closable = true; a.duration = 2200;
  a.textContent = msg;
  document.body.append(a);
  a.toast();
}
function alert(cls, html){
  const v = cls === 'ok' ? 'success' : cls === 'bad' ? 'danger' : 'warning';
  return `<sl-alert variant="${v}" open>${html}</sl-alert>`;
}
function copy(txt){
  const done = () => toast('已复制');
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => toast('复制失败'));
  else toast('复制失败');
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

/* ---------- 导航 ---------- */
const NAV = [
  {id:'solve',    ic:'🎯', label:'算诸元'},
  {id:'predict',  ic:'📮', label:'推落点'},
  {id:'correct',  ic:'🔧', label:'修偏差'},
  {id:'tools',    ic:'🧰', label:'工具'},
  {id:'intel',    ic:'📡', label:'情报'},
  {id:'build',    ic:'🏗️', label:'建造'},
  {id:'table',    ic:'📖', label:'射表'},
  {id:'settings', ic:'⚙️', label:'数据'},
];
$('nav').innerHTML = NAV.map(n =>
  `<button class="nav-btn" data-mode="${n.id}" type="button"><span class="ic">${n.ic}</span>${n.label}</button>`).join('');
$('nav').querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => {
  E.setMode(b.dataset.mode); E.compute(); E.draw(); E.save(); scheduleRender();
}));

/* ---------- 顶栏 ---------- */
$('mapSel').innerHTML = Object.values(MAPS).map(m =>
  `<sl-option value="${m.id}">${m.name}</sl-option>`).join('');
$('srcSel').innerHTML = SRC_SEQ.map(s =>
  `<sl-option value="${s}">底图·${SRC_TXT[s]}</sl-option>`).join('');
$('mapSel').addEventListener('sl-change', () => E.setMap($('mapSel').value));
$('srcSel').addEventListener('sl-change', () => E.setSrcMode($('srcSel').value));
$('btnGrid').addEventListener('click', () => E.toggle('showGrid'));
$('btnPoi').addEventListener('click',  () => E.toggle('showPoi'));
$('btnMarks').addEventListener('click',() => E.toggle('showMarks'));
$('btnFit').addEventListener('click',  () => { E.fitMap(); E.draw(); });
$('btnShot').addEventListener('click', () => {
  try { E.screenshot(); toast('已导出 PNG'); }
  catch { toast('导出失败（跨域限制）'); }
});

const MODE_HINT = {
  solve:'点地图放置点位 · 滚轮缩放 · 按住拖动 · 可拖动标记',
  predict:'点地图放炮位，再点一下设定目标方向',
  correct:'点地图放置炮位 / 目标 / 弹坑',
  tools:'选工具后在地图上点 · 滚轮缩放 · 拖动平移',
  intel:'列表「定位」可跳转 · 地图只作浏览',
  build:'选建筑 →「放到地图上」→ 图上落点',
  table:'浏览射表，地图只作浏览',
  settings:'外观 / 数据备份 / 战斗记录',
};

/* ---------- 渲染调度 ---------- */
let typing = false;
$('panel').addEventListener('focusin', () => { typing = true; });
$('panel').addEventListener('focusout', () => { typing = false; scheduleRender(); });
let raf = 0;
function scheduleRender(){
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; render(); });
}
function render(){
  const S = E.S;
  document.documentElement.classList.toggle('sl-theme-dark', S.theme === 'dark');
  document.body.classList.toggle('light', S.theme !== 'dark');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
  if ($('mapSel').value !== S.mapId) $('mapSel').value = S.mapId;
  if ($('srcSel').value !== S.srcMode) $('srcSel').value = S.srcMode;
  $('btnGrid').classList.toggle('on', S.showGrid);
  $('btnPoi').classList.toggle('on', S.showPoi);
  $('btnMarks').classList.toggle('on', S.showMarks);
  $('hintBar').textContent = MODE_HINT[S.mode] || '';
  const st = E.tileStat();
  $('tileStat').textContent = `底图 ${st.name} · 已渲染 ${st.tileOk} 块`;
  if (isOverlay){ renderHud(); return; }
  renderPanel();
}
function renderPanel(){
  if (typing) return;                       // 输入中不重建面板，避免光标跳动
  const panel = $('panel');
  const keep = panel.scrollTop;
  const S = E.S;
  panel.innerHTML = ({
    solve: viewSolve, predict: viewPredict, correct: viewCorrect,
    tools: viewTools, intel: viewIntel, build: viewBuild,
    table: viewTable, settings: viewSettings,
  })[S.mode]();
  panel.scrollTop = keep;
  bindPanel();
}

/* ---------- 坐标输入组件 ---------- */
function coordField(id, label, val){
  return `<sl-input id="${id}" data-coord size="small" label="${label}" placeholder="—" value="${val}"></sl-input>`;
}
function coordPair(px, py, label, p){
  return coordField(px, label + ' X', p ? fx(p.x) : '') + coordField(py, label + ' Y', p ? fx(p.y) : '');
}
/* X/Y 两个输入框必须成对解析（单独一个数字不成坐标） */
function bindCoordPair(ix, iy, assign){
  const ex = $(ix), ey = $(iy); if (!ex || !ey) return;
  const upd = () => {
    const a = parseNum(ex.value), b = parseNum(ey.value);
    assign((a != null && b != null) ? { x:a, y:b } : null);
    E.compute(); E.draw(); E.save(); scheduleRender();
  };
  ex.addEventListener('sl-input', upd);
  ey.addEventListener('sl-input', upd);
}

/* ---------- 视图：算诸元 ---------- */
function putSeg(modes){
  const names = { mortar:'放炮位', target:'放目标', impact:'弹坑' };
  return `<div class="seg">${modes.map(m =>
    `<button data-put="${m}" class="${E.S.put === m ? 'on' : ''}" type="button">${names[m]}</button>`).join('')}</div>`;
}
function viewSolve(){
  const S = E.S, r = S.results.solve;
  return `
  ${putSeg(['mortar','target'])}
  <div class="card">
    <h3>坐标</h3>
    <div class="row2">${coordPair('mx','my','炮位',S.mortar)}</div>
    <div class="row2" style="margin-top:9px">${coordPair('tx','ty','目标',S.target)}</div>
    <sl-input id="pIns" class="paste" size="small" placeholder="粘贴 Mark Coordinates：x83.64, y72.85"></sl-input>
    <sl-button variant="primary" id="btnSolve" style="width:100%;margin-top:12px" size="medium">计算射击诸元</sl-button>
  </div>
  <div id="outSolve">${r ? solveResult(r) : ''}</div>`;
}
function solveResult(r){
  if (r.err) return alert('warn', esc(r.err));
  return `
  <div class="card">
    <h3>射击诸元</h3>
    <div class="readout">
      <div class="ro big"><div class="k">密位 MIL（右边仰角）</div><div class="v">${fm0(r.milR)}<small>密位</small></div></div>
      <div class="ro"><div class="k">RNG 距离（左边滑杆）</div><div class="v">${fm0(r.dist)}<small>m</small></div></div>
      <div class="ro"><div class="k">方位角 AZIMUTH</div><div class="v">${faz(r.az)}</div></div>
    </div>
    <div class="cmd"><span class="lb">射击口令</span><b>${esc(r.cmd)}</b>
      <span class="sp" style="flex:1"></span>
      <sl-button size="small" data-copy="${esc(r.cmd)}">复制</sl-button></div>
    ${alert(r.stCls, esc(r.stTxt))}
    ${r.nf ? alert('bad', `🚫 目标位于禁炸区「${esc(r.nf)}」内——确认真的要打这里吗？`) : ''}
    <div class="kv">
      <div><span>ΔX / ΔY（坐标单位）</span><span>${r.dx.toFixed(2)} / ${r.dy.toFixed(2)}</span></div>
      <div><span>50 MOA 散布</span><span>± ${r.spread.toFixed(1)} m</span></div>
      <div><span>取整密位对应射程</span><span>${Math.round(r.distAtMil)} m</span></div>
    </div>
  </div>`;
}

/* ---------- 视图：推落点 ---------- */
function viewPredict(){
  const S = E.S, r = S.results.predict;
  return `
  <div class="card">
    <h3>炮位 + 方位 + 密位 → 落点</h3>
    <p class="muted" style="margin:0 0 10px">炮位与「算诸元」共用，${S.mortar ? '已设' : '未设——先放炮位'}。地图上点两下可快速试方向。</p>
    <div class="row2">${coordPair('pmx','pmy','炮位',S.mortar)}</div>
    <div class="row2" style="margin-top:9px">
      ${coordField('paz','方位角 °（0=北 90=东）', S.predAz)}
      ${coordField('prng','或 RNG 距离 m', S.predRng)}
    </div>
    <div style="margin-top:9px">${coordField('pmil','或 密位 MIL', S.predMil)}</div>
    <sl-button variant="primary" id="btnPredict" style="width:100%;margin-top:12px">推算落点坐标</sl-button>
  </div>
  ${r ? predictResult(r) : ''}`;
}
function predictResult(r){
  if (r.err) return alert('warn', esc(r.err));
  return `
  <div class="card">
    <h3>预测落点</h3>
    <div class="readout">
      <div class="ro big"><div class="k">预测落点 X / Y</div><div class="v">${fx(r.x)}<small>,</small> ${fx(r.y)}</div></div>
      <div class="ro"><div class="k">射程</div><div class="v">${fm0(r.dist)}<small>m</small></div></div>
      <div class="ro"><div class="k">对应密位</div><div class="v">${fm0(r.milBack)}</div></div>
    </div>
    ${alert(r.stCls, esc(r.stTxt) + (r.off ? '（原始落点超出地图边界，已截断）' : ''))}
    ${r.nf ? alert('bad', `🚫 预测落点位于禁炸区「${esc(r.nf)}」内！先撤销禁炸区或换落点。`) : ''}
    <div class="kv">
      <div><span>方位角</span><span>${faz(r.azIn)}</span></div>
      <div><span>相对炮位偏移</span><span>ΔX ${r.dx.toFixed(2)} / ΔY ${r.dy.toFixed(2)}</span></div>
      <div><span>50 MOA 散布</span><span>± ${r.spread.toFixed(1)} m</span></div>
    </div>
  </div>`;
}

/* ---------- 视图：修偏差 ---------- */
function viewCorrect(){
  const S = E.S, r = S.results.correct;
  return `
  ${putSeg(['mortar','target','impact'])}
  <div class="card">
    <h3>试射修正</h3>
    <div class="row2">${coordPair('cmx','cmy','炮位',S.mortar)}</div>
    <div class="row2" style="margin-top:9px">${coordPair('ctx','cty','目标',S.target)}</div>
    <div class="row2" style="margin-top:9px">${coordPair('cix','ciy','弹坑',S.impact)}</div>
    <sl-button variant="primary" id="btnCorrect" style="width:100%;margin-top:12px">计算修正量</sl-button>
  </div>
  ${r ? correctResult(r) : ''}`;
}
function correctResult(r){
  if (r.err) return alert('warn', esc(r.err));
  if (r.partial) return `
    <div class="card"><h3>弹坑核对</h3>
      <div class="readout">
        <div class="ro big"><div class="k">弹坑相对炮位</div><div class="v">${Math.round(r.impDist)}<small>m /</small> ${faz(r.impAz)}</div></div>
        <div class="ro"><div class="k">该射程对应密位</div><div class="v">${fm0(r.mil)}</div></div>
        <div class="ro"><div class="k">50 MOA 散布</div><div class="v">± ${r.spread.toFixed(1)}<small>m</small></div></div>
      </div>
      ${alert('warn','没有目标坐标，只能核对弹坑落点。填上目标坐标才是真正的修正量。')}
    </div>`;
  const drTxt = Math.abs(r.dR) < 2 ? '距离基本对，只要修方向'
    : (r.dR > 0 ? `打短了 ${Math.round(r.dR)} m → 要<b>加距离</b>` : `打远了 ${Math.round(-r.dR)} m → 要<b>减距离</b>`);
  const daTxt = Math.abs(r.dAz) < 0.5 ? '方向基本对'
    : (r.dAz > 0 ? `偏左 ${Math.abs(r.dAz).toFixed(1)}° → 往<b>右</b>转` : `偏右 ${Math.abs(r.dAz).toFixed(1)}° → 往<b>左</b>转`);
  return `
  <div class="card"><h3>修正量</h3>
    <div class="readout">
      <div class="ro big"><div class="k">修正后密位 / 方位</div><div class="v">${fm0(r.mil)} <small>密位 /</small> ${faz(r.az)}</div></div>
      <div class="ro"><div class="k">距离修正</div><div class="v">${r.dR>=0?'+':''}${Math.round(r.dR)}<small>m</small></div></div>
      <div class="ro"><div class="k">方向修正</div><div class="v">${r.dAz>=0?'+':''}${r.dAz.toFixed(1)}<small>°</small></div></div>
    </div>
    <div class="cmd"><span class="lb">修正口令</span><b>${esc(r.cmd)}</b>
      <span class="sp" style="flex:1"></span>
      <sl-button size="small" data-copy="${esc(r.cmd)}">复制</sl-button></div>
    ${alert('ok', `${drTxt}；${daTxt}。L81 上<b>密位调小 = 打得更远</b>。`)}
    <div class="kv">
      <div><span>目标距离 / 方位</span><span>${Math.round(r.tgtDist)} m / ${faz(r.tgtAz)}</span></div>
      <div><span>弹坑距离 / 方位</span><span>${Math.round(r.impDist)} m / ${faz(r.impAz)}</span></div>
      <div><span>落点偏差（直线）</span><span>${r.dev} m</span></div>
    </div>
  </div>`;
}

/* ---------- 视图：工具 ---------- */
function viewTools(){
  const S = E.S;
  const tools = [
    ['ruler','📏 测距'], ['circle','⭕ 半径圈'], ['ray','🧭 方位线'],
    ['marker','📍 标记'], ['route','🚶 路线'], ['poly','⬟ 区域'],
  ];
  const body = {
    ruler: toolRuler, circle: toolCircle, ray: toolRay,
    marker: toolMarker, route: toolRoute, poly: toolPoly,
  }[S.tool]();
  return `
  <div class="toolgrid">${tools.map(([id, lb]) =>
    `<button data-tool="${id}" class="${S.tool === id ? 'on' : ''}" type="button">${lb}</button>`).join('')}</div>
  ${body}`;
}
function toolRuler(){
  const {a, b} = E.S.ruler;
  if (!a) return alert('warn','在地图上点两下，量任意两点的距离和方位。');
  if (!b) return alert('warn','起点已放好，再点一下结束。');
  const {dist, az} = solveVector(b.x-a.x, b.y-a.y);
  return `<div class="card"><h3>测距</h3>
    <div class="readout">
      <div class="ro big"><div class="k">两点直线距离</div><div class="v">${fm0(dist)}<small>m</small></div></div>
      <div class="ro"><div class="k">方位（a→b）</div><div class="v">${faz(az)}</div></div>
      <div class="ro"><div class="k">坐标差</div><div class="v" style="font-size:14px">${fx(a.x)},${fx(a.y)} → ${fx(b.x)},${fx(b.y)}</div></div>
    </div>
    <sl-button id="tlClear" style="width:100%">重新量</sl-button></div>`;
}
function toolCircle(){
  const S = E.S;
  return `<div class="card"><h3>半径圈</h3>
    ${alert('warn','点第一下 = 圆心，第二下 = 半径；也可用预设半径（点圆心即成圈）。')}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      ${RADIUS_PRESETS.map(r => `<sl-button size="small" data-pr="${r}">${r} m</sl-button>`).join('')}
    </div>
    <div class="list">${S.circles.map(c => `
      <div class="li"><span class="nm" style="color:#b57bd6">${esc(c.name)}</span>
        <span class="co">${fx(c.x)}, ${fx(c.y)} · ${Math.round(c.r)} m</span><span class="sp"></span>
        <sl-button size="small" data-crd="${esc(c.name)}" data-d="-50">−50</sl-button>
        <sl-button size="small" data-crd="${esc(c.name)}" data-d="50">＋50</sl-button>
        <sl-button size="small" data-cdel="${esc(c.name)}">删</sl-button></div>`).join('')
      || '<div class="li"><span class="co">还没有半径圈</span></div>'}</div>
  </div>`;
}
function toolRay(){
  const S = E.S;
  return `<div class="card"><h3>方位线</h3>
    ${alert('warn','点第一下 = 起点，第二下 = 方向。用于报点：「敌人在这条线上」。')}
    <div class="list">${S.rays.map(ry => `
      <div class="li"><span class="nm" style="color:#4fc2c2">${esc(ry.name)}</span>
        <span class="co">${fx(ry.x)}, ${fx(ry.y)} · ${ry.az.toFixed(0)}°</span><span class="sp"></span>
        <sl-button size="small" data-rdel="${esc(ry.name)}">删</sl-button></div>`).join('')
      || '<div class="li"><span class="co">还没有方位线</span></div>'}</div>
  </div>`;
}
function toolMarker(){
  const S = E.S;
  return `<div class="card"><h3>标记</h3>
    ${alert('warn','在地图上点一下放标记，可拖动、改名、换色。')}
    <div class="list">${S.marks.map(mk => `
      <div class="li"><i style="width:10px;height:10px;border-radius:50%;background:${mk.color};flex:none"></i>
        <sl-input size="small" data-mnm="${mk.id}" value="${esc(mk.name)}" style="flex:1 1 90px;min-width:0"></sl-input>
        <span class="co">${fx(mk.x)}, ${fx(mk.y)}</span><span class="sp"></span>
        ${MARK_COLORS.map(c => `<button data-mcl="${mk.id}" data-c="${c}" type="button" title="换色"
          style="width:16px;height:16px;border-radius:50%;border:1px solid #fff3;background:${c};cursor:pointer;flex:none"></button>`).join('')}
        <sl-button size="small" data-mtg="${mk.id}">设目标</sl-button>
        <sl-button size="small" data-mdel="${mk.id}">删</sl-button></div>`).join('')
      || '<div class="li"><span class="co">还没有自定义标记</span></div>'}</div>
  </div>`;
}
function toolRoute(){
  const S = E.S;
  let total = 0;
  const pts = S.route.pts;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y) * 100;
  return `<div class="card"><h3>路线</h3>
    ${alert('warn','沿途点几下画出行军 / 巡逻路线，自动累加每段距离。')}
    ${pts.length > 1 ? `<div class="readout"><div class="ro big"><div class="k">路线总长（${pts.length-1} 段）</div><div class="v">${fm0(total)}<small>m</small></div></div></div>` : ''}
    <div style="display:flex;gap:8px">
      <sl-button style="flex:1" id="rtUndo" ${pts.length ? '' : 'disabled'}>撤销上一点</sl-button>
      <sl-button style="flex:1" id="rtClear" ${pts.length ? '' : 'disabled'}>清空路线</sl-button>
    </div></div>`;
}
function toolPoly(){
  const S = E.S;
  const draftN = S.polyDraft ? S.polyDraft.pts.length : 0;
  return `<div class="card"><h3>区域</h3>
    ${alert('warn','连点几个点围一片区域，点起点圆圈（或「闭合区域」）收口。默认<b>禁炸区</b>——解算落点在区内会报警。')}
    ${S.polyDraft ? `<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
      <span class="muted">正在画：${draftN} 个点</span><span class="sp" style="flex:1"></span>
      <sl-button size="small" id="pyClose" ${draftN>=3 ? '' : 'disabled'}>闭合区域</sl-button>
      <sl-button size="small" id="pyCancel">放弃</sl-button></div>` : ''}
    <div class="list">${S.polys.map(pg => `
      <div class="li"><span class="nm">${pg.nofire ? '🚫 ' : ''}${esc(pg.name)}</span>
        <span class="co">${pg.pts.length} 个顶点</span><span class="sp"></span>
        <sl-button size="small" data-pnf="${pg.id}">${pg.nofire?'改为普通区':'改为禁炸区'}</sl-button>
        <sl-button size="small" data-pdel="${pg.id}">删</sl-button></div>`).join('')
      || '<div class="li"><span class="co">还没有区域</span></div>'}</div>
  </div>`;
}

/* ---------- 视图：情报 ---------- */
let poiFilter = 'all';
function viewIntel(){
  const S = E.S, m = E.MAP();
  const spawns = poisOf(m, 'spawn'), towers = poisOf(m, 'tower');
  let candsHtml = '<div class="li"><span class="co">先设一个目标，这里列出哪些位置能打到它</span></div>';
  if (S.target){
    const cands = [];
    for (const mk of S.marks) cands.push({ name:mk.name, co:mk, color:mk.color });
    for (const t of towers) cands.push({ name:t.label, co:t });
    for (const sp of spawns) cands.push({ name:sp.label + '（出生点）', co:sp });
    const mid = (MIN_R + MAX_R) / 2;
    cands.forEach(c => { c.d = distM(c.co, S.target); c.ok = c.d >= MIN_R && c.d <= MAX_R; });
    cands.sort((a, b) => (b.ok - a.ok) || (Math.abs(a.d - mid) - Math.abs(b.d - mid)));
    candsHtml = cands.map(c => `
      <div class="li"><span class="nm" ${c.color ? `style="color:${c.color}"` : ''}>${esc(c.name)}</span>
        <span class="co">→ ${fm0(c.d)} m</span><span class="sp"></span>
        ${c.ok ? `<sl-badge variant="success">可架设 · 密位 ${fm0(rangeToMil(c.d))}</sl-badge>`
               : `<sl-badge variant="${c.d < MIN_R ? 'warning' : 'danger'}">${c.d < MIN_R ? '太近' : '超程'}</sl-badge>`}
        <sl-button size="small" data-cd-x="${c.co.x}" data-cd-y="${c.co.y}">设炮位</sl-button></div>`).join('');
  }
  let mtxHtml = '<div class="li"><span class="co">这张图缺出生点或塔楼数据</span></div>';
  if (spawns.length && towers.length){
    let h = '<table class="tbl mtx"><thead><tr><th>出生点 ↓ / 塔楼 →</th>'
      + towers.map(t => `<th>${esc(t.label)}</th>`).join('') + '</tr></thead><tbody>';
    for (const sp of spawns){
      const ds = towers.map(t => distM(sp, t));
      const best = Math.min(...ds);
      h += `<tr><td>${esc(sp.label)}</td>` + towers.map((t, i) =>
        `<td class="${ds[i]===best?'best':''}">${fm0(ds[i])}</td>`).join('') + '</tr>';
    }
    mtxHtml = h + '</tbody></table>';
  }
  const rngList = [];
  for (const t of towers) rngList.push({ name:t.label, co:t, kind:'tower' });
  for (const sp of spawns) rngList.push({ name:sp.label, co:sp, kind:'spawn' });
  for (const mk of S.marks) rngList.push({ name:mk.name, co:mk, kind:'mark', color:mk.color });
  let rangeHtml = '<div class="li"><span class="co">先放一个炮位</span></div>';
  if (S.mortar){
    rngList.forEach(it => { it.d = distM(S.mortar, it.co); it.mil = Math.round(rangeToMil(it.d)); });
    rngList.sort((a, b) => a.d - b.d);
    rangeHtml = rngList.map(it => {
      const ok = it.d >= MIN_R && it.d <= MAX_R;
      return `<div class="li"><span class="nm" ${it.color ? `style="color:${it.color}"` : ''}>${esc(it.name)}</span>
        <span class="co">${fm0(it.d)} m</span><span class="sp"></span>
        ${ok ? `<sl-badge variant="success">密位 ${fm0(it.mil)}</sl-badge>` : `<sl-badge variant="neutral">${it.d < MIN_R ? '太近' : '超程'}</sl-badge>`}</div>`;
    }).join('');
  }
  const poiList = poisOf(m, poiFilter).map(p => `
    <div class="li"><span class="nm" style="color:${p.icon==='tower' ? '#e05d5d' : 'inherit'}">${esc(p.label)}</span>
      <span class="co">${fx(p.x)}, ${fx(p.y)}</span><span class="sp"></span>
      <sl-button size="small" data-loc-x="${p.x}" data-loc-y="${p.y}">定位</sl-button>
      <sl-button size="small" data-tgt-x="${p.x}" data-tgt-y="${p.y}">设目标</sl-button></div>`).join('');
  return `
  <div class="card"><h3>炮位推荐 —— 谁能打到当前目标</h3>
    <p class="muted" style="margin:0 0 8px">L81 有效射程 <b>132–684 m</b>，按接近中程排序。</p>
    <div class="list" style="max-height:250px;overflow-y:auto">${candsHtml}</div></div>
  <div class="card"><h3>出生点决策 —— 到各塔楼距离</h3>
    <div class="tblwrap" style="max-height:220px">${mtxHtml}</div></div>
  <div class="card"><h3>打击范围分析（以当前炮位为圆心）</h3>
    <div class="list" style="max-height:260px;overflow-y:auto">${rangeHtml}</div></div>
  <div class="card"><h3>地标速查</h3>
    <div class="seg" style="margin-bottom:9px">${[['all','全部'],['tower','塔楼'],['spawn','出生点'],['vendor','商人']]
      .map(([k, lb]) => `<button data-pf="${k}" class="${poiFilter===k?'on':''}" type="button">${lb}</button>`).join('')}</div>
    <div class="list" style="max-height:300px;overflow-y:auto">${poiList}</div></div>`;
}

/* ---------- 视图：建造 ---------- */
function viewBuild(){
  const S = E.S, t = E.calcTotals();
  const qty = k => S.calcQty[k] || 0;
  return `
  <div class="card"><h3>材料计算器</h3>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      <sl-button size="small" data-bp="aa">便携防空塔</sl-button>
      <sl-button size="small" data-bp="mortarpit">迫击炮阵地</sl-button>
      <sl-button size="small" data-bp="drill">钻井拉HotZone</sl-button>
      <sl-button size="small" data-bp="field">野战工事(免FOB)</sl-button>
      <sl-button size="small" id="btnCalcClr">清零</sl-button>
    </div>
    <div class="readout">
      <div class="ro big"><div class="k">建材合计</div><div class="v">${fm0(t.units)}<small>单位</small></div></div>
      <div class="ro"><div class="k">托盘数（1800/托）</div><div class="v">${t.units ? Math.ceil(t.units / PALLET) : 0}</div></div>
      <div class="ro"><div class="k">估算花费</div><div class="v">$${fm0(t.price)}</div></div>
      <div class="ro"><div class="k">总重量（约）</div><div class="v">${t.kg < 1 ? t.kg.toFixed(2) : fm0(t.kg)}<small>kg</small></div></div>
    </div>
    <div class="tblwrap" style="max-height:300px"><table class="tbl"><thead><tr>
      <th>建筑</th><th>建材</th><th>锤子</th><th>数量</th></tr></thead><tbody>
      ${BUILD_CATALOG.map(e => `<tr>
        <td>${esc(e.n)}${e.note ? `<div style="font-size:10.5px;color:var(--ink-3);font-family:inherit">${esc(e.note)}</div>` : ''}</td>
        <td>${e.s || '—'}</td><td>${e.tier}</td>
        <td style="white-space:nowrap">
          <button class="qbtn" data-qd="${e.k}" type="button">−</button>
          <b style="display:inline-block;min-width:26px;text-align:center;font-family:var(--mono)">${qty(e.k)}</b>
          <button class="qbtn" data-qu="${e.k}" type="button">＋</button></td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted" style="margin:8px 0 0">建材 $10/单位，托盘 1800 单位/托（需 Z20 或运输卡车）。Medium 锤需支援 3 级 + $25,000，Large 锤需支援 8 级 + $75,000。迫击炮位：沙袋贴身、HESCO 隔一格留射弧。</p>
  </div>
  <div class="card"><h3>地图规划器</h3>
    <div style="display:flex;gap:8px;align-items:center">
      <sl-select id="buildSel" size="small" hoist style="flex:1">
        ${BUILD_CATALOG.map(e => `<sl-option value="${e.k}">${e.n}（${e.s} 建材${e.tier !== '—' ? ' · ' + e.tier + ' 锤' : ''}）</sl-option>`).join('')}
      </sl-select>
      <sl-button variant="primary" id="btnBuildArm">${S.buildArm ? '点地图放置…' : '⬇ 放到地图上'}</sl-button>
    </div>
    <p class="muted" style="margin:8px 0 0">FOB 半径 60 m（蓝色圈）。需要 FOB 的建筑放在圈外会标红。</p>
    <div class="list" style="max-height:200px;overflow-y:auto">${S.builds.map(b => {
      const e = E.buildEntry(b.k);
      const bad = b.k !== 'fob' && !e.cat.includes('免') && E.nearestFobDist(b) > FOB_RADIUS;
      return `<div class="li"><span class="nm" style="color:${b.k==='fob' ? '#5b9dd9' : bad ? '#e05d5d' : '#4caf7d'}">${esc(b.name)}</span>
        <span class="co">${fx(b.x)}, ${fx(b.y)}${bad ? ' · ⚠圈外' : ''}</span><span class="sp"></span>
        <sl-button size="small" data-bloc="${b.id}">定位</sl-button>
        <sl-button size="small" data-bdel="${b.id}">删</sl-button></div>`;
    }).join('') || '<div class="li"><span class="co">还没有规划点</span></div>'}</div>
  </div>`;
}

/* ---------- 视图：射表 ---------- */
let tblQ = '';
function viewTable(){
  const q = parseNum(tblQ);
  let bestI = -1, bestErr = 1e9;
  if (q != null) TBL.forEach(([r, mil], i) => {
    const e = Math.min(Math.abs(r - q), Math.abs(mil - q));
    if (e < bestErr){ bestErr = e; bestI = i; }
  });
  return `
  <div class="card"><h3>L81 完整射表（社区测量 · 84 档）</h3>
    <sl-input id="tblQ" size="small" placeholder="输入距离(m)或密位反查，如 300 或 690" value="${esc(tblQ)}" class="paste" style="margin:0 0 10px"></sl-input>
    <div class="tblwrap" style="max-height:calc(100vh - 230px)"><table class="tbl"><thead><tr>
      <th>距离 m</th><th>密位 MIL</th><th>档间变化</th></tr></thead><tbody>
      ${TBL.map(([r, mil], i) => `<tr class="${i===bestI?'cur':''}">
        <td>${r}</td><td>${mil}</td>
        <td>${i ? (mil - TBL[i-1][1] >= 0 ? '+' : '') + (mil - TBL[i-1][1]) : '—'}</td></tr>`).join('')}
    </tbody></table></div>
  </div>`;
}

/* ---------- 视图：数据 ---------- */
function viewSettings(){
  const S = E.S;
  return `
  <div class="card"><h3>外观</h3>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <sl-switch id="swTheme" ${S.theme === 'dark' ? 'checked' : ''}>夜间模式</sl-switch>
      <sl-switch id="swMarks" ${S.showMarks ? 'checked' : ''}>自定义标记</sl-switch>
    </div>
  </div>
  <div class="card"><h3>数据备份</h3>
    <p class="muted" style="margin:0 0 9px">标记、圈、线、路线、区域、建造规划都保存在本机。换电脑或清缓存前先导出。</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:9px">
      <sl-button variant="primary" id="btnExport">导出 JSON</sl-button>
      <sl-button id="btnImport">导入 JSON</sl-button>
      <sl-button variant="danger" id="btnWipe">清空全部数据</sl-button>
    </div>
    <sl-textarea id="ioBox" resize="auto" size="small" placeholder="导出内容出现在这里；导入时粘贴 JSON 再点「导入 JSON」"></sl-textarea>
  </div>
  <div class="card"><h3>战斗记录</h3>
    <div class="list" style="max-height:250px;overflow-y:auto">${S.hist.map(h => `
      <div class="li"><span class="co">${new Date(h.t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</span>
        <span class="nm" style="flex:1;font-weight:400">${esc(h.map)} · ${esc(h.txt)}</span></div>`).join('')
      || '<div class="li"><span class="co">还没有记录。点「计算射击诸元」等按钮会自动记一笔。</span></div>'}</div>
    <sl-button id="btnHistClr" style="width:100%;margin-top:9px">清空战斗记录</sl-button>
  </div>`;
}

/* ---------- 面板事件绑定 ---------- */
function bindPanel(){
  const S = E.S;
  const panel = $('panel');
  panel.querySelectorAll('.seg [data-put]').forEach(b => b.addEventListener('click', () => {
    S.put = b.dataset.put; scheduleRender();
  }));
  panel.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copy(b.dataset.copy)));
  /* 坐标输入（成对解析） */
  [
    ['mx','my', v => S.mortar = v], ['tx','ty', v => S.target = v],
    ['cmx','cmy', v => S.mortar = v], ['ctx','cty', v => S.target = v],
    ['cix','ciy', v => S.impact = v], ['pmx','pmy', v => S.mortar = v],
  ].forEach(([ix, iy, assign]) => bindCoordPair(ix, iy, assign));
  /* 推落点输入 */
  [['paz','predAz'],['pmil','predMil'],['prng','predRng']].forEach(([id, key]) => {
    const el = $(id); if (!el) return;
    el.addEventListener('sl-input', () => { S[key] = el.value; E.compute(); E.draw(); E.save(); scheduleRender(); });
  });
  const pIns = $('pIns');
  if (pIns) pIns.addEventListener('sl-input', () => {
    const v = parsePair(pIns.value); if (!v) return;
    if (S.put === 'target') S.target = v; else S.mortar = v;
    E.compute(); E.draw(); E.save(); scheduleRender();
  });
  const btnSolve = $('btnSolve');
  if (btnSolve) btnSolve.addEventListener('click', () => {
    E.compute();
    if (S.mortar && S.target){
      const {dist, az} = solveVector(S.target.x-S.mortar.x, S.target.y-S.mortar.y);
      E.logShot(`算诸元 → 方位 ${faz(az)} 距离 ${fm0(dist)} 密位 ${fm0(rangeToMil(dist))}`);
    }
    E.draw(); E.save(); scheduleRender();
  });
  const btnPredict = $('btnPredict');
  if (btnPredict) btnPredict.addEventListener('click', () => {
    E.compute();
    if (S.predPoint) E.logShot(`推落点 → ${fx(S.predPoint.x)}, ${fx(S.predPoint.y)}`);
    E.draw(); E.save(); scheduleRender();
  });
  const btnCorrect = $('btnCorrect');
  if (btnCorrect) btnCorrect.addEventListener('click', () => {
    E.compute();
    if (S.mortar && S.impact && S.target)
      E.logShot(`修偏差 → 密位 ${fm0(rangeToMil(solveVector(S.target.x-S.mortar.x, S.target.y-S.mortar.y).dist))}`);
    E.draw(); E.save(); scheduleRender();
  });
  /* 工具 */
  panel.querySelectorAll('.toolgrid [data-tool]').forEach(b => b.addEventListener('click', () => {
    S.tool = b.dataset.tool; S.pend = null; E.draw(); E.save(); scheduleRender();
  }));
  const tlClear = $('tlClear');
  if (tlClear) tlClear.addEventListener('click', () => { S.ruler = {a:null,b:null}; E.draw(); E.save(); scheduleRender(); });
  panel.querySelectorAll('[data-pr]').forEach(b => b.addEventListener('click', () => {
    S.circles.push({ x:S.mortar ? S.mortar.x : S.view.cx, y:S.mortar ? S.mortar.y : S.view.cy,
      r:+b.dataset.pr, name:'圈'+(S.seq++) });
    E.draw(); E.save(); scheduleRender();
  }));
  panel.querySelectorAll('[data-cdel]').forEach(b => b.addEventListener('click', () => {
    S.circles = S.circles.filter(c => c.name !== b.dataset.cdel); E.draw(); E.save(); scheduleRender();
  }));
  panel.querySelectorAll('[data-crd]').forEach(b => b.addEventListener('click', () => {
    const c = S.circles.find(c => c.name === b.dataset.crd);
    if (c){ c.r = Math.max(20, c.r + +b.dataset.d); E.draw(); E.save(); scheduleRender(); }
  }));
  panel.querySelectorAll('[data-rdel]').forEach(b => b.addEventListener('click', () => {
    S.rays = S.rays.filter(r => r.name !== b.dataset.rdel); E.draw(); E.save(); scheduleRender();
  }));
  panel.querySelectorAll('[data-mnm]').forEach(inp => inp.addEventListener('sl-change', () => {
    const mk = S.marks.find(m => m.id === +inp.dataset.mnm);
    if (mk){ mk.name = inp.value.trim() || mk.name; E.draw(); E.save(); scheduleRender(); }
  }));
  panel.querySelectorAll('[data-mcl]').forEach(b => b.addEventListener('click', () => {
    const mk = S.marks.find(m => m.id === +b.dataset.mcl);
    if (mk){ mk.color = b.dataset.c; E.draw(); E.save(); scheduleRender(); }
  }));
  panel.querySelectorAll('[data-mdel]').forEach(b => b.addEventListener('click', () => {
    S.marks = S.marks.filter(m => m.id !== +b.dataset.mdel); E.draw(); E.save(); scheduleRender();
  }));
  panel.querySelectorAll('[data-mtg]').forEach(b => b.addEventListener('click', () => {
    const mk = S.marks.find(m => m.id === +b.dataset.mtg);
    if (mk){ S.target = { x:mk.x, y:mk.y }; E.setMode('solve'); E.compute(); E.draw(); E.save(); scheduleRender(); }
  }));
  const rtUndo = $('rtUndo');
  if (rtUndo) rtUndo.addEventListener('click', () => { S.route.pts.pop(); E.draw(); E.save(); scheduleRender(); });
  const rtClear = $('rtClear');
  if (rtClear) rtClear.addEventListener('click', () => { S.route.pts = []; E.draw(); E.save(); scheduleRender(); });
  const pyClose = $('pyClose');
  if (pyClose) pyClose.addEventListener('click', () => { E.closePoly(); E.draw(); E.save(); scheduleRender(); });
  const pyCancel = $('pyCancel');
  if (pyCancel) pyCancel.addEventListener('click', () => { S.polyDraft = null; E.draw(); E.save(); scheduleRender(); });
  panel.querySelectorAll('[data-pnf]').forEach(b => b.addEventListener('click', () => {
    const pg = S.polys.find(p => p.id === +b.dataset.pnf);
    if (pg){ pg.nofire = !pg.nofire;
      pg.color = pg.nofire ? 'rgba(163,50,44,.55)' : 'rgba(122,63,157,.55)';
      E.draw(); E.save(); scheduleRender(); }
  }));
  panel.querySelectorAll('[data-pdel]').forEach(b => b.addEventListener('click', () => {
    S.polys = S.polys.filter(p => p.id !== +b.dataset.pdel); E.draw(); E.save(); scheduleRender();
  }));
  /* 情报 */
  panel.querySelectorAll('[data-pf]').forEach(b => b.addEventListener('click', () => {
    poiFilter = b.dataset.pf; scheduleRender();
  }));
  panel.querySelectorAll('[data-cd-x]').forEach(b => b.addEventListener('click', () => {
    S.mortar = { x:+b.dataset.cdX, y:+b.dataset.cdY };
    E.setMode('solve'); E.compute(); E.draw(); E.save(); scheduleRender();
  }));
  panel.querySelectorAll('[data-loc-x]').forEach(b => b.addEventListener('click', () => {
    S.view.cx = +b.dataset.locX; S.view.cy = +b.dataset.locY; S.view.scale = Math.max(S.view.scale, 25);
    E.draw();
  }));
  panel.querySelectorAll('[data-tgt-x]').forEach(b => b.addEventListener('click', () => {
    S.target = { x:+b.dataset.tgtX, y:+b.dataset.tgtY };
    E.compute(); E.draw(); E.save(); scheduleRender();
  }));
  /* 建造 */
  panel.querySelectorAll('[data-bp]').forEach(b => b.addEventListener('click', () => {
    S.calcQty = { ...(BUILD_PRESETS[b.dataset.bp]) }; E.save(); scheduleRender();
    toast('模板已载入，可继续微调数量');
  }));
  const btnCalcClr = $('btnCalcClr');
  if (btnCalcClr) btnCalcClr.addEventListener('click', () => { S.calcQty = {}; E.save(); scheduleRender(); });
  panel.querySelectorAll('[data-qu]').forEach(b => b.addEventListener('click', () => {
    S.calcQty[b.dataset.qu] = (S.calcQty[b.dataset.qu] || 0) + 1; E.save(); scheduleRender();
  }));
  panel.querySelectorAll('[data-qd]').forEach(b => b.addEventListener('click', () => {
    S.calcQty[b.dataset.qd] = Math.max(0, (S.calcQty[b.dataset.qd] || 0) - 1); E.save(); scheduleRender();
  }));
  const buildSel = $('buildSel');
  if (buildSel) buildSel.value = S.buildArm || buildSel.value || 'fob';
  const btnBuildArm = $('btnBuildArm');
  if (btnBuildArm) btnBuildArm.addEventListener('click', () => {
    S.buildArm = S.buildArm ? null : (buildSel ? buildSel.value : 'fob');
    E.draw(); E.save(); scheduleRender();
  });
  panel.querySelectorAll('[data-bloc]').forEach(b => b.addEventListener('click', () => {
    const it = S.builds.find(x => x.id === +b.dataset.bloc);
    if (it){ S.view.cx = it.x; S.view.cy = it.y; S.view.scale = Math.max(S.view.scale, 25); E.draw(); }
  }));
  panel.querySelectorAll('[data-bdel]').forEach(b => b.addEventListener('click', () => {
    S.builds = S.builds.filter(x => x.id !== +b.dataset.bdel); E.draw(); E.save(); scheduleRender();
  }));
  /* 射表 */
  const tblQEl = $('tblQ');
  if (tblQEl) tblQEl.addEventListener('sl-input', () => { tblQ = tblQEl.value; scheduleRender(); });
  /* 数据 */
  const swTheme = $('swTheme');
  if (swTheme) swTheme.addEventListener('sl-change', () => {
    S.theme = swTheme.checked ? 'dark' : 'light'; E.save(); scheduleRender();
  });
  const swMarks = $('swMarks');
  if (swMarks) swMarks.addEventListener('click', () => { S.showMarks = !S.showMarks; E.save(); scheduleRender(); });
  const btnExport = $('btnExport');
  if (btnExport) btnExport.addEventListener('click', () => {
    $('ioBox').value = E.exportJSON(); toast('已生成，可全选复制保存');
  });
  const btnImport = $('btnImport');
  if (btnImport) btnImport.addEventListener('click', () => {
    try { E.importJSON($('ioBox').value); toast('导入成功'); }
    catch { toast('JSON 解析失败'); }
  });
  const btnWipe = $('btnWipe');
  if (btnWipe) btnWipe.addEventListener('click', () => {
    if (!confirm('确定清空全部本地数据（标记、圈、线、路线、区域、记录）？此操作不可恢复。')) return;
    E.wipe(); scheduleRender(); toast('已清空');
  });
  const btnHistClr = $('btnHistClr');
  if (btnHistClr) btnHistClr.addEventListener('click', () => { S.hist = []; E.save(); scheduleRender(); });
}

/* ---------- 悬浮窗 HUD ---------- */
function renderHud(){
  const S = E.S;
  const r = S.results.solve;
  $('hudAz').textContent = r && !r.err ? faz(r.az) : '—';
  $('hudDist').textContent = r && !r.err ? fm0(r.dist) + 'm' : '—';
  $('hudMil').textContent = r && !r.err ? fm0(r.milR) : '—';
  $('hudPut').textContent = S.put === 'target' ? '放目标' : '放炮位';
}
if (isOverlay){
  $('hudPut').addEventListener('click', () => {
    E.S.put = E.S.put === 'target' ? 'mortar' : 'target'; scheduleRender();
  });
  $('hudCopy').addEventListener('click', () => {
    const r = E.S.results.solve;
    if (r && !r.err) copy(r.cmd); else toast('先放炮位和目标');
  });
}

/* ---------- 启动 ---------- */
window.__E = E;   // 调试 / 无头测试钩子
render();
