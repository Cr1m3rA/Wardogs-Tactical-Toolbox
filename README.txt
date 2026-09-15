WARDOGS 战术工具箱（离线版）
=====================================

! 本文件是早期说明，最新文档看 README.md（含桌面版悬浮窗 + 开源说明）

这个目录里有什么
----------------
  mortar-map.html            战术工具箱（迫击炮诸元 + 测距标绘 + 情报 + 射表
                             + 建造规划：建材计算器 / FOB 60m 半径规划器）
  mortar-calculator.html     纯坐标版计算器（不依赖底图，双击即用）
  app\                       Electron 桌面版（游戏内悬浮窗 Alt+X，强制云端地图，
                             不碰游戏内存，详见 README.md）
  tiles\                     底图瓦片，目录结构 tiles/<地图>/zoom_<z>/<x>_<y>.webp
  scripts\                   下载脚本 / 完整性校验 / 清单生成器
  download_tiles.cmd         一键续传下载（用 aria2）
  serve.cmd                  起一个本地服务器看地图（推荐）

功能一览（mortar-map.html，v3 共 8 个页签）
---------------------------
  算诸元 / 推落点 / 修偏差    迫击炮三模式，坐标粘贴 + 地图点选 + 拖动微调
                              （目标落入禁炸区自动 🚫 报警）
  工具                        测距尺 · 半径圈 · 方位线 · 标记 · 路线规划(分段+总长)
                              · 多边形禁炸区(点起点圆圈闭合，可开关禁炸)
  情报                        出生点决策矩阵 · 炮位推荐(按可架设+射程排序,一键设炮)
                              · 打击范围分析 · 地标速查
  建造                        23 种建筑建材计算器(托盘/花费/重量,含防空塔等模板)
                              · 地图规划器(FOB 蓝圈,圈外建筑标红 ⚠圈外)
  射表                        L81 完整 84 档，输入距离或密位反查高亮
  设置                        夜间模式 · 数据备份(JSON 导出/导入) · 战斗记录
  地图工具条                  三图切换 · 网格 · 地标 · 标记显隐 · 整图 · PNG截图
                              · 底图 自动/本地/在线（支持 ?src=cdn 参数强制）

地图与坐标地址（自己下载用）
-----------------------------
  基础地址（三张图，共 8 级缩放，合计 65,535 张 / 约 1.65 GB）：

    https://assets.wardogs-artillery.com/releases/assets-v1/maps/tiles/{地图}/zoom_{z}/{x}_{y}.webp

  地图名 {地图}:  bakurani / ozeti / zestafona
  缩放   {z}  :  0 ~ 7，第 z 级是 2^z × 2^z 的网格
                    z=0 → 1×1      (1 张)
                    z=1 → 2×2      (4)
                    z=2 → 4×4      (16)
                    z=3 → 8×8      (64)
                    z=4 → 16×16    (256)
                    z=5 → 32×32    (1024)
                    z=6 → 64×64    (4096)
                    z=7 → 128×128  (16384)
  {x}_{y}     :  左上角是 0_0，x 向右、y 向下，最大到 (2^z - 1)_(2^z - 1)
  文件格式     :  WebP，单张约 20 ~ 40 KB

  没有打包 zip 可下 —— 服务端只提供散图（tiles/*.zip 等已全部 404），
  所以只能逐张抓。

怎么下载（三选一）
------------------
  A. 一键（推荐，支持断点续传）
     1. 装 aria2：  winget install aria2        （或去 https://aria2.github.io 下 zip）
     2. 双击 download_tiles.cmd
     会自动跳过已经下好的，中断了重跑一遍即可。
     代理在文件开头改：  set "PROXY=http://127.0.0.1:1080"
     如果 1080 是 SOCKS 端口，改成：  set "PROXY=socks5h://127.0.0.1:1080"

  B. 用图形下载器（Motrix / Free Download Manager / IDM）
     导入 scripts\urls.txt（纯 URL 列表，59,283 行），
     再把下载的文件按 scripts\aria2.txt 里的 dir=/out= 归位到 tiles\ 下。
     （归位麻烦，所以更推荐方案 A）

  C. 用 python 脚本
     python scripts\fetch_tiles.py --out "D:\WardogsArtillery\tiles"
     默认走 socks5h://127.0.0.1:1080，改代理：
     python scripts\fetch_tiles.py --out "D:\WardogsArtillery\tiles" --proxy http://127.0.0.1:1080
     断网直连： --proxy none

下载完怎么看地图
-----------------
  双击 serve.cmd，浏览器会打开  http://127.0.0.1:8099/mortar-map.html
  右上角「底图」按钮切换来源：
      自动 = 本地优先，缺哪块才去在线补（推荐）
      本地 = 只读本地 tiles\（真离线）
      在线 = 只读社区 CDN

  注意：直接双击 mortar-map.html（file:// 方式）时，部分浏览器会拦截本地图片，
  这时页面右上会显示「底图 在线 CDN」。用 serve.cmd 打开就不会有这个问题。

进度
---------------------------
  ✅ 已全部完成：65,535 / 65,535 张，1.79 GB，0 残缺 0 缺失
  （校验脚本：python scripts\integrity_check.py）
  若日后社区更新地图，重跑 download_tiles.cmd 即可增量补齐。

数据来源与许可
--------------
  射表、地图边界、地标坐标、底图瓦片：开源项目 apollyon-sys/wardogs-calculator
  （代码 MIT；底图影像属于 WARDOGS 游戏资产，非 MIT，仅供个人参考使用）
  这些是社区测量值，不是 Bulkhead 官方数据。
  计算假设炮位与目标等高，不处理地形起伏、建筑遮挡、风向与车辆倾斜；
  L81 自带 50 MOA 散布（685 m 处约 ±10 m），第一发永远是试射弹。
