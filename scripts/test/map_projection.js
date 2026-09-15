/* ===== 底图投影断言正文 =====
   由 scripts/test_map.js 注入两个页面执行。运行环境里必须有：
     window.__MAPAPI = { maps, setMap, s2w, box, zoom, redraw }
   页面必须已经装好 scripts/test_map.js 里的假瓦片钩子（window.__TILEPROBE）。

   为什么这么测：这个 bug（整张底图被放大 1.486 倍并平移）肉眼一眼就能看出来，
   但任何「把坐标算一遍」的断言都抓不住它——标点、网格、圆圈全都自洽，
   错的只有底图。所以这里不看代码，看渲染层【真正交给 drawImage 的矩形】，
   再把它反算回世界坐标，和瓦片金字塔的定义比。
   断言里的期望值是从金字塔定义手推的常数，不是从被测代码里读的。 */

var API = window.__MAPAPI;
var PROBE = window.__TILEPROBE;

function ck(name, cond, extra){ window.__R.push((cond?'PASS':'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); }

var maps = API.maps();
var ids = Object.keys(maps);
ck('地图数据非空', ids.length > 0, ids.join(','));

for (var i = 0; i < ids.length; i++){
  var id = ids[i], m = maps[id];
  var TB = API.box(m), b = m.bounds;

  ck(id + ' 有 tileBounds', !!TB);
  if (!TB) continue;

  /* 瓦片金字塔必须是正方形：它铺满的是整个世界，不是可玩区那个矩形。
     bounds 加上斜切/长条是可玩区形状，拿它当瓦片范围本身就会长宽不等。 */
  ck(id + ' tileBounds 是正方形',
     Math.abs((TB.maxX-TB.minX) - (TB.maxY-TB.minY)) < 1e-9,
     (TB.maxX-TB.minX).toFixed(2) + ' x ' + (TB.maxY-TB.minY).toFixed(2));

  ck(id + ' tileBounds 包含可玩区 bounds',
     TB.minX <= b.minX && TB.maxX >= b.maxX && TB.minY <= b.minY && TB.maxY >= b.maxY,
     'bounds=' + [b.minX,b.minY,b.maxX,b.maxY].join(',') + ' tileBounds=' + [TB.minX,TB.minY,TB.maxX,TB.maxY].join(','));

  /* ---------- 核心：底图到底铺在哪 ---------- */
  API.setMap(id);
  /* 拉远一点再采样：默认视野在窄画布上可能只铺得下同一列瓦片，
     那样「格宽」这项就没被验到，只剩原点。 */
  API.zoom(2);
  var rects = PROBE.capture();          // 采一帧，返回 [{z,tx,ty,sx,sy}]

  ck(id + ' 采到了瓦片绘制调用', rects.length > 0, rects.length + ' 块');

  var txSeen = {}, bad = null, badN = 0;
  for (var k = 0; k < rects.length; k++){
    var r = rects[k];
    var span = (TB.maxX - TB.minX) / Math.pow(2, r.z);   // 该层级一格的世界宽度
    var w = API.s2w(r.sx, r.sy);                          // 屏幕左上角 → 世界坐标
    var ex = TB.minX + r.tx * span;                       // 金字塔定义：第 tx 格的左边界
    var ey = TB.maxY - r.ty * span;                       // 第 ty 格的上边界（y 轴向北）
    var dx = Math.abs(w.x - ex), dy = Math.abs(w.y - ey);
    txSeen[r.tx] = 1;
    if (dx > 1e-6 || dy > 1e-6){
      badN++;
      if (!bad || dx + dy > bad.dx + bad.dy)
        bad = { dx: dx, dy: dy, s: 'z' + r.z + ' 瓦片(' + r.tx + ',' + r.ty + ') 左边界 ' + w.x.toFixed(3)
                + ' 应为 ' + ex.toFixed(3) + '，上边界 ' + w.y.toFixed(3) + ' 应为 ' + ey.toFixed(3) };
    }
  }
  ck(id + ' 瓦片网格落在 tileBounds 上（原点与格宽都对）', badN === 0,
     badN ? badN + '/' + rects.length + ' 块错位，最大 ' + bad.s : '');

  /* 只对上一块的左边界是不够的：万一只铺了一块、或者 tx 恰好都相同，
     「格宽」那部分就没被验到（原点错和格宽错是两回事）。至少要横跨两列。 */
  ck(id + ' 采集覆盖到多列瓦片（格宽真的被验到了）', Object.keys(txSeen).length >= 2,
     '涵盖 ' + Object.keys(txSeen).length + ' 列');
}

/* 收工：视图恢复默认，免得影响同一页面里后面的断言 */
API.setMap(ids[0]);
