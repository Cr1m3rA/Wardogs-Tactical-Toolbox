/* ============================================================
 * WARDOGS 战术工具箱 — 桌面版渲染引擎
 * 从 mortar-map.html 移植：数学 / 射表 / 瓦片 / 画布 / 状态。
 * 与 DOM 解耦：结果产出结构化对象，视图层负责渲染。
 * ============================================================ */
import MAPS from './mapdata.js';
import { icon, iconImage } from './icons.js';
import { WEAPONS, DEFAULT_WEAPON, weaponById, arcsFor, rangeToMil, milToRange } from './weapons.js';
import { IS_TAURI, TILE_HOST } from './desktop.js';

/* ---------- 射表与数学 ----------
 * 射表数据在 weapons.js（由 scripts/make_weapons.js 从社区测量数据生成），
 * 网页版 mortar-map.html 内联的是同一份，改数据只改生成器，不要手改两边。
 */
export { WEAPONS, DEFAULT_WEAPON, weaponById, arcsFor, rangeToMil, milToRange };
export const MOA50 = Math.tan(50/60 * Math.PI/180);

/* 当前武器的默认弹道弧：优先低弹道（平射更准、飞行时间更短）。 */
export function defaultArc(w){ return w.arcs[0]; }
export function arcOf(w, key){ return w.arcs.find(a => a.key === key) || defaultArc(w); }

/* 一个距离上所有可用的弹道弧及各自的密位。
   自行火炮在 780–1181 m 只有高弹道，1181 m 以上低/高两条都有——
   所以结果是个数组，不是单个密位值。 */
export function arcSolutions(w, dist){
  return arcsFor(w, dist).map(a => ({
    key: a.key, label: a.label, tbl: a.tbl,
    mil: rangeToMil(dist, a.tbl),
  }));
}
export function solveVector(dx, dy){
  const dist = 100 * Math.hypot(dx, dy);
  let az = Math.atan2(dx, dy) * 180/Math.PI;
  return { dist, az: (az + 360) % 360 };
}
export function unitToXY(mx, my, azDeg, distM){
  const r = distM/100, a = azDeg*Math.PI/180;
  return { x: mx + r*Math.sin(a), y: my + r*Math.cos(a) };
}
export const fx  = v => (v==null || Number.isNaN(v)) ? '—' : v.toFixed(2);
export const fm0 = v => (v==null || Number.isNaN(v)) ? '—' : Math.round(v).toString();
export const faz = v => (v==null || Number.isNaN(v)) ? '—' : String(Math.round(v)%360).padStart(3,'0') + '°';
export function parseNum(s){
  const m = String(s==null?'':s).replace(/[，、]/g,',').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const v = parseFloat(m[0]); return Number.isFinite(v) ? v : null;
}
export function parsePair(s){
  if (!s) return null;
  const nums = String(s).replace(/[，、xXyY:：=]/g,' ').match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  return { x: parseFloat(nums[0]), y: parseFloat(nums[1]) };
}
export const distM = (a,b) => Math.round(Math.hypot(a.x-b.x, a.y-b.y)*100);
export const SPAWN_ICONS = ['valkyra','manticore','lonestar'];
export const poisOf = (m, kind) => m.markers.filter(k =>
  kind==='tower'  ? k.icon==='tower' :
  kind==='spawn'  ? SPAWN_ICONS.includes(k.icon) :
  kind==='vendor' ? !SPAWN_ICONS.includes(k.icon) && k.icon!=='tower' : true);
export function ptInPoly(p, pts){
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++){
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if (((yi > p.y) !== (yj > p.y)) &&
        (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/* ---------- 建造目录（社区数据） ---------- */
export const BUILD_CATALOG = [
  {k:'fob',    n:'前哨基地 FOB',   s:30,   tier:'—', cat:'核心', price:7500, note:'$7,500 / 60m 建造半径 / 团队仓库'},
  {k:'tent',   n:'侦察帐篷',       s:5,    tier:'S', cat:'免FOB', note:'隐藏侦察兵红外特征'},
  {k:'wire',   n:'铁丝网',         s:5,    tier:'S', cat:'免FOB', note:'迟滞步兵，拆敌方的赔 $75'},
  {k:'sandbag',n:'沙袋',           s:10,   tier:'S', cat:'免FOB', note:'腰部射击掩体'},
  {k:'hedge',  n:'刺猬障碍',       s:14,   tier:'S', cat:'免FOB', note:'阻挡车辆'},
  {k:'hs_s',   n:'HESCO 墩（小）', s:10,   tier:'M', cat:'工事', note:'可叠 6 层'},
  {k:'bremer', n:'布雷默墙',       s:10,   tier:'M', cat:'工事', note:'窄高墙，自带顶部铁丝'},
  {k:'radio',  n:'建造者电台',     s:13,   tier:'M', cat:'功能', note:'放音乐'},
  {k:'door',   n:'门',             s:14,   tier:'M', cat:'工事', note:'仅己方步兵通行'},
  {k:'hs_l',   n:'HESCO 墩（大）', s:14,   tier:'M', cat:'工事', note:'可叠 3 层'},
  {k:'hs_wall',n:'HESCO 墙',       s:46,   tier:'M', cat:'工事', note:'=4 个大墩，性价比最高'},
  {k:'gate',   n:'大门',           s:52,   tier:'M', cat:'工事', note:'车辆入口'},
  {k:'speaker',n:'扩音器',         s:61,   tier:'M', cat:'功能', note:'全区广播'},
  {k:'bunker', n:'掩体',           s:61,   tier:'L', cat:'工事'},
  {k:'rtower', n:'侦察塔',         s:61,   tier:'L', cat:'功能', note:'制高点，可架 SAM'},
  {k:'ifs',    n:'间接火力掩体',   s:61,   tier:'L', cat:'工事', note:'四门气锁结构'},
  {k:'sting',  n:'Stingray',       s:91,   tier:'L', cat:'火力', note:'反装甲迫击炮'},
  {k:'mortar', n:'L81 迫击炮',     s:91,   tier:'L', cat:'火力', note:'沙袋贴身、HESCO 隔一格留射弧'},
  {k:'refuel', n:'加油站',         s:121,  tier:'L', cat:'后勤'},
  {k:'repair', n:'维修站',         s:121,  tier:'L', cat:'后勤'},
  {k:'sam',    n:'Talon 9K 防空',  s:601,  tier:'L', cat:'火力', note:'地空导弹，最好架高'},
  {k:'ciws',   n:'Vanguard 近防炮',s:901,  tier:'L', cat:'火力', note:'手动加特林防空'},
  {k:'drill',  n:'钻井平台',       s:1351, tier:'L', cat:'特殊', note:'耗燃料把 Hot Zone 拉过来'},
];
export const BUILD_PRESETS = {
  aa:       { fob:1, hs_s:12, rtower:1, sam:1 },
  mortarpit:{ fob:1, sandbag:8, hs_wall:4, mortar:1 },
  drill:    { fob:1, hs_wall:8, gate:1, rtower:1, drill:1, refuel:1 },
  field:    { wire:10, sandbag:10, hedge:4, tent:2 },
};
export const FOB_RADIUS = 60;
export const UNIT_PRICE = 10, PALLET = 1800, UNIT_KG = 0.02;
/* 标记调色板。这组色值是为【浅底】挑的深色，canvas 画在地图瓦片上（与页面主题无关），
   但它们同时被拿去做列表项的文字色——深色主题下就成了深字压深底，基本读不出来。
   DOM 里改走 --mk-1..6（随主题切到同色相的亮版本），canvas 仍用原色。
   不在调色板内的自定义色原样返回，绝不吞掉用户自己的选择。 */
export const MARK_COLORS = ['#a3322c','#2a5f9e','#a8621a','#7a3f9d','#1c7a7a','#c2185b'];
export function markCss(hex){
  const i = MARK_COLORS.indexOf(hex);
  return i < 0 ? hex : `var(--mk-${i + 1})`;
}
export const RADIUS_PRESETS = [100,200,300,400,500,684];
export { MAPS };

const STORE_KEY = 'wardogs-mortar-map-v1';
const SRC_KEY = 'wardogs-mortar-map-src';
export const SRC_SEQ = ['auto', 'local', 'cdn'];
export const SRC_TXT = { auto:'自动', local:'本地', cdn:'在线' };

/* ============================================================
 * 引擎
 * ============================================================ */
export function createEngine(canvas, opts = {}){
  const ctx = canvas.getContext('2d');
  const emit = opts.onChange || (() => {});
  const toast = opts.onFlash || (() => {});
  const onCursor = opts.onCursor || (() => {});

  const S = {
    mode:'solve', mapId:'bakurani',
    weapon: DEFAULT_WEAPON, arc: null,   // arc=null → 用该武器的默认弹道弧
    mortar:null, target:null, impact:null, predPoint:null,
    put:'mortar', showGrid:true, showPoi:true,
    srcMode:'auto',
    view:{ cx:78, cy:74, scale:6 },
    lastAz:null,
    tool:'ruler', ruler:{ a:null, b:null }, pend:null,
    circles:[], rays:[], marks:[], route:{ pts:[] }, polys:[], polyDraft:null,
    builds:[], calcQty:{}, buildArm:null,
    showMarks:true, theme:'dark', hist:[], seq:1,
    predAz:'', predMil:'', predRng:'',
    results:{ solve:null, predict:null, correct:null },
  };

  let CW = 0, CH = 0, DPR = 1, lastW = 0, lastH = 0;
  const tileCache = new Map();
  const TILE_MAX = 700;
  let tileFail = 0, tileOk = 0;
  let missing = 0;          // 本帧连祖先都顶不上的格子数，用于底图提示
  const probe = {};
  const MAP = () => MAPS[S.mapId];
  let drag = null, panning = null, moved = false;

  /* canvas 画不了 <use>/currentColor，图标得烧成 data-URI 再 drawImage。
     解码是异步的，首帧通常画不出；就绪后重绘一次即可。 */
  function redrawIcon(){ draw(); }
  const icoImg = (name, color, sw) => iconImage(name, color, sw, redrawIcon);

  /* ---------- 当前武器 ---------- */
  const W = () => weaponById(S.weapon);
  /* 选中的弹道弧；S.arc 为 null 或在该武器上不存在时退回默认弧。 */
  const ARC = () => arcOf(W(), S.arc);
  /* 切换武器后，原来选的弧可能不存在了（低/高 → 单弹道），这里纠正一次。 */
  function enforceArc(){ const w = W(); if (!w.arcs.some(a => a.key === S.arc)) S.arc = w.arcs[0].key; }
  enforceArc();

  /* ---------- 底图来源 ---------- */
  const TILE_ROOT = 'tiles';
  function tileUrl(m, tz, tx, ty, local){
    const t = m.tiles;
    if (!local) return `${t.path}/zoom_${tz}/${tx}_${ty}.${t.extension}`;
    const rel = `${m.id}/zoom_${tz}/${tx}_${ty}.${t.extension}`;
    /* 桌面版：交给 Rust 的 tile:// 代理。它内部已经是「磁盘缓存 → CDN」，
       所以这里的 local 分支同时也就是在线分支，还有持久化缓存加持。 */
    return IS_TAURI ? `${TILE_HOST}/${rel}` : `${TILE_ROOT}/${rel}`;
  }
  function tileBase(m){
    /* 桌面版恒走代理：代理拿不到才会 404，那时 getTile 会退回直连 CDN */
    if (IS_TAURI) return 'local';
    if (S.srcMode === 'local') return 'local';
    if (S.srcMode === 'cdn')   return 'cdn';
    return probe[m.id] || 'pending';
  }
  function probeLocal(m){
    if (IS_TAURI) return;                 // 代理已定，不必探测
    if (S.srcMode !== 'auto'){ probe[m.id] = S.srcMode === 'local' ? 'local' : 'cdn'; return; }
    if (probe[m.id]) return;
    probe[m.id] = 'pending';
    const cands = [[0,0,0],[1,0,0],[2,0,0]];
    let i = 0;
    const next = () => {
      if (i >= cands.length){ probe[m.id] = 'cdn'; draw(); return; }
      const [z,x,y] = cands[i++];
      const im = new Image();
      im.onload  = () => { probe[m.id] = 'local'; draw(); };
      im.onerror = () => next();
      im.src = tileUrl(m, z, x, y, true);
    };
    next();
  }
  function mkTile(url, onfail){
    let img = tileCache.get(url);
    if (img) return img;
    if (tileCache.size > TILE_MAX) tileCache.delete(tileCache.keys().next().value);
    img = new Image();
    img.decoding = 'async';
    img.onload  = () => { tileOk++; draw(); };
    img.onerror = () => { if (onfail) onfail(); else tileFail++; };
    img.src = url;
    tileCache.set(url, img);
    return img;
  }
  function getTile(m, tz, tx, ty){
    const base = tileBase(m);
    if (base === 'pending') return null;
    if (base === 'local'){
      const lu = tileUrl(m, tz, tx, ty, true);
      return mkTile(lu, () => {
        if (S.srcMode === 'cdn'){ tileFail++; return; }
        mkTile(tileUrl(m, tz, tx, ty, false));
      });
    }
    return mkTile(tileUrl(m, tz, tx, ty, false));
  }

  /* ---------- 坐标变换 ---------- */
  function resize(){
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    CW = Math.max(1, Math.round(r.width)); CH = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(CW*DPR); canvas.height = Math.round(CH*DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  function w2s(gx, gy){
    return { x:(gx - S.view.cx)*S.view.scale + CW/2, y:(S.view.cy - gy)*S.view.scale + CH/2 };
  }
  function s2w(px, py){
    return { x:(px - CW/2)/S.view.scale + S.view.cx, y:S.view.cy - (py - CH/2)/S.view.scale };
  }
  /* 瓦片金字塔铺满的是「整个世界」tileBounds（0–163.84），不是可玩区 bounds
     （bakurani 只有 110 见方、还偏在世界中间）。这两个混用会把整张底图放大
     163.84/110.25 ≈ 1.486 倍再平移一段，表现就是「Tower 的点落在塔旁边的野地里，
     而且越靠边偏得越多」——标点是按世界坐标画的，只有底图错位。
     别再把这里的 tileBounds 换成 bounds。 */
  function tileBox(){ return MAP().tileBounds; }
  function fitMap(){
    /* 初始视野仍然取可玩区：世界四角大部分是打不到的地方，开局看那个没有意义。 */
    const b = MAP().bounds;
    S.view.cx = (b.minX+b.maxX)/2; S.view.cy = (b.minY+b.maxY)/2;
    S.view.scale = Math.min(CW/(b.maxX-b.minX), CH/(b.maxY-b.minY)) * 0.96;
  }
  function tileZoom(){
    const b = tileBox(), t = MAP().tiles;
    const want = Math.log2((b.maxX-b.minX)*S.view.scale / t.tileSize);
    return Math.max(t.minZoom, Math.min(t.maxZoom, Math.ceil(want - 1e-6)));
  }
  function niceStep(span){
    const raw = span/8, pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw/pow;
    return (n<=1?1:n<=2?2:n<=5?5:10)*pow;
  }
  function clampCoord(p){
    return { x: Math.round(Math.max(0, Math.min(163.84, p.x))*100)/100,
             y: Math.round(Math.max(0, Math.min(163.84, p.y))*100)/100 };
  }

  /* ---------- 绘制 ---------- */
  function resizeIfNeeded(){
    const r = canvas.getBoundingClientRect();
    if (Math.round(r.width) !== lastW || Math.round(r.height) !== lastH){
      lastW = Math.round(r.width); lastH = Math.round(r.height);
      resize();
    }
  }
  function draw(){
    resizeIfNeeded();
    ctx.clearRect(0,0,CW,CH);
    ctx.fillStyle = '#dfe3e8'; ctx.fillRect(0,0,CW,CH);
    drawTiles();
    drawNoTileBadge();
    if (S.showGrid) drawGrid();
    if (S.showPoi) drawPoi();
    drawToolsLayer();
    drawBuildsLayer();
    drawSolution();
  }
  function drawNoTileBadge(){
    const p = probe[MAP().id];
    /* 只要画出过瓦片（含祖先兜底顶上的）就不打扰用户：画面已经有图，
       只是可能还不够清晰，这不是需要报警的状态。 */
    if (tileOk > 0) return;
    const txt = p === 'pending' ? '正在检测底图…'
      : (IS_TAURI || S.srcMode === 'cdn' || p === 'cdn') && tileFail >= 3
        ? '底图无法加载（离线？）· 网格与标点仍可用'
      : tileFail >= 3 ? '底图缺失 · 网格与标点仍可用' : '底图加载中…';
    ctx.font = '600 12px system-ui';
    const w = ctx.measureText(txt).width + 20;
    ctx.fillStyle = 'rgba(28,32,36,.78)';
    ctx.fillRect((CW-w)/2, 12, w, 26);
    ctx.fillStyle = '#fff';
    ctx.fillText(txt, (CW-w)/2+10, 29);
  }
  function drawTiles(){
    const m = MAP(), t = m.tiles, b = tileBox();
    probeLocal(m);
    const tz = tileZoom();
    const n = Math.pow(2, tz);
    const tw = (b.maxX-b.minX)/n, th = (b.maxY-b.minY)/n;
    const tl = w2s(b.minX, b.maxY);              // 瓦片 (0,0) 左上角 = 世界西北角
    const px = tw*S.view.scale, py = th*S.view.scale;
    if (px < 2 || py < 2) return;
    const x0 = Math.max(0, Math.floor((0 - tl.x)/px)), x1 = Math.min(n-1, Math.floor((CW - tl.x)/px));
    const y0 = Math.max(0, Math.floor((0 - tl.y)/py)), y1 = Math.min(n-1, Math.floor((CH - tl.y)/py));
    ctx.imageSmoothingEnabled = true;
    missing = 0;
    for (let ty=y0; ty<=y1; ty++){
      for (let tx=x0; tx<=x1; tx++){
        const sx = tl.x + tx*px, sy = tl.y + ty*py;
        const img = getTile(m, tz, tx, ty);
        if (img && img.complete && img.naturalWidth){
          ctx.drawImage(img, sx, sy, px+0.6, py+0.6);
          continue;
        }
        /* 目标层这一块还没到：向上找最近的已加载祖先层，裁出对应的一小块放大顶上。
           地图因此永远不会空白，只会「先糊后清晰」——感知速度提升最大的一招。 */
        if (!drawAncestor(m, tz, tx, ty, sx, sy, px, py)) missing++;
      }
    }
    prefetch(m, tz, x0, y0, x1, y1, n);
  }
  /** 用祖先层顶替 (tx,ty)；成功返回 true */
  function drawAncestor(m, tz, tx, ty, sx, sy, px, py){
    const minZ = m.tiles.minZoom;
    for (let k = 1; k <= 5; k++){
      const az = tz - k;
      if (az < minZ) return false;
      const f = 1 << k;
      const aimg = getTile(m, az, tx >> k, ty >> k);
      if (!(aimg && aimg.complete && aimg.naturalWidth)) continue;
      /* 祖先瓦片被 2^k × 2^k 等分，(tx,ty) 落在其中第 (tx%f, ty%f) 格 */
      const sw = aimg.naturalWidth / f, sh = aimg.naturalHeight / f;
      ctx.drawImage(aimg, (tx % f) * sw, (ty % f) * sh, sw, sh, sx, sy, px+0.6, py+0.6);
      return true;
    }
    return false;
  }
  /* 视野外扩一圈预取：平移时下一屏已经在了，不会「推出了白边再等」 */
  let prefetchOn = true;
  function prefetch(m, tz, x0, y0, x1, y1, n){
    if (!prefetchOn) return;
    for (let ty=y0-1; ty<=y1+1; ty++){
      if (ty < 0 || ty >= n) continue;
      for (let tx=x0-1; tx<=x1+1; tx++){
        if (tx < 0 || tx >= n) continue;
        if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) continue;  // 可见区已请求过
        getTile(m, tz, tx, ty);
      }
    }
  }
  function setPrefetch(on){ prefetchOn = !!on; }
  function drawGrid(){
    const b = MAP().bounds;
    const w0 = s2w(0,0), w1 = s2w(CW,CH);
    const step = niceStep(Math.max(w1.x-w0.x, w1.y-w0.y));
    ctx.lineWidth = 1;
    ctx.font = '10.5px ui-monospace,Consolas,monospace';
    const gx0 = Math.ceil(Math.max(b.minX,w0.x)/step)*step, gx1 = Math.min(b.maxX,w1.x);
    for (let x=gx0; x<=gx1+1e-9; x+=step){
      const p = w2s(x, 0);
      ctx.strokeStyle = 'rgba(28,32,36,.13)';
      ctx.beginPath(); ctx.moveTo(p.x,0); ctx.lineTo(p.x,CH); ctx.stroke();
      ctx.fillStyle = 'rgba(28,32,36,.55)';
      ctx.fillText(x.toFixed(step<1?1:0), p.x+3, CH-6);
    }
    const gy1 = Math.floor(Math.min(b.maxY,w1.y)/step)*step;
    for (let y=gy1; y>=Math.max(b.minY,w0.y)-1e-9; y-=step){
      const p = w2s(0, y);
      ctx.strokeStyle = 'rgba(28,32,36,.13)';
      ctx.beginPath(); ctx.moveTo(0,p.y); ctx.lineTo(CW,p.y); ctx.stroke();
      ctx.fillStyle = 'rgba(28,32,36,.55)';
      ctx.fillText(y.toFixed(step<1?1:0), 5, p.y-4);
    }
    const targetPx = 110;
    const rawM = targetPx / S.view.scale * 100;
    const nice = [10,20,50,100,200,500,1000,2000].reduce((a,c)=>Math.abs(c-rawM)<Math.abs(a-rawM)?c:a,100);
    const barPx = nice/100*S.view.scale;
    ctx.strokeStyle = '#1c2024'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(14, CH-16); ctx.lineTo(14+barPx, CH-16); ctx.stroke();
    ctx.fillStyle = '#1c2024'; ctx.font = '600 11px system-ui';
    ctx.fillText(nice + ' m', 14, CH-22);
  }
  function drawPoi(){
    const m = MAP();
    const showAll = S.view.scale > 9;
    ctx.font = '600 11px system-ui';
    for (const mk of m.markers){
      const isTower = mk.icon === 'tower';
      if (!isTower && !showAll) continue;
      const p = w2s(mk.x, mk.y);
      if (p.x < -60 || p.x > CW+60 || p.y < -30 || p.y > CH+30) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
      ctx.fillStyle = isTower ? 'rgba(163,50,44,.9)' : 'rgba(42,63,94,.85)';
      ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      const tw = ctx.measureText(mk.label).width;
      ctx.fillRect(p.x+6, p.y-13, tw+7, 15);
      ctx.fillStyle = isTower ? '#a3322c' : '#2a3f5e';
      ctx.fillText(mk.label, p.x+9.5, p.y-1.5);
    }
  }
  function ring(gx, gy, rMeters, color){
    const p = w2s(gx, gy), r = rMeters/100*S.view.scale;
    if (r < 1) return;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2);
    ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.setLineDash([6,5]); ctx.stroke();
    ctx.setLineDash([]);
  }
  function dot(gx, gy, color, label, sub){
    const p = w2s(gx, gy);
    ctx.beginPath(); ctx.arc(p.x, p.y, 6.5, 0, Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 2.6; ctx.strokeStyle = color; ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.3, 0, Math.PI*2);
    ctx.fillStyle = color; ctx.fill();
    ctx.font = '600 11.5px system-ui'; ctx.fillStyle = color;
    ctx.fillText(label, p.x+11, p.y-7);
    ctx.font = '10.5px ui-monospace,Consolas,monospace'; ctx.fillStyle = '#5a6169';
    ctx.fillText(sub, p.x+11, p.y+6);
  }
  function seg(a, b, color, dash){
    const p1 = w2s(a.x,a.y), p2 = w2s(b.x,b.y);
    ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y);
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.setLineDash(dash); ctx.stroke();
    ctx.setLineDash([]);
  }
  function polyCentroid(pts){
    let x = 0, y = 0; for (const p of pts){ x += p.x; y += p.y; }
    return { x:x/pts.length, y:y/pts.length };
  }
  function drawPolyPath(pts, close, color, fill){
    ctx.beginPath();
    pts.forEach((p, i) => { const s = w2s(p.x, p.y); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
    if (close){
      ctx.closePath();
      if (fill){ ctx.fillStyle = fill; ctx.fill(); }
    }
    ctx.strokeStyle = color; ctx.lineWidth = 1.8;
    ctx.setLineDash(close ? [] : [7,5]); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawToolsLayer(){
    for (const pg of S.polys){
      const fill = pg.nofire ? 'rgba(163,50,44,.12)' : 'rgba(122,63,157,.10)';
      drawPolyPath(pg.pts, true, pg.color, fill);
      const c = polyCentroid(pg.pts), s = w2s(c.x, c.y);
      ctx.font = '600 11px system-ui';
      const ico = pg.nofire ? icoImg('ban', pg.color, 2.4) : null;
      const iw = ico ? 13 : 0;
      const tw = ctx.measureText(pg.name).width + 8 + iw;
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.fillRect(s.x-tw/2, s.y-9, tw, 17);
      ctx.fillStyle = pg.color;
      if (ico) ctx.drawImage(ico, s.x-tw/2+4, s.y-6, 11, 11);
      ctx.fillText(pg.name, s.x-tw/2+4+iw, s.y+4);
    }
    if (S.mode === 'tools' && S.polyDraft && S.polyDraft.pts.length){
      drawPolyPath(S.polyDraft.pts, false, 'rgba(163,50,44,.8)');
      const f = S.polyDraft.pts[0], fp = w2s(f.x, f.y);
      ctx.beginPath(); ctx.arc(fp.x, fp.y, 8, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(163,50,44,.9)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = '600 10.5px system-ui'; ctx.fillStyle = '#a3322c';
      ctx.fillText(S.polyDraft.pts.length < 3 ? '再点 ' + (3 - S.polyDraft.pts.length) + ' 下后可闭合' : '点起点圆圈闭合', fp.x+12, fp.y+4);
    }
    if (S.route.pts.length){
      const pts = S.route.pts;
      drawPolyPath(pts, false, '#c2185b');
      ctx.font = '600 10.5px ui-monospace,Consolas,monospace';
      let total = 0;
      for (let i = 1; i < pts.length; i++){
        const d = Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y) * 100;
        total += d;
        const m = w2s((pts[i].x+pts[i-1].x)/2, (pts[i].y+pts[i-1].y)/2);
        const txt = Math.round(d) + 'm';
        const tw = ctx.measureText(txt).width + 8;
        ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(m.x-tw/2, m.y-9, tw, 15);
        ctx.fillStyle = '#c2185b'; ctx.fillText(txt, m.x-tw/2+4, m.y+3);
      }
      pts.forEach(p => { const s = w2s(p.x, p.y);
        ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, Math.PI*2);
        ctx.fillStyle = '#c2185b'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke(); });
      if (pts.length > 1){
        const lp = w2s(pts[pts.length-1].x, pts[pts.length-1].y);
        ctx.font = '600 11px system-ui';
        const txt = '全程 ' + Math.round(total) + ' m';
        const tw = ctx.measureText(txt).width + 10;
        ctx.fillStyle = 'rgba(194,24,91,.95)'; ctx.fillRect(lp.x+7, lp.y-10, tw, 19);
        ctx.fillStyle = '#fff'; ctx.fillText(txt, lp.x+12, lp.y+4);
      }
    }
    for (const c of S.circles){
      const p = w2s(c.x, c.y), r = c.r/100*S.view.scale;
      if (r < 1 || p.x < -r-80 || p.x > CW+r+80 || p.y < -r-40 || p.y > CH+r+40) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(122,63,157,.85)'; ctx.lineWidth = 1.6;
      ctx.setLineDash([2,4]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(122,63,157,.06)'; ctx.fill();
      ctx.font = '600 10.5px system-ui'; ctx.fillStyle = '#7a3f9d';
      ctx.fillText(c.name + ' · ' + Math.round(c.r) + ' m', p.x + 6, p.y - r - 5);
    }
    for (const ry of S.rays){
      const p = w2s(ry.x, ry.y);
      const a = ry.az * Math.PI/180;
      const L = Math.hypot(CW, CH) * 1.2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.sin(a)*L, p.y - Math.cos(a)*L);
      ctx.strokeStyle = 'rgba(28,122,122,.75)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([9,6]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
      ctx.fillStyle = '#1c7a7a'; ctx.fill();
      ctx.font = '600 10.5px system-ui'; ctx.fillStyle = '#1c7a7a';
      ctx.fillText(ry.name + ' · ' + ry.az.toFixed(0) + '°', p.x + 7, p.y - 7);
    }
    if (S.showMarks){
      for (const mk of S.marks){
        const p = w2s(mk.x, mk.y);
        if (p.x < -70 || p.x > CW+70 || p.y < -40 || p.y > CH+40) continue;
        ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI*2);
        ctx.fillStyle = mk.color; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.font = '600 11px system-ui';
        const tw = ctx.measureText(mk.name).width + 8;
        ctx.fillStyle = 'rgba(255,255,255,.94)';
        ctx.fillRect(p.x+7, p.y-14, tw, 16);
        ctx.fillStyle = mk.color;
        ctx.fillText(mk.name, p.x+11, p.y-2);
      }
    }
    if (S.mode === 'tools' && S.tool === 'ruler'){
      const {a, b} = S.ruler;
      if (a && b){
        seg(a, b, '#c2185b', [2,3]);
        const {dist, az} = solveVector(b.x-a.x, b.y-a.y);
        const mid = w2s((a.x+b.x)/2, (a.y+b.y)/2);
        const txt = Math.round(dist)+' m / '+faz(az)+'°';
        ctx.font = '600 11.5px ui-monospace,Consolas,monospace';
        const w = ctx.measureText(txt).width + 14;
        ctx.fillStyle = 'rgba(194,24,91,.92)';
        ctx.beginPath();
        const bx = mid.x-w/2, by = mid.y-11;
        if (ctx.roundRect){ ctx.roundRect(bx,by,w,22,5); ctx.fill(); } else ctx.fillRect(bx,by,w,22);
        ctx.fillStyle = '#fff'; ctx.fillText(txt, bx+7, by+15);
      }
      if (a && !b) dot(a.x, a.y, '#c2185b', '起点', '再点一下结束');
    }
    if (S.mode === 'tools' && S.pend) dot(S.pend.p.x, S.pend.p.y,
      S.pend.kind === 'ray' ? '#1c7a7a' : '#7a3f9d', '已选', '再点一下确定');
  }
  function drawBuildsLayer(){
    for (const b of S.builds){
      const e = BUILD_CATALOG.find(x => x.k === b.k);
      const p = w2s(b.x, b.y);
      if (b.k === 'fob'){
        const r = FOB_RADIUS/100*S.view.scale;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(43,124,201,.9)'; ctx.lineWidth = 2;
        ctx.setLineDash([]); ctx.stroke();
        ctx.fillStyle = 'rgba(43,124,201,.07)'; ctx.fill();
      }
      const d = nearestFobDist(b);
      const bad = e && b.k !== 'fob' && !e.cat.includes('免') && d > FOB_RADIUS;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5.5, 0, Math.PI*2);
      ctx.fillStyle = bad ? '#a3322c' : (b.k==='fob' ? '#2b7cc9' : '#2f6f4f'); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.font = '600 10.5px system-ui';
      const col = bad ? '#a3322c' : (b.k==='fob' ? '#2b7cc9' : '#1d4d35');
      const ico = bad ? icoImg('triangle-alert', col, 2.4) : null;
      const iw = ico ? 12 : 0;
      const tw = ctx.measureText(b.name).width + 8 + iw;
      ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fillRect(p.x+7, p.y-13, tw, 16);
      ctx.fillStyle = col;
      if (ico) ctx.drawImage(ico, p.x+11, p.y-8, 10, 10);
      ctx.fillText(b.name, p.x+11+iw, p.y-1);
    }
  }
  function drawSolution(){
    if (S.mortar){
      const w = W();
      ring(S.mortar.x, S.mortar.y, w.maxR, 'rgba(47,111,79,.5)');
      ring(S.mortar.x, S.mortar.y, w.minR, 'rgba(163,50,44,.5)');
    }
    const showT = S.mode==='solve' || S.mode==='correct';
    if (S.mode==='solve' && S.mortar && S.target){
      seg(S.mortar, S.target, '#2f6f4f', [7,4]);
      const {dist, az} = solveVector(S.target.x-S.mortar.x, S.target.y-S.mortar.y);
      const mid = w2s((S.mortar.x+S.target.x)/2, (S.mortar.y+S.target.y)/2);
      const txt = Math.round(dist)+' m / '+faz(az);
      ctx.font = '11.5px ui-monospace,Consolas,monospace';
      const w = ctx.measureText(txt).width + 14;
      ctx.fillStyle = 'rgba(28,32,36,.88)';
      ctx.beginPath();
      const bx = mid.x-w/2, by = mid.y-10;
      if (ctx.roundRect) { ctx.roundRect(bx,by,w,20,5); ctx.fill(); }
      else ctx.fillRect(bx,by,w,20);
      ctx.fillStyle = '#fff'; ctx.fillText(txt, bx+7, by+14);
    }
    if (S.mode==='correct' && S.mortar && S.impact) seg(S.mortar, S.impact, '#a8621a', [4,4]);
    if (S.mode==='predict' && S.mortar && S.predPoint) seg(S.mortar, S.predPoint, '#2a5f9e', [7,4]);
    if (showT && S.target) dot(S.target.x, S.target.y, '#a3322c', '目标', fx(S.target.x)+', '+fx(S.target.y));
    if (S.mode==='correct' && S.impact) dot(S.impact.x, S.impact.y, '#a8621a', '弹坑', fx(S.impact.x)+', '+fx(S.impact.y));
    if (S.mode==='predict' && S.predPoint) dot(S.predPoint.x, S.predPoint.y, '#2a5f9e', '落点', fx(S.predPoint.x)+', '+fx(S.predPoint.y));
    if (S.mortar) dot(S.mortar.x, S.mortar.y, '#2f6f4f', '炮位', fx(S.mortar.x)+', '+fx(S.mortar.y));
  }

  /* ---------- 计算结果（结构化） ---------- */
  function nf(p){ return S.polys.find(pg => pg.nofire && ptInPoly(p, pg.pts)) || null; }
  function computeSolve(){
    const mortar = S.mortar, target = S.target;
    if (!mortar || !target){
      S.results.solve = { err: !mortar ? '先设一个炮位坐标，或点「放炮位」后在地图上点。' : '还差目标坐标——点「放目标」后在地图上点，或直接填坐标。' };
      return;
    }
    const w = W();
    const {dist, az} = solveVector(target.x-mortar.x, target.y-mortar.y);
    const sols = arcSolutions(w, dist);
    const pick = sols.find(a => a.key === ARC().key) || sols[0] || null;
    const mil = pick ? pick.mil : 0, milR = Math.round(mil);
    const distAtMil = pick ? milToRange(milR, pick.tbl) : 0;
    const spread = dist * MOA50;
    const nm = w.name;
    let stCls = 'ok', stTxt = '';
    if (dist < w.minR){ stCls='bad'; stTxt = `太近了——低于 ${nm} 最小射程 ${w.minR} m，这一发打不出去。把炮位往回挪。`; }
    else if (dist > w.maxR){ stCls='bad'; stTxt = `太远了——超出 ${nm} 最大射程 ${w.maxR} m 约 ${Math.round(dist-w.maxR)} m。往前推炮位。`; }
    else if (dist > w.maxR-40){ stCls='warn'; stTxt = `贴近最大射程（${w.maxR} m），密位随距离变化极快，能挪近一点就挪近一点。`; }
    else if (sols.length > 1){
      const l = sols.map(a => `${a.label} ${Math.round(a.mil)}`).join(' / ');
      stTxt = `目标在有效射程内（${w.minR}–${w.maxR} m），两条弹道都有解：${l} 密位。低弹道弹道更平、受风偏影响小，优先用。`;
    }
    else stTxt = `目标在有效射程内（${w.minR}–${w.maxR} m），只有${sols[0] ? sols[0].label : '默认弹道'}可用。表内插值密位 ${mil.toFixed(1)}，取整 ${milR} → 对应 ${Math.round(distAtMil)} m。`;
    S.lastAz = az;
    const nfT = nf(target);
    S.results.solve = { mil, milR, dist, az, distAtMil, spread, stCls, stTxt,
      weapon: w.id, weaponName: nm,
      /* 每条可用弹道的完整解，UI 逐条展示；选中的那条决定口令与复制内容 */
      arc: pick ? pick.key : null,
      arcs: sols.map(a => {
        const r = Math.round(a.mil);
        return { key:a.key, label:a.label, mil:a.mil, milR:r,
                 distAtMil: milToRange(r, a.tbl), selected: !!pick && a.key === pick.key };
      }),
      nf: nfT ? nfT.name : null, dx: target.x-mortar.x, dy: target.y-mortar.y,
      cmd: `方位 ${faz(az)}，距离 ${fm0(dist)}，密位 ${fm0(milR)}` };
  }
  function computePredict(){
    const mortar = S.mortar;
    const azIn = parseNum(S.predAz);
    const milIn = parseNum(S.predMil);
    const rngIn = parseNum(S.predRng);
    if (!mortar){ S.predPoint = null; S.results.predict = { err:'先填炮位坐标，或在地图上点一下放炮位。' }; return; }
    if (azIn == null){ S.predPoint = null; S.results.predict = { err:'填一个方位角（0–360，0=北 90=东）。' }; return; }
    if (milIn == null && rngIn == null){ S.predPoint = null; S.results.predict = { err:'密位和 RNG 至少填一个。' }; return; }
    const w = W(), arc = ARC();
    const tableMax = arc.tbl[arc.tbl.length-1][0];
    /* 表里密位是单调的，取首末即得量程 */
    const m1 = arc.tbl[0][1], m2 = arc.tbl[arc.tbl.length-1][1];
    const milLo = Math.min(m1, m2), milHi = Math.max(m1, m2);
    /* 密位喂错弹道是很容易犯的错（低弹道 84 喂给高弹道量程 610–1400），
       milToRange 会静默夹到端点，结果看起来正常但其实完全不对，所以这里显式拦一道。 */
    const milOff = milIn != null && (milIn < milLo || milIn > milHi);
    let dist, srcTxt;
    /* 反查射表必须用选中的那条弹道弧——低弹道 1500 m 是 84 密位，
       高弹道同一距离是 1213 密位，用错表会算到完全不同的地方。 */
    if (milIn != null){ dist = milToRange(milIn, arc.tbl); srcTxt = `由${arc.label}密位 ${fm0(milIn)} 反查射表`; }
    else { dist = rngIn; srcTxt = '由 RNG 距离直接给出'; }
    const pt = unitToXY(mortar.x, mortar.y, azIn, dist);
    const clX = Math.max(0, Math.min(163.84, pt.x)), clY = Math.max(0, Math.min(163.84, pt.y));
    const off = Math.abs(clX-pt.x) > 1e-9 || Math.abs(clY-pt.y) > 1e-9;
    const c = { x: Math.round(clX*100)/100, y: Math.round(clY*100)/100 };
    S.predPoint = c;
    const milBack = rangeToMil(dist, arc.tbl);
    let stCls='ok', stTxt='';
    if (milOff){ stCls='bad';
      stTxt = `密位 ${fm0(milIn)} 不在${arc.label}的量程（${milLo}–${milHi}）内，已按表端取值，落点不可信。`
            + `换一条弹道，或改用 RNG 距离。`; }
    else if (dist < w.minR){ stCls='bad'; stTxt = `射程 ${Math.round(dist)} m 低于 ${w.name} 最小射程 ${w.minR} m，打不到。`; }
    else if (dist > tableMax + 13){ stCls='bad'; stTxt = `射程 ${Math.round(dist)} m 超出射表上限，炮弹会在更近处落地。`; }
    else if (dist > tableMax){ stCls='warn'; stTxt = `射程 ${Math.round(dist)} m 略超 ${arc.label}表上限 ${tableMax} m，已外推，实际会打短。`; }
    else stTxt = `落点如下，${srcTxt}。`;
    const nfP = nf(c);
    S.results.predict = { x:c.x, y:c.y, dist, milBack, stCls, stTxt, off,
      weapon: w.id, weaponName: w.name, arc: arc.key, arcLabel: arc.label, milOff,
      azIn, dx:c.x-mortar.x, dy:c.y-mortar.y, spread:dist*MOA50, nf: nfP ? nfP.name : null };
  }
  function computeCorrect(){
    const {mortar, target, impact} = S;
    if (!mortar || !impact){
      S.results.correct = { err:'填上炮位和弹坑坐标（目标可以留空）。' }; return;
    }
    const w = W(), arc = ARC();
    const imp = solveVector(impact.x-mortar.x, impact.y-mortar.y);
    if (!target){
      S.results.correct = { partial:true, impDist:imp.dist, impAz:imp.az,
        weapon:w.id, weaponName:w.name, arc:arc.key, arcLabel:arc.label,
        mil:rangeToMil(imp.dist, arc.tbl), spread:imp.dist*MOA50 };
      return;
    }
    const tgt = solveVector(target.x-mortar.x, target.y-mortar.y);
    let dAz = tgt.az - imp.az;
    while (dAz > 180) dAz -= 360; while (dAz < -180) dAz += 360;
    const dR = tgt.dist - imp.dist;
    const newMil = Math.round(rangeToMil(tgt.dist, arc.tbl));
    S.results.correct = { mil:newMil, az:tgt.az, dR, dAz,
      weapon:w.id, weaponName:w.name, arc:arc.key, arcLabel:arc.label,
      tgtDist:tgt.dist, tgtAz:tgt.az, impDist:imp.dist, impAz:imp.az,
      dev: Math.round(Math.hypot(target.x-impact.x, target.y-impact.y)*100),
      cmd: `${Math.abs(dR)>=2 ? (dR>0?'加':'减')+Math.abs(Math.round(dR))+'米 · ' : ''}${Math.abs(dAz)>=0.5 ? (dAz>0?'右转':'左转')+' '+Math.abs(dAz).toFixed(1)+'° · ' : ''}方位 ${faz(tgt.az)}，距离 ${fm0(tgt.dist)}，密位 ${fm0(newMil)}` };
  }
  function compute(){
    computeSolve(); computePredict(); computeCorrect();
  }
  /* 由 UI 触发的重算入口 */
  function run(log){
    compute(); draw(); save(); emit();
    if (log) logShot(log);
  }

  /* ---------- 工具点击 ---------- */
  function handleToolClick(c){
    if (S.tool === 'ruler'){
      if (!S.ruler.a || S.ruler.b) S.ruler = { a:c, b:null };
      else S.ruler.b = c;
    } else if (S.tool === 'circle'){
      if (!S.pend){ S.pend = { p:c, kind:'circle' }; toast('再点一下确定半径'); }
      else {
        const r = Math.max(10, Math.round(Math.hypot(c.x-S.pend.p.x, c.y-S.pend.p.y)*100));
        S.circles.push({ x:S.pend.p.x, y:S.pend.p.y, r, name:'圈' + (S.seq++) });
        S.pend = null;
      }
    } else if (S.tool === 'ray'){
      if (!S.pend){ S.pend = { p:c, kind:'ray' }; toast('再点一下确定方向'); }
      else {
        const { az } = solveVector(c.x-S.pend.p.x, c.y-S.pend.p.y);
        S.rays.push({ x:S.pend.p.x, y:S.pend.p.y, az:Math.round(az*10)/10, name:'线' + (S.seq++) });
        S.pend = null;
      }
    } else if (S.tool === 'marker'){
      const id = S.seq++;
      S.marks.push({ id, x:c.x, y:c.y, name:'标记' + id,
        color:MARK_COLORS[S.marks.length % MARK_COLORS.length] });
    } else if (S.tool === 'route'){
      S.route.pts.push(c);
    } else if (S.tool === 'poly'){
      if (!S.polyDraft) S.polyDraft = { pts:[c] };
      else {
        const first = S.polyDraft.pts[0];
        const fp = w2s(first.x, first.y), cp = w2s(c.x, c.y);
        if (S.polyDraft.pts.length >= 3 && Math.hypot(fp.x-cp.x, fp.y-cp.y) <= 12) closePoly();
        else S.polyDraft.pts.push(c);
      }
    }
    save(); emit();
  }
  function closePoly(){
    if (!S.polyDraft || S.polyDraft.pts.length < 3){ S.polyDraft = null; return; }
    const id = S.seq++;
    S.polys.push({ id, pts:S.polyDraft.pts, name:'区' + id,
      color:'rgba(163,50,44,.55)', nofire:true });
    S.polyDraft = null;
    toast('区域已闭合，可在列表里改名/切换禁炸');
  }

  /* ---------- 建造规划 ---------- */
  function buildEntry(k){ return BUILD_CATALOG.find(b => b.k === k); }
  function nearestFobDist(p){
    let best = Infinity;
    for (const b of S.builds) if (b.k === 'fob')
      best = Math.min(best, Math.hypot(b.x-p.x, b.y-p.y)*100);
    return best;
  }
  function placeBuild(c){
    const e = buildEntry(S.buildArm); if (!e) return;
    const id = S.seq++;
    S.builds.push({ id, k:e.k, x:c.x, y:c.y, name:e.n });
    if (!e.fob && e.k !== 'fob'){
      const d = nearestFobDist(c);
      if (d > FOB_RADIUS) toast(icon('triangle-alert') + ' 不在任何 FOB 半径内（最近 ' + Math.round(d) + ' m），游戏里放不下');
    }
    S.buildArm = null;
    save(); emit();
  }
  function calcTotals(){
    let units = 0, price = 0, kg = 0;
    for (const [k, q] of Object.entries(S.calcQty)){
      if (!q) continue;
      const e = buildEntry(k); if (!e) continue;
      units += e.s * q;
      price += (e.price || 0) * q;
      kg += (e.k === 'fob' ? 6.5 : e.s * UNIT_KG) * q;
    }
    return { units, price: price + units * UNIT_PRICE, kg };
  }

  /* ---------- 地图交互 ---------- */
  function hitMarker(px, py){
    const list = [];
    if (S.mortar) list.push(['mortar', S.mortar]);
    if ((S.mode==='solve'||S.mode==='correct') && S.target) list.push(['target', S.target]);
    if (S.mode==='correct' && S.impact) list.push(['impact', S.impact]);
    if (S.showMarks) for (const mk of S.marks) list.push([{mark:mk.id}, mk]);
    for (let i=list.length-1; i>=0; i--){
      const p = w2s(list[i][1].x, list[i][1].y);
      if (Math.hypot(p.x-px, p.y-py) <= 13) return list[i][0];
    }
    return null;
  }
  canvas.addEventListener('pointerdown', e => {
    resizeIfNeeded();                     // 布局可能在首绘后变化（组件异步升级等）
    const r = canvas.getBoundingClientRect();
    const px = e.clientX-r.left, py = e.clientY-r.top;
    moved = false;
    const hit = hitMarker(px, py);
    if (hit){ drag = hit; canvas.setPointerCapture(e.pointerId); }
    else { panning = {px, py}; canvas.setPointerCapture(e.pointerId); }
  });
  canvas.addEventListener('pointermove', e => {
    resizeIfNeeded();
    const r = canvas.getBoundingClientRect();
    const px = e.clientX-r.left, py = e.clientY-r.top;
    const w = s2w(px, py);
    if (drag){
      moved = true;
      const c = clampCoord(w);
      if (drag === 'mortar') S.mortar = c;
      else if (drag === 'target') S.target = c;
      else if (drag === 'impact') S.impact = c;
      else if (drag && drag.mark != null){
        const mk = S.marks.find(m => m.id === drag.mark);
        if (mk){ mk.x = c.x; mk.y = c.y; }
      }
      compute(); draw(); save(); emit();
    } else if (panning){
      moved = true;
      S.view.cx -= (px - panning.px)/S.view.scale;
      S.view.cy += (py - panning.py)/S.view.scale;
      panning = {px, py}; draw();
    }
    onCursor(w, px, py);
  });
  /* 指针离开地图：回调 null，前端据此收起坐标浮标 */
  canvas.addEventListener('pointerleave', () => onCursor(null));
  ['pointerup','pointercancel'].forEach(ev => canvas.addEventListener(ev, () => { drag = null; panning = null; }));
  canvas.addEventListener('click', e => {
    resizeIfNeeded();
    if (moved) return;
    const r = canvas.getBoundingClientRect();
    const w = s2w(e.clientX-r.left, e.clientY-r.top);
    if (hitMarker(e.clientX-r.left, e.clientY-r.top)) return;
    const c = clampCoord(w);
    if (S.mode === 'tools'){ handleToolClick(c); draw(); return; }
    if (S.mode === 'build'){ if (S.buildArm) placeBuild(c); draw(); return; }
    if (S.mode !== 'solve' && S.mode !== 'predict' && S.mode !== 'correct') return;
    if (S.mode === 'predict'){
      if (!S.mortar){ S.mortar = c; compute(); draw(); save(); emit(); return; }
      const {dist, az} = solveVector(c.x-S.mortar.x, c.y-S.mortar.y);
      S.predAz = az.toFixed(1); S.predRng = String(Math.round(dist)); S.predMil = '';
      compute(); draw(); save(); emit(); return;
    }
    if (S.put === 'mortar') S.mortar = c;
    else if (S.put === 'target') S.target = c;
    else if (S.put === 'impact') S.impact = c;
    compute(); draw(); save(); emit();
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    resizeIfNeeded();
    const r = canvas.getBoundingClientRect();
    const anchor = s2w(e.clientX-r.left, e.clientY-r.top);
    S.view.scale = Math.max(0.8, Math.min(400, S.view.scale * (e.deltaY < 0 ? 1.2 : 1/1.2)));
    const after = s2w(e.clientX-r.left, e.clientY-r.top);
    S.view.cx += anchor.x - after.x;
    S.view.cy += anchor.y - after.y;
    draw();
  }, {passive:false});
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('resize', () => { lastW = 0; draw(); });

  /* 画布自己盯尺寸。原先只有 window 的 resize 事件会触发重绘，而窗口尺寸没变时
     这个事件根本不发——画布因为别的缘故（右边面板收起、布局变化）改了大小就没人管。
     ResizeObserver 补上这一块，顺带在 observe() 时立刻回调一次兜底首帧；
     真正的主路径是启动时显式那一发 draw()（见 app.js 末尾）——
     以前两边都没有，桌面版开出来就是一张空地图，得手动拖一下窗口才出图。 */
  if (typeof ResizeObserver !== 'undefined'){
    new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      if (Math.round(r.width) === lastW && Math.round(r.height) === lastH) return;
      draw();                       // 尺寸同步交给 draw() 里的 resizeIfNeeded()
    }).observe(canvas);
  }

  /* ---------- 存取 ---------- */
  function save(){
    try { localStorage.setItem(STORE_KEY, JSON.stringify({
      mortar:S.mortar, target:S.target, impact:S.impact, mode:S.mode, mapId:S.mapId,
      weapon:S.weapon, arc:S.arc,
      predAz:S.predAz, predMil:S.predMil, predRng:S.predRng,
      tool:S.tool, ruler:S.ruler, circles:S.circles, rays:S.rays,
      marks:S.marks, showMarks:S.showMarks, theme:S.theme, hist:S.hist.slice(0,60), seq:S.seq,
      route:S.route, polys:S.polys, builds:S.builds, calcQty:S.calcQty
    })); } catch(e){}
  }
  function load(){
    try {
      const sm = localStorage.getItem(SRC_KEY);
      if (sm && SRC_TXT[sm]) S.srcMode = sm;
      const qs = new URLSearchParams(location.search).get('src');
      if (qs && SRC_TXT[qs]) S.srcMode = qs;
      const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!d) return;
      S.mortar = d.mortar || null; S.target = d.target || null; S.impact = d.impact || null;
      if (d.predAz != null) S.predAz = d.predAz;
      if (d.predMil != null) S.predMil = d.predMil;
      if (d.predRng != null) S.predRng = d.predRng;
      if (d.az != null) S.predAz = d.az;         // 兼容网页版旧档
      if (d.mil != null) S.predMil = d.mil;
      if (d.rng != null) S.predRng = d.rng;
      if (d.weapon && WEAPONS.some(w => w.id === d.weapon)) S.weapon = d.weapon;
      if (d.arc) S.arc = d.arc;
      enforceArc();
      if (d.mapId && MAPS[d.mapId]) S.mapId = d.mapId;
      if (d.tool) S.tool = d.tool;
      if (d.ruler) S.ruler = d.ruler;
      if (Array.isArray(d.circles)) S.circles = d.circles;
      if (Array.isArray(d.rays)) S.rays = d.rays;
      if (Array.isArray(d.marks)) S.marks = d.marks;
      if (d.showMarks != null) S.showMarks = d.showMarks;
      if (d.theme) S.theme = d.theme;
      if (Array.isArray(d.hist)) S.hist = d.hist;
      if (d.route && Array.isArray(d.route.pts)) S.route = d.route;
      if (Array.isArray(d.polys)) S.polys = d.polys;
      if (Array.isArray(d.builds)) S.builds = d.builds;
      if (d.calcQty && typeof d.calcQty === 'object') S.calcQty = d.calcQty;
      if (d.seq) S.seq = d.seq;
      if (d.mode && ['solve','predict','correct','tools','intel','build','table','settings'].includes(d.mode))
        S.mode = d.mode;
    } catch(e){}
  }
  function logShot(txt){
    S.hist.unshift({ t:Date.now(), map:MAP().name, txt });
    if (S.hist.length > 60) S.hist.length = 60;
  }

  load();
  resize(); fitMap(); compute();

  return {
    /* w2s/s2w/tileBox/tileZoom 导出是为了让 scripts/test_map.js 能拿着渲染层
       自己的输出反查世界坐标——那条断言要能抓住「瓦片铺错范围」，就不能
       在测试里把投影公式再抄一遍。 */
    S, MAP, MAPS, draw, fitMap, resize, run, compute, save,
    w2s, s2w, tileBox, tileZoom,
    setMap(id){ S.mapId = id; tileFail = 0; tileOk = 0; fitMap(); draw(); save(); emit(); },
    weapon(){ return W(); },
    arc(){ return ARC(); },
    setWeapon(id){
      if (!WEAPONS.some(w => w.id === id)) return;
      S.weapon = id; enforceArc();
      run(false);
    },
    setArc(key){
      const w = W();
      if (!w.arcs.some(a => a.key === key)) return;
      S.arc = key;
      run(false);
    },
    setSrcMode(m){
      S.srcMode = m;
      try { localStorage.setItem(SRC_KEY, m); } catch(e){}
      for (const mm of Object.values(MAPS)) delete probe[mm.id];
      tileFail = 0; tileOk = 0; lastW = 0;
      draw(); emit();
    },
    setPrefetch,
    tileStat(){
      const p = probe[MAP().id];
      const name = IS_TAURI ? '本地缓存 + 在线兜底'
        : p === 'local' ? '本地离线' : p === 'cdn' ? '在线 CDN' : p === 'pending' ? '检测中…' : '待检测';
      return { name, tileOk, tileFail };
    },
    toggle(key){ S[key] = !S[key]; draw(); save(); emit(); },
    setMode(m){ S.mode = m; S.predPoint = null; if (['solve','predict','correct'].includes(m)) S.put = 'mortar'; save(); emit(); },
    handleToolClick, closePoly, placeBuild, nearestFobDist, calcTotals, buildEntry,
    logShot, exportJSON(){
      return JSON.stringify({ version:4, exported:new Date().toISOString(), mapId:S.mapId,
        mortar:S.mortar, target:S.target, impact:S.impact,
        marks:S.marks, circles:S.circles, rays:S.rays, route:S.route, polys:S.polys,
        builds:S.builds, calcQty:S.calcQty, hist:S.hist }, null, 1);
    },
    importJSON(txt){
      const d = JSON.parse(txt); // throws
      if (Array.isArray(d.marks))   S.marks   = d.marks;
      if (Array.isArray(d.circles)) S.circles = d.circles;
      if (Array.isArray(d.rays))    S.rays    = d.rays;
      if (Array.isArray(d.hist))    S.hist    = d.hist;
      if (d.route && Array.isArray(d.route.pts)) S.route = d.route;
      if (Array.isArray(d.polys))   S.polys   = d.polys;
      if (Array.isArray(d.builds))  S.builds  = d.builds;
      if (d.calcQty && typeof d.calcQty === 'object') S.calcQty = d.calcQty;
      if (d.mortar){ S.mortar = d.mortar; S.target = d.target || S.target; S.impact = d.impact || S.impact; }
      compute(); draw(); save(); emit();
    },
    wipe(){
      S.marks = []; S.circles = []; S.rays = []; S.hist = []; S.ruler = {a:null,b:null};
      S.route = { pts:[] }; S.polys = []; S.polyDraft = null;
      S.builds = []; S.calcQty = {}; S.buildArm = null;
      try { localStorage.removeItem(STORE_KEY); } catch(e){}
      compute(); draw(); emit();
    },
    screenshot(){
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `wardogs-${S.mapId}-${new Date().toISOString().slice(0,16).replace(/[:T]/g,'')}.png`;
      a.click();
    },
    cursor: null, // UI 可写入光标世界坐标
  };
}
