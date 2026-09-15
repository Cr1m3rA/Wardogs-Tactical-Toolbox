/* 下载进度条正文。被 test_download.js 追加到 app.js 副本末尾，
   在模块作用域里跑，可以直接用 E / $ / render / renderPanel。
   全文是 async 的——IPC 回包、事件派发都要等一个微任务回合。

   用户报的原话：「下载时点击取消进度条会卡住一会，然后才消失」。
   拆开看是两个独立的毛病，这里各钉一条：
     1. 界面在等 Rust 回话——回话没到，进度条就僵在那儿；
     2. 取消之后 runQueue 还会接着把下一张图下起来，进度条反而重新开始。 */

/* 假 Tauri 桥挂在 window 上（模块作用域里没有它的词法绑定），先取个短名字 */
var TT = window.__TT;

var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
function ck(c, cond, extra){ window.__R.push((cond ? 'PASS' : 'FAIL') + ' | ' + c + (extra ? ' | ' + extra : '')); }

/* 进度事件是异步派发的，发完给两轮微任务 + 一个宏任务再断言 */
async function settle(){ await sleep(0); await sleep(0); await sleep(20); }

/* 面板每次重渲染都是整块 innerHTML 重建，Shoelace 组件要等 Lit 的更新微任务跑完
   才挂上内部 <button>。此时直接调 el.click() 会撞上 this.button === null，
   所以点之前先让出一回合——真实用户点的是鼠标事件，没有这个问题。 */
async function clickEl(sel){
  await settle();
  var el = document.querySelector(sel);
  if (!el) throw new Error('找不到元素 ' + sel + '（面板内容：' + $('panel').textContent.slice(0, 60) + '）');
  el.click();
}

function jobPayload(o){
  return Object.assign({
    id: 'job-1', map: 'bakurani', done: 0, total: 1365, failed: 0, bytes: 0,
    rate: 0, paused: false, finished: false, cancelled: false,
  }, o);
}

/* ---------- 前置 ---------- */
E.S.mode = 'settings';
render();
await settle();
render();
ck('地图数据卡片出来了（假 Tauri 生效）', !!document.querySelector('#mdStd'),
   TT.calls.join(','));

/* ---------- 1. 起任务 → 进度条出现 ---------- */
await clickEl('#mdStd');
await settle();
render();
ck('download_start 发了一次', TT.starts === 1, 'starts=' + TT.starts);

TT.emit('dl-progress', jobPayload({ done: 100, bytes: 3e6, rate: 50 }));
await settle();
render();
ck('下载中显示进度条', !!document.querySelector('#mdCancel'));
ck('进度条带暂停/取消两个按钮', !!document.querySelector('#mdPause') && !!document.querySelector('#mdCancel'));
ck('进度条显示已下张数', /100/.test($('panel').textContent), '');

/* ---------- 2. 暂停 → 按钮文案跟着变 ---------- */
TT.emit('dl-progress', jobPayload({ done: 100, bytes: 3e6, rate: 0, paused: true }));
await settle();
render();
var pb = document.querySelector('#mdPause');
ck('暂停后按钮变「继续」', !!pb && /继续/.test(pb.textContent), pb && pb.textContent);
TT.emit('dl-progress', jobPayload({ done: 100, bytes: 3e6, rate: 50, paused: false }));
await settle();
render();

/* ---------- 3. 点取消：不等 Rust 回话，界面自己先撤 ----------
   把 download_cancel 挂成永不回话，模拟一次慢 IPC。
   老代码只发命令、不动 JOB，进度条会一直僵着等回包；新代码在点击那一刻
   就把 JOB 清掉，所以这里必须已经看不到进度条了。 */
TT.hold['download_cancel'] = true;
await clickEl('#mdCancel');
render();                                   /* 相当于「下一帧到了」 */
ck('取消命令确实发出去了', TT.calls.indexOf('download_cancel') >= 0);
ck('IPC 还没回话，进度条就已经撤掉', !document.querySelector('#mdCancel'));
ck('取消后不留「已结束」占位', !/已结束/.test($('panel').innerHTML));

/* 取消命令送达 Rust 之前，进度线程还会推一帧「取消前」的旧数据出来
   （它读到取消标志和 emit 在同一轮循环里，中间隔着几十毫秒）。
   这一帧要是照单收下，进度条就会闪回来一次，再等一帧才真消失。 */
TT.emit('dl-progress', jobPayload({ done: 110, bytes: 3.3e6, rate: 45 }));
await settle();
render();
ck('取消前发出的旧帧不会把进度条闪回来', !document.querySelector('#mdCancel'));

/* ---------- 4. 取消回包到达：不许把进度条放回来，也不许续下下一张 ---------- */
TT.emit('dl-progress', jobPayload({ done: 120, bytes: 3.6e6, finished: true, cancelled: true }));
await settle();
render();
ck('取消回包不会让进度条复活', !document.querySelector('#mdCancel'));
ck('取消后不再自动开始下一张图', TT.starts === 1, 'starts=' + TT.starts);
TT.hold['download_cancel'] = false;

/* ---------- 5. 正常下完：进度条同样撤掉，但要接着下一张 ---------- */
await clickEl('#mdStd');
await settle();
render();
ck('上一张结束后可以再起任务', TT.starts === 2, 'starts=' + TT.starts);

TT.emit('dl-progress', jobPayload({ id: 'job-2', map: 'bakurani', done: 900, total: 1365, bytes: 3e7, rate: 90 }));
await settle();
render();
ck('第二张图进度条出现', !!document.querySelector('#mdCancel'));

TT.emit('dl-progress', jobPayload({ id: 'job-2', map: 'bakurani', done: 1365, total: 1365, bytes: 4.6e7, rate: 0, finished: true }));
await settle();
render();
ck('下完后进度条撤掉，不留「已结束」',
   !document.querySelector('#mdCancel') && !/已结束/.test($('panel').innerHTML));
ck('下完后自动接着下一张图（没被取消逻辑误伤）', TT.starts === 3, 'starts=' + TT.starts);
