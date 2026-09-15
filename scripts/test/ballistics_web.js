/* 临时自检脚本正文（由 scripts/_selftest.js 注入到 mortar-map.html 的副本里）。
   验证 SPH-2 接入后：双弹道选择、单解/双解判定、射表随武器切换、持久化往返。
   跑完即删，不入库。 */
window.__R = [];
function ck(name, cond, extra){ window.__R.push((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); }
/* 必须走输入框：run() 开头会 readStateFromInputs()，直接改 S 会被清空覆盖 */
function setPt(mx, my, tx, ty){
  $('mx').value = mx; $('my').value = my;
  $('tx').value = tx; $('ty').value = ty;
  run();
}
/* 只改目标（炮位不动），方便连着测好几个距离 */
function setTgt(tx, ty){ $('tx').value = tx; $('ty').value = ty; run(); }
try {
  ck('武器数=2', WEAPONS.length === 2, WEAPONS.map(w => w.id).join(','));
  ck('默认武器=mortar', S.weapon === 'mortar', S.weapon);

  /* --- 迫击炮回归：改武器参数化之前的老数值不能坏 --- */
  S.weapon = 'mortar'; enforceArc();
  setPt(80, 70, 83.6, 72.8);
  ck('迫击炮出结果', /密位/.test($('out-solve').innerHTML));
  ck('迫击炮不显示弹道切换', !/data-arc=/.test(weaponBar()));

  /* --- 切到 SPH-2 --- */
  setWeapon('spg');
  ck('切武器后 S.weapon=spg', S.weapon === 'spg');
  ck('切武器后 arc 回落到 low', ARC().key === 'low', S.arc);
  ck('SPH-2 显示双弹道切换', /data-arc="low"/.test(weaponBar()) && /data-arc="high"/.test(weaponBar()));

  /* --- 单解区：1000 m 只有高弹道 --- */
  setPt(80, 70, 90, 70);   // 10 单位 = 1000 m
  setArc('high');
  var h1 = $('out-solve').innerHTML;
  ck('1000m 高弹道 1340 密位', /1340/.test(h1));
  ck('1000m 提示只有高弹道', /只有高弹道/.test(h1));

  /* --- 双解区：1500 m 两条都有 --- */
  setTgt(95, 70);                                              // 15 单位 = 1500 m
  setArc('low');
  var h2 = $('out-solve').innerHTML;
  ck('1500m 低弹道 84 密位', /84/.test(h2));
  ck('1500m 双解面板出现', /data-arc-pick="high"/.test(h2));
  ck('1500m 提示两条都有解', /两条弹道都有解/.test(h2));
  setArc('high');
  ck('1500m 高弹道 1213 密位', /1213/.test($('out-solve').innerHTML));

  /* --- 射程边界 --- */
  setArc('low'); setTgt(85, 70);                               // 500 m，低于 SPH-2 最小射程
  ck('500m 报太近', /太近了/.test($('out-solve').innerHTML));
  setTgt(110, 70);                                             // 3000 m，超程
  ck('3000m 报太远', /太远了/.test($('out-solve').innerHTML));

  /* --- 射表随武器/弹道切换 --- */
  setWeapon('mortar'); renderTable();
  ck('迫击炮射表 84 档', /84 档/.test($('tblTitle').textContent), $('tblTitle').textContent);
  setWeapon('spg'); renderTable();
  ck('SPH-2 低弹道射表 59 档', /59 档/.test($('tblTitle').textContent), $('tblTitle').textContent);
  setArc('high'); renderTable();
  ck('SPH-2 高弹道射表 79 档', /79 档/.test($('tblTitle').textContent), $('tblTitle').textContent);
  ck('射表首行=735m/1400mil（已翻转为距离升序）', /<td>735<\/td><td>1400<\/td>/.test($('tblBody').innerHTML));

  /* --- 密位方向提示不能被写死 --- */
  ck('高弹道提示 密位调小', /调小/.test(milHint()));
  setArc('low');
  ck('低弹道提示 密位调大', /调大/.test(milHint()));

  /* --- 持久化往返 --- */
  setWeapon('spg'); setArc('high'); save();
  var raw = JSON.parse(localStorage.getItem('wardogs-mortar-map-v1'));
  ck('存档含 weapon/arc', raw.weapon === 'spg' && raw.arc === 'high',
     JSON.stringify({ w: raw.weapon, a: raw.arc }));

  ck('页面无 JS 异常', !window.__ERR, window.__ERR || '');
} catch (e) {
  window.__R.push('FAIL | 抛异常 | ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
}
var out = document.createElement('pre');
out.id = '__result';
out.textContent = window.__R.join('\n');
document.body.append(out);
