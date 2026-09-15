/* =====================================================================
 * 假 Tauri 桥（测试专用，生成物 app/renderer/_fake_tauri.js 的来源）
 * ---------------------------------------------------------------------
 * 为什么要有：下载取消那条链路的前端部分（进度条何时出现、何时撤掉、
 * 取消后还会不会再起下一张图）全在 desktop.js 里，而 desktop.js 的每个
 * 分支都以 IS_TAURI 开头——网页版直接退化成空操作，一个字都测不到。
 *
 * 这里就在模块加载【之前】把 __TAURI_INTERNALS__ 装上，让 IS_TAURI 为真，
 * 再由测试自己 emit 'dl-progress' 来驱动界面。stub 的形状照着 Tauri 真实
 * 实现来：transformCallback 存回调返回 id，emit 时按 id 把事件派发回去。
 *
 * 【能测的】进度条的显隐时机、取消后不再续下、暂停态文案、IPC 是否真的发了。
 * 【测不到的】Rust 侧的分片睡眠、取消标志什么时候被看到——那要起真进程。
 * ===================================================================== */
(function () {
  var callbacks = {}, nextCb = 1, nextEvt = 1, listeners = {};

  var TT = {
    calls: [],          // 收到的所有 IPC 命令名，用来断言「该发的发了」
    starts: 0,          // download_start 次数
    hold: {},           // cmd -> true：该命令永不回话，用来模拟 IPC 延迟
    emit: function (name, payload) {
      (listeners[name] || []).slice().forEach(function (p) {
        try { p[1]({ event: name, id: p[0], payload: payload }); }
        catch (e) { window.__ERR = 'listen 回调抛异常: ' + e.message; }
      });
    },
  };
  window.__TT = TT;

  /* 三张图都当作「z0–z5 已下满」，这样卡片会走完整分支而不是「正在读取磁盘…」 */
  var STATS = ['bakurani', 'ozeti', 'zestafona'].map(function (id) {
    return {
      id: id, have: 1365, total: 1365, bytes: 46 * 1024 * 1024,
      zooms: [0, 1, 2, 3, 4, 5, 6, 7].map(function (z) {
        return { z: z, have: z <= 5 ? (1 << z) * (1 << z) : 0, total: (1 << z) * (1 << z) };
      }),
    };
  });

  window.__TAURI_INTERNALS__ = {
    transformCallback: function (cb) { var id = nextCb++; callbacks[id] = cb; return id; },
    invoke: function (cmd, args) {
      TT.calls.push(cmd);
      if (TT.hold[cmd]) return new Promise(function () {});   // 永不 resolve
      switch (cmd) {
        case 'plugin:event|listen': {
          var id = nextEvt++;
          (listeners[args.event] = listeners[args.event] || []).push([id, callbacks[args.handler]]);
          return Promise.resolve(id);
        }
        case 'plugin:event|unlisten': {
          listeners[args.event] = (listeners[args.event] || []).filter(function (p) {
            return p[0] !== args.eventId;
          });
          return Promise.resolve();
        }
        case 'get_settings':
          return Promise.resolve({ tileDir: 'D:\\WardogsArtillery\\tiles',
                                   defaultTileDir: 'D:\\WardogsArtillery\\tiles',
                                   exeDir: 'D:\\WardogsArtillery' });
        case 'tile_stats':  return Promise.resolve(STATS);
        case 'download_start': TT.starts++; return Promise.resolve('job-' + TT.starts);
        default:            return Promise.resolve(null);   // dl_probe/pause/resume/cancel/open_dir
      }
    },
  };
})();
