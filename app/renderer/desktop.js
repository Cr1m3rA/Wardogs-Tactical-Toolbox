/* =====================================================================
 * Tauri 桌面版桥接层
 * ---------------------------------------------------------------------
 * 网页版里 IS_TAURI 为 false，本模块所有函数退化为空操作，engine/app 两边
 * 共用同一份代码，不必到处写 if。
 *
 * 瓦片走 http://tile.localhost/{map}/zoom_{z}/{x}_{y}.webp —— Windows 上
 * WebView2 会把自定义协议映射成 http://<scheme>.localhost，Rust 侧的代理
 * 负责「磁盘缓存 → CDN」的兜底，所以渲染层只当它是个普通图床。
 * ===================================================================== */

/* __TAURI_INTERNALS__ 是 Tauri 必定注入的底层对象；带友好封装（core/event）的
   __TAURI__ 取决于 withGlobalTauri 配置。两个都认，配置改动不会让桌面能力静默消失。 */
const HAS_TAURI = typeof window !== 'undefined' && !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
export const IS_TAURI = HAS_TAURI;
export const TILE_HOST = 'http://tile.localhost';

const core = () => (window.__TAURI__ && window.__TAURI__.core)
  || { invoke: (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args) };

/* 事件订阅：优先用 __TAURI__.event，没有就按 Tauri 自己的实现走 internals。
   下载进度、任务结束判定全靠它，不能因为少注入一个全局对象就整块失灵。 */
async function listen(name, cb){
  if (window.__TAURI__ && window.__TAURI__.event) return window.__TAURI__.event.listen(name, cb);
  const I = window.__TAURI_INTERNALS__;
  if (!I) return () => {};
  const handler = I.transformCallback((e) => cb(e));
  const id = await I.invoke('plugin:event|listen', { event: name, target: { kind: 'Any' }, handler });
  return () => I.invoke('plugin:event|unlisten', { event: name, eventId: id });
}

/* ---------- 两档精度预设：体积是实测值，下载前必须原样告诉用户 ---------- */
export const PRESETS = {
  std: { key:'std', label:'默认精度 (z0–z5)', minZ:0, maxZ:5,
         note:'1 像素 ≈ 1.35 m · 日常够用',
         mb:{ bakurani:44, ozeti:49, zestafona:42 } },
  hi:  { key:'hi',  label:'高精度 (z0–z7)',   minZ:0, maxZ:7,
         note:'1 像素 ≈ 0.34 m · 看得清建筑轮廓',
         mb:{ bakurani:637, ozeti:619, zestafona:536 } },
};

export function fmtBytes(n){
  if (!n) return '0 B';
  const u = ['B','KB','MB','GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1){ v /= 1024; i++; }
  return (i === 0 ? v : v.toFixed(v < 10 ? 1 : 0)) + ' ' + u[i];
}
function fmtMB(mb){
  return mb >= 1024 ? (mb/1024).toFixed(2) + ' GB' : Math.round(mb) + ' MB';
}
export function presetSizeText(p, mapId){
  const mb = p.mb[mapId];
  const all = Object.values(p.mb).reduce((a,b) => a+b, 0);
  return mapId ? fmtMB(mb) : fmtMB(all);
}

/* ---------- IPC ---------- */
export const getSettings  = () => IS_TAURI ? core().invoke('get_settings') : Promise.resolve(null);
export const tileStats    = () => IS_TAURI ? core().invoke('tile_stats')   : Promise.resolve([]);
export const setTileDir   = (p) => core().invoke('set_tile_dir', { path: p });
export const openDir      = (p) => core().invoke('open_dir', { path: p });
export const dlStart      = (map, minZoom, maxZoom) =>
  core().invoke('download_start', { map, minZoom, maxZoom });
export const dlPause      = (id) => core().invoke('download_pause',  { id });
export const dlResume     = (id) => core().invoke('download_resume', { id });
export const dlCancel     = (id) => core().invoke('download_cancel', { id });

/* ---------- 状态缓存：面板重渲染时先拿缓存顶一下，避免闪 ---------- */
let MD = null;                      // { tileDir, stats: [...] }
let JOB = null;                     // 当前下载任务
let cancelledId = null;             // 已点取消、等 Rust 确认的任务 id

export function peekMapData(){ return MD; }

export async function refreshMapData(){
  if (!IS_TAURI) return null;
  const [cfg, stats] = await Promise.all([getSettings(), tileStats()]);
  MD = Object.assign({}, cfg, { stats });
  return MD;
}

/* 订阅下载进度；返回解除订阅的函数 */
export function onProgress(cb){
  if (!IS_TAURI) return () => {};
  let un = null;
  listen('dl-progress', (e) => {
    const p = e.payload;
    /* 已经点过取消、但 Rust 还没确认的任务，这期间送来的帧都是它取消前发出的
       （读取取消标志和 emit 在同一轮循环里，中间隔着几十毫秒）。照单全收的话，
       进度条会在用户点完取消之后【闪回来】一次，要再等一帧才真消失——
       看着就是「卡住一会才消失」。这类旧帧直接丢掉，界面上那条已经撤了。 */
    if (p.id === cancelledId && !p.cancelled) return;
    if (p.finished || p.cancelled) cancelledId = null;
    /* 收尾的（下完 / 被取消）不进缓存：进度条该立刻消失，
       而不是变成一条「任务已结束」继续挂在界面上等人点。
       原来不区分，用户点取消后能明显看到进度条僵在那儿。 */
    JOB = (p.finished || p.cancelled) ? null : p;
    cb(p);
  }).then(u => { un = u; });
  return () => { if (un) un(); };
}

/* 渲染层启动自检：往 Rust 诊断日志里写一行，出问题时能一眼区分
   「前端没认出桌面版」和「tile:// 协议没打通」。 */
export function probe(){
  if (!IS_TAURI) return;
  try { core().invoke('js_probe'); } catch (_) {}
}

export function currentJob(){ return JOB; }

/* ---------- 界面片段 ---------- */
const MAP_NAMES = { bakurani:'Bakurani', ozeti:'Ozeti', zestafona:'Zestafona' };

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

function bar(have, total, cls){
  const pct = total ? Math.min(100, have / total * 100) : 0;
  return `<div class="md-bar"><i class="${cls||''}" style="width:${pct.toFixed(1)}%"></i></div>`;
}

function mapRow(st, preset){
  const name = MAP_NAMES[st.id] || st.id;
  const z = preset.maxZ;
  const want = st.zooms.filter(x => x.z <= z);
  const have = want.reduce((a,b) => a + b.have, 0);
  const total = want.reduce((a,b) => a + b.total, 0);
  const full = have >= total;
  return `
    <div class="md-row">
      <div class="md-r1">
        <b>${name}</b>
        <span class="muted">${have.toLocaleString()} / ${total.toLocaleString()} 张 ·
          ${fmtBytes(st.bytes)}</span>
        <span class="spacer"></span>
        ${full ? '<span class="md-ok">已完整</span>' : ''}
      </div>
      ${bar(have, total)}
      <div class="md-z">${want.map(x =>
        `<span class="md-zz ${x.have >= x.total ? 'on' : ''}" title="z${x.z}">z${x.z}<i>${x.have}</i></span>`).join('')}</div>
    </div>`;
}

/* 只有「还在跑」的任务才画进度条。收尾的一律不画——
   下完之后界面上不该再留一条 100% 的条等人点，取消之后也不该留个「已结束」。 */
function jobBlock(j){
  if (!j || j.finished || j.cancelled) return '';
  const left = j.rate > 0 ? Math.max(0, (j.total - j.done) / j.rate) : null;
  const eta = left == null ? '' :
    left > 90 ? `${Math.round(left/60)} 分 ${Math.round(left%60)} 秒`
              : `${Math.ceil(left)} 秒`;
  return `
  <div class="md-job">
    <div class="md-r1"><b>${MAP_NAMES[j.map] || j.map}</b>
      <span class="muted">${j.paused ? '已暂停' : '下载中'} · ${j.done.toLocaleString()} / ${j.total.toLocaleString()} 张
        · ${fmtBytes(j.bytes)}${j.failed ? ` · ${j.failed} 张失败` : ''}
        ${eta ? ` · 约剩 ${eta}` : ''}</span></div>
    ${bar(j.done, j.total, 'live')}
    <div style="display:flex;gap:8px;margin-top:8px">
      <sl-button size="small" id="mdPause">${j.paused ? '继续' : '暂停'}</sl-button>
      <sl-button size="small" variant="danger" id="mdCancel">取消</sl-button>
    </div>
  </div>`;
}

export function mapDataCard(){
  if (!IS_TAURI) return '';
  const md = MD;
  const job = currentJob();
  const preset = PRESETS.std;

  let body;
  if (!md){
    body = '<div class="muted">正在读取磁盘…</div>';
  } else {
    const totalHave = md.stats.reduce((a,s) => a + s.have, 0);
    const totalBytes = md.stats.reduce((a,s) => a + s.bytes, 0);
    body = `
      <div class="md-dir">
        <code>${esc(md.tileDir)}</code>
        <sl-button size="small" id="mdOpen">打开目录</sl-button>
      </div>
      <p class="muted" style="margin:0 0 10px">
        已下载 <b>${totalHave.toLocaleString()}</b> 张，占用 <b>${fmtBytes(totalBytes)}</b>。
        没下载到的区域会自动走在线底图并顺手存下来，所以你也可以什么都不下，直接开用。
      </p>
      ${md.stats.map(s => mapRow(s, preset)).join('')}
      <div class="md-acts">
        <sl-button size="small" variant="primary" id="mdStd">
          下载默认精度 z0–z5（三图共约 ${presetSizeText(PRESETS.std)}）</sl-button>
        <sl-button size="small" id="mdHi">
          下载高精度 z0–z7（三图共约 ${presetSizeText(PRESETS.hi)}）</sl-button>
      </div>
      <p class="muted" style="margin:8px 0 0">
        高精度体积很大（约 ${presetSizeText(PRESETS.hi)}），建议只在需要看清建筑时再下。
        下载支持暂停 / 继续 / 取消，已下好的部分不会重下。
      </p>
      ${jobBlock(job)}`;
  }
  return `<div class="card"><h3>地图数据</h3>${body}</div>`;
}

/* ---------- 事件绑定 ---------- */
export function bindMapData(panel, rerender){
  if (!IS_TAURI) return;
  const mdBody = panel.querySelector('#mdOpen');
  if (mdBody) mdBody.addEventListener('click', () => { if (MD) openDir(MD.tileDir); });

  const start = (preset) => {
    /* JOB 里只可能存着「还在跑」的任务（收尾的在 onProgress 里就被清掉了），
       所以它非空就等于有任务在跑，按钮直接忽略。 */
    if (JOB || running) return;
    runQueue(preset, rerender);
  };
  const s = panel.querySelector('#mdStd');
  const h = panel.querySelector('#mdHi');
  if (s) s.addEventListener('click', () => start(PRESETS.std));
  if (h) h.addEventListener('click', () => start(PRESETS.hi));

  const p = panel.querySelector('#mdPause');
  if (p && JOB) p.addEventListener('click', () => (JOB.paused ? dlResume(JOB.id) : dlPause(JOB.id)));
  const c = panel.querySelector('#mdCancel');
  if (c && JOB) c.addEventListener('click', () => {
    const id = JOB.id;
    /* 界面先动：等 Rust 回话还有几十毫秒，但按钮按下去必须立刻有反应。 */
    cancelledId = id;                   // 认领这个任务，挡掉它取消前的旧帧
    JOB = null;
    if (rerender) rerender();
    dlCancel(id);
  });
}

/* 串行下载三张图：并发跑三个任务只会让每条进度都变得很难看，
   而且带宽是同一个瓶颈，串行总耗时几乎一样。 */
let running = false;
async function runQueue(preset, rerender){
  if (running) return;
  running = true;
  try {
    for (const id of ['bakurani', 'ozeti', 'zestafona']){
      const jobId = await dlStart(id, preset.minZ, preset.maxZ);
      const last = await waitJob(jobId);
      /* 用户取消了这一张，后面两张就不要再起了。
         原来这里无条件接着循环——点了取消，界面上的进度条反而重新开始，
         变成「在下一张图上继续下」，怎么点都停不下来。 */
      if (last && last.cancelled) break;
    }
  } finally {
    running = false;
    JOB = null;
    await refreshMapData();
    if (rerender) rerender();
  }
}

/* 等到这个任务收尾。把最后的 payload 交回去，调用方要据此区分
   「下完了」和「被取消了」——两者的后续动作不一样。 */
function waitJob(id){
  return new Promise(resolve => {
    let un = null;
    listen('dl-progress', (e) => {
      if (e.payload.id !== id) return;
      if (e.payload.finished || e.payload.done >= e.payload.total){
        if (un) un();
        resolve(e.payload);
      }
    }).then(u => { un = u; });
  });
}
