/* 桌面版自检正文。被 _selftest_desktop.js 追加到 app.js 副本末尾，
   在模块作用域里运行，可以直接用 E / CW / CA / milAt / weaponBar 等绑定。
   注意：面板渲染走 render()，其中 renderPanel() 会跳过正在输入的表单，
   所以这里直接调 viewSolve()/viewTable() 取 HTML，避免依赖焦点状态。 */
/* 启动阶段的绘制次数，必须在【本文件第一句】取。
   正文自己要调一堆 E.compute()/E.draw()，晚一步取就全混在一起了——
   resizes 一并记下，好确认这个数不是靠一次 resize 事件凑出来的。 */
var BOOT_DRAWS = window.__draws, BOOT_RESIZES = window.__resizes;

var S = E.S;
ck('武器数=2', WEAPONS.length === 2, WEAPONS.map(w => w.id).join(','));
ck('默认武器=mortar', CW().id === 'mortar', CW().id);
ck('默认弹道弧=single', CA().key === 'single', CA().key);

/* --- 迫击炮回归 --- */
E.setWeapon('mortar');
S.mortar = { x: 80, y: 70 }; S.target = { x: 83.6, y: 72.8 };
E.compute();
var rs = S.results.solve;
ck('迫击炮有解', !!rs && !rs.err && rs.arcs.length === 1, rs && rs.err);
ck('迫击炮密位在合理区间', rs && rs.milR > 100 && rs.milR < 950, rs && ('milR=' + rs.milR));
ck('迫击炮不显示弹道切换', !/data-arc=/.test(weaponBar()));
ck('迫击炮射表 84 档', /84 档/.test(viewTable()), '');

/* --- 切到 SPH-2 --- */
E.setWeapon('spg');
ck('切武器后 weapon=spg', CW().id === 'spg');
ck('切武器后 arc 回落到 low', CA().key === 'low', CA().key);
ck('SPH-2 显示双弹道切换', /data-arc="low"/.test(weaponBar()) && /data-arc="high"/.test(weaponBar()));

/* --- 单解区 1000 m：只有高弹道 --- */
S.mortar = { x: 80, y: 70 }; S.target = { x: 90, y: 70 };   // 10 单位 = 1000 m
E.setArc('high'); E.compute();
var r1 = S.results.solve;
ck('1000m 只有 1 条弹道', r1.arcs.length === 1, r1.arcs.map(a => a.key).join('+'));
ck('1000m 高弹道 1340 密位', Math.abs(r1.milR - 1340) <= 1, 'milR=' + r1.milR);
ck('1000m 提示只有高弹道', /只有高弹道/.test(r1.stTxt), r1.stTxt.slice(0, 40));

/* --- 双解区 1500 m：两条都有 --- */
S.target = { x: 95, y: 70 };                                 // 15 单位 = 1500 m
E.setArc('low'); E.compute();
var r2 = S.results.solve;
ck('1500m 有 2 条弹道', r2.arcs.length === 2, r2.arcs.map(a => a.key).join('+'));
ck('1500m 低弹道 84 密位', Math.abs(r2.milR - 84) <= 1, 'milR=' + r2.milR);
ck('1500m 高弹道 1213 密位', Math.abs(r2.arcs.find(a => a.key === 'high').milR - 1213) <= 1);
ck('1500m 提示两条都有解', /两条弹道都有解/.test(r2.stTxt));
ck('1500m 双解面板出现在 HTML', /data-arc-pick="high"/.test(solveResult(r2)));
ck('1500m 选中项是低弹道', r2.arcs.find(a => a.key === 'low').selected === true);
E.setArc('high'); E.compute();
ck('切到高弹道后 selected 跟着走', S.results.solve.arcs.find(a => a.key === 'high').selected === true);
ck('切到高弹道后 milR=1213', Math.abs(S.results.solve.milR - 1213) <= 1);
ck('切到高弹道后口令含 1213', /1213/.test(S.results.solve.cmd), S.results.solve.cmd);

/* --- 射程边界 --- */
E.setArc('low');
S.target = { x: 85, y: 70 }; E.compute();                    // 500 m < 780
ck('500m 报太近', S.results.solve.stCls === 'bad' && /太近了/.test(S.results.solve.stTxt));
S.target = { x: 110, y: 70 }; E.compute();                   // 3000 m > 2629
ck('3000m 报太远', S.results.solve.stCls === 'bad' && /太远了/.test(S.results.solve.stTxt));

/* --- 推落点走的是选中弹道弧 --- */
S.mortar = { x: 80, y: 70 }; S.target = { x: 95, y: 70 };
E.setArc('low'); S.predAz = '90'; S.predMil = '84'; S.predRng = '';
E.compute();
var rp1 = S.results.predict;
ck('推落点(低弹道 84) 射程≈1500', Math.abs(rp1.dist - 1500) < 20, 'dist=' + Math.round(rp1.dist));
S.predMil = '1213'; E.setArc('high'); E.compute();
var rp2 = S.results.predict;
ck('推落点(高弹道 1213) 射程≈1500', Math.abs(rp2.dist - 1500) < 20, 'dist=' + Math.round(rp2.dist));
ck('两条弹道落点相同（同一目标）', Math.abs(rp1.dist - rp2.dist) < 20);

/* 把低弹道的密位喂给高弹道：超出该表量程，必须给出提示而不是静默取端点 */
S.predMil = '84'; E.setArc('high'); E.compute();
ck('密位超出弹道量程时报警', S.results.predict.stCls !== 'ok',
   S.results.predict.stCls + ' / ' + S.results.predict.stTxt.slice(0, 50));
S.predMil = '1213'; E.setArc('low'); E.compute();
ck('高弹道密位喂给低弹道也报警', S.results.predict.stCls !== 'ok',
   S.results.predict.stTxt.slice(0, 50));

/* --- 修偏差用的是当前武器 --- */
E.setArc('low');
S.mortar = { x: 80, y: 70 }; S.target = { x: 95, y: 70 }; S.impact = { x: 93, y: 70 };
E.compute();
ck('修偏差 目标 1500m 得 84 密位', Math.abs(S.results.correct.mil - 84) <= 1, 'mil=' + S.results.correct.mil);

/* --- 射表随武器/弹道切换 --- */
E.setWeapon('mortar');
ck('迫击炮射表标题', /L81 迫击炮 完整射表/.test(viewTable()));
E.setWeapon('spg');
ck('SPH-2 低弹道射表 59 档', /59 档/.test(viewTable()));
E.setArc('high');
ck('SPH-2 高弹道射表 79 档', /79 档/.test(viewTable()));
ck('高弹道表尾是 2629m/610mil', /<td>2629<\/td><td>610<\/td>/.test(viewTable()));

/* --- 密位方向提示 --- */
ck('高弹道提示 密位调小', /调小/.test(milHint()));
E.setArc('low');
ck('低弹道提示 密位调大', /调大/.test(milHint()));

/* --- 情报视图不写死 L81 射程 --- */
E.setWeapon('spg');
var intelHtml = viewIntel();
ck('情报页射程随武器', /2629/.test(intelHtml) && !/132–684/.test(intelHtml));

/* --- 持久化 --- */
E.setWeapon('spg'); E.setArc('high'); E.save();
var raw = JSON.parse(localStorage.getItem('wardogs-mortar-map-v1'));
ck('存档含 weapon/arc', raw.weapon === 'spg' && raw.arc === 'high',
   JSON.stringify({ w: raw.weapon, a: raw.arc }));

/* --- 指针坐标浮标 ---
   用户报过两个症状：「悬浮窗光标不带坐标」和「浅色模式下完全看不清」。
   根因是同一个——底色写死成深色、文字用 var(--ink)，而浅色主题下 --ink
   本身就是深色，于是深字压深底，整个浮标等于隐形（悬浮窗那边看起来就像
   「没有坐标」）。所以这里把两种主题下的对比度都钉死。 */
function lum(c){
  var m = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(function(v){
    v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
}
function ratio(a, b){
  var l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

var tip = document.querySelector('.cursor-tip');
ck('坐标浮标已创建', !!tip);
ck('浮标挂在当前画布的父元素里', !!tip && tip.parentElement === canvas.parentElement);

canvas.dispatchEvent(new PointerEvent('pointermove', {clientX: 120, clientY: 120, bubbles: true}));
ck('指针移动后浮标出现', !!tip && !tip.hidden);
ck('浮标带 X/Y 坐标', !!tip && /X\s-?[\d.]+/.test(tip.textContent) && /Y\s-?[\d.]+/.test(tip.textContent),
   tip && tip.textContent);
canvas.dispatchEvent(new PointerEvent('pointerleave', {bubbles: true}));
ck('指针离开后浮标收起', !!tip && tip.hidden);

var wasLight = document.body.classList.contains('light');
document.body.classList.remove('light');
var dr = ratio(getComputedStyle(tip).backgroundColor, getComputedStyle(tip).color);
document.body.classList.add('light');
var lr = ratio(getComputedStyle(tip).backgroundColor, getComputedStyle(tip).color);
if (!wasLight) document.body.classList.remove('light');
ck('浮标深色主题对比度 >=4.5', dr >= 4.5, dr.toFixed(2) + ':1');
ck('浮标浅色主题对比度 >=4.5', lr >= 4.5, lr.toFixed(2) + ':1');

/* 悬浮窗走的是另一张画布（#mapOv）和另一套布局，主窗跑绿不代表悬浮窗没问题 */
if (isOverlay){
  ck('悬浮窗浮标挂在 #hudMap', tip.parentElement.id === 'hudMap', tip.parentElement.id);
  ck('悬浮窗地图下拉已填充', document.querySelectorAll('#hudMapSel sl-option').length === 3,
     document.querySelectorAll('#hudMapSel sl-option').length + ' 项');
} else {
  ck('主窗浮标挂在 #mapWrap', tip.parentElement.id === 'mapWrap', tip.parentElement.id);
  ck('主窗地图下拉已填充', document.querySelectorAll('#mapSel sl-option').length === 3,
     document.querySelectorAll('#mapSel sl-option').length + ' 项');
}

/* --- 点按钮后界面要立刻跟上（用户报「切自行火炮/迫击炮要过一会儿才切过去」） ---
   #panel 曾经挂着一个 focusin → typing=true 的守卫，本意是「用户正在输入框里
   打字时别重建面板，免得光标乱跳」。但浏览器点击 <button> 时同样会先把焦点
   给按钮，focusin 一样冒泡到 #panel——于是紧接着的 renderPanel() 直接 return，
   面板停在旧内容上，要等焦点离开面板才刷新。
   表现就是「状态早就切好了，界面迟迟不动」，看着像卡顿。
   注意：不能只断言面板里出现了 SPH-2 —— 武器条两个按钮一直都在，
   光看文本必然通过。必须看哪一个是选中态。 */
if (!isOverlay){
  E.setWeapon('mortar'); E.setMode('solve'); renderPanel();
  var wpn = document.querySelector('#panel [data-wpn="spg"]');
  ck('面板里有切换武器按钮', !!wpn);
  if (wpn){
    wpn.focus();                       /* 模拟点击时浏览器给按钮的焦点 */
    ck('按钮拿到焦点不算「正在输入」', !panelTyping());
    E.setWeapon('spg'); renderPanel();
    var sel = document.querySelector('#panel [data-wpn].on');
    ck('切武器后面板立刻刷新且 SPH-2 选中',
       !!sel && sel.dataset.wpn === 'spg', '当前选中=' + (sel ? sel.textContent : '无'));
    ck('切武器后弹道切换条跟着出现', !!document.querySelector('#panel [data-arc="high"]'));
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    E.setWeapon('mortar'); renderPanel();
  }
  /* 守卫本身还得在：真的聚焦输入框时依然不能重建，否则打字时光标会跳 */
  var probe = document.createElement('textarea');
  $('panel').appendChild(probe);
  probe.focus();
  ck('聚焦面板内的输入框算「正在输入」', panelTyping());
  probe.remove();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  /* 内容没变时不做无谓重建 */
  var before = $('panel').firstElementChild;
  renderPanel();
  ck('面板内容未变时不重建 DOM', $('panel').firstElementChild === before);
}

/* --- 启动就得自己把地图画出来 ---
   引擎原先只在 window 的 resize 事件里 draw()，而窗口尺寸没变时这个事件根本不发；
   app.js 的启动又只调 render()（那是 DOM，不含画布）。两边一凑，
   桌面版开出来就是一张空地图，非得手动拖一下窗口才出图。
   这里的 __draws 是测试页在最前面挂的 clearRect 探针，数的是真实绘制次数。 */
ck('启动阶段自己画过地图（不靠 resize 事件）', BOOT_DRAWS > 0,
   'boot draws=' + BOOT_DRAWS + ' resizes=' + BOOT_RESIZES);

ck('无 JS 异常', !window.__ERR, window.__ERR || '');
