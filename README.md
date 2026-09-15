# WARDOGS 战术工具箱

WARDOGS（迫击炮模拟）的战术辅助工具：**火炮诸元解算 · 测距标绘 · 情报速查 · 建造规划**。

两种用法，共用同一套数学与数据：

- **网页版**：一个 `mortar-map.html` 双击就能用，零安装；
- **桌面版**：单个 `WARDOGS-Toolbox.exe`（约 9 MB），带**游戏内悬浮窗**，`Alt+X` 开关。

> **反作弊声明**
>
> 本项目是纯「画在屏幕上的工具」。它**不读取、不注入、不修改任何游戏进程或内存**，
> 与游戏零交互。桌面悬浮窗就是一个普通的置顶窗口——原理等同于在游戏旁边开一个浏览器小窗。
> 使用悬浮窗时请把游戏设为**无边框窗口 / 窗口化**模式。

---

## 功能

### 火炮解算

| 功能 | 说明 |
|---|---|
| **算诸元** | 炮位 + 目标 → 方位角 / 距离 / 密位 / 射击口令，附最小·最大射程与散布提示 |
| **双武器** | L81 迫击炮（132–684 m）、SPH-2 自行火炮（780–2629 m），工具栏一键切换，解算/射表/情报全部跟随 |
| **双弹道** | SPH-2 在 1181–2629 m 同时有低弹道与高弹道两条解，界面并列给出两个密位，点一下即切换；780–1180 m 只有高弹道 |
| **推落点** | 按方位 + 密位（或距离）反推落点，用于修正 |
| **修偏差** | 按实际弹坑修正下一发诸元 |
| **完整射表** | 所选武器的全表速查（L81 84 档；SPH-2 低弹道 59 档 / 高弹道 79 档），输入距离或密位反查高亮 |

### 标绘与情报

- **工具**：测距尺 · 半径圈 · 方位线 · 标记 · 路线规划（分段 + 总长）· 多边形禁炸区
  （点起点圆圈闭合；目标落进禁炸区时解算自动红字报警）
- **情报**：出生点决策矩阵 · 炮位推荐（按可架设性与射程排序，一键设炮）· 打击范围分析 · 地标速查
- **建造**：23 种建筑的建材计算器（托盘 / 花费 / 重量）· FOB 60 m 建造半径规划器（圈外建筑标红）
- **指针坐标**：指针在地图上时，旁边浮标实时显示所在坐标（1 格 = 100 m）

### 桌面版独有

- **游戏内悬浮窗**（`Alt+X` 全局开关）：透明置顶小窗，只有一张地图 + 底部 HUD
  （方位 / 距离 / 密位大数字 + 复制口令 + 地图下拉），`Esc` 隐藏，拖底部 HUD 条移动
- **托盘常驻**：主窗口关闭 = 缩到托盘，不退出
- **便携**：配置与瓦片都在 exe 同级目录，整个文件夹拷走即带走全部数据

---

## 使用方法

### 网页版（零安装）

1. 下载或 clone 本仓库；
2. 双击 **`serve.cmd`**，浏览器会自动打开 `http://127.0.0.1:8099/mortar-map.html`。

> 直接双击 `mortar-map.html`（`file://` 方式）也能开，但部分浏览器会拦截本地图片，
> 表现是地图永远出不来、右上角一直显示「底图 在线 CDN」。用 `serve.cmd` 就不会有这个问题。

`mortar-calculator.html` 是纯坐标版计算器，不依赖底图，双击即用。

### 桌面版

1. 到 [Releases](../../releases) 下载 `WARDOGS-Toolbox.exe`；
2. 丢进任意**可写**的文件夹（比如 `D:\WardogsToolbox\`），双击运行。

不需要安装、不需要 node、不需要任何运行时——Win10/11 自带 WebView2。
exe 同级的目录里会自动生成配置和日志，想换机器就把整个文件夹拷走。

**操作一览**

| 按键 / 操作 | 作用 |
|---|---|
| `Alt+X` | 全局开关游戏内悬浮窗（在任何程序里都生效） |
| `Esc` | 隐藏悬浮窗 |
| 拖悬浮窗底部 HUD 条 | 移动悬浮窗（位置会被记住） |
| 主窗口 `×` | 缩到托盘，不退出 |
| 托盘图标右键 | 显示主窗口 / 悬浮窗开关 / 退出 |

悬浮窗没有顶栏，换地图用 HUD 上那个下拉菜单。

### 地图数据（不随 exe 打包）

地图瓦片全量约 **1.79 GB**，而且属于游戏素材，所以不打包、也不随仓库分发。
桌面版的做法是**本地代理 + 持久化磁盘缓存**：

- 页面向本地代理要瓦片 → 先查磁盘，命中直接返回；没命中才去 CDN 拉，**顺手存下来**。
  所以同一个区域**第二遍打开（包括重启应用）完全不联网、秒出**。
- **什么都不下也能直接用**：没缓存的区域自动走在线底图，边看边存。
- 想一次性下全，「数据」页有下载管理，两个档位都写明体积：

  | 档位 | 内容 | 体积 | 精度 |
  |---|---|---|---|
  | **默认精度** | z0–z5，三张图 | 约 **132 MB** | 1 像素 ≈ 1.35 m |
  | **高精度** | z0–z7，三张图 | 约 **1.79 GB** | 1 像素 ≈ 0.34 m |

  支持暂停 / 继续 / 取消，已下好的部分不会重下（断点续传）。

已经把瓦片下在别处（比如用 `download_tiles.cmd` 下到了 `tiles\`）？
在「数据」页把瓦片目录指过去就行，对上是零下载。

#### 自己下载瓦片（网页版离线用）

瓦片地址格式（服务端只提供散图，没有打包 zip，只能逐张抓）：

```
https://assets.wardogs-artillery.com/releases/assets-v1/maps/tiles/{地图}/zoom_{z}/{x}_{y}.webp
```

- `{地图}`：`bakurani` / `ozeti` / `zestafona`
- `{z}`：`0` ~ `7`，第 z 级是 2^z × 2^z 的网格（z=0 → 1 张，z=7 → 16384 张）
- `{x}_{y}`：左上角是 `0_0`，x 向右、y 向下；WebP 格式，单张约 20–40 KB

三张图 8 个层级合计 65,535 张 / 约 1.79 GB。三种下载方式：

```cmd
REM A. 一键（推荐，aria2 批量 + 断点续传；中断了重跑一遍即可）
winget install aria2
download_tiles.cmd

REM B. 用图形下载器（Motrix / Free Download Manager / IDM）
scripts\gen_urls.py          REM 生成 scripts\urls.txt（纯 URL 列表）与 scripts\aria2.txt（带落盘路径）
                             REM urls.txt 拖进下载器；下完再按 aria2.txt 里的 dir=/out= 归位

REM C. 用 python 脚本
python scripts\fetch_tiles.py --out "<仓库>\tiles"
```

代理在 `download_tiles.cmd` 开头改（`set "PROXY=..."`）；
`fetch_tiles.py` 用 `--proxy` 指定，直连写 `--proxy none`。

下完校验一遍：

```cmd
python scripts\integrity_check.py        REM 应输出 65,535 / 65,535，末行 PASS
```

### 典型流程

**打一发**

1. 左栏「算诸元」，在地图上点一下炮位、再点一下目标（也可以直接粘贴坐标）；
2. 右侧给出方位角、距离、密位，点「复制口令」；
3. 目标落在禁炸区里的话这里会红字警告，先确认再打。

**修正**

- 想知道「按这个方位和密位打出去会落在哪」→ 用「推落点」，按方位 + 密位反推落点；
- 已经看到弹坑了，想让下一发命中 → 用「修偏差」，点一下弹坑位置和目标位置即可。

**开局规划**

1. 「情报」页看炮位推荐，挑一个射程覆盖目标区的位置，一键设炮；
2. 「工具」里拉一个 FOB 半径圈（60 m）检查建筑有没有出圈，出圈的会标红；
3. 把敌人可能来的方向框成禁炸区，之后解算落到里面会自动报警。

---

## 第三方素材与数据声明

**本仓库只提供代码。下面这些东西都不是我们的，也不受本项目的 Apache-2.0 许可覆盖。**
完整声明见 [NOTICE](NOTICE)。

| 内容 | 来源 | 许可 / 说明 |
|---|---|---|
| 地图瓦片、游戏内影像 | WARDOGS 官方资源 CDN | **WARDOGS 游戏资产**。本仓库不打包、不再分发，程序仅在运行时按用户操作请求并按需本地缓存 |
| 射表、地图边界、地标坐标 | [apollyon-sys/wardogs-calculator](https://github.com/apollyon-sys/wardogs-calculator) | 该项目代码为 MIT；其中的**数值是社区测量值，不是 Bulkhead 官方数据** |
| 界面图标 | [Lucide](https://lucide.dev/) | ISC，全文见 [scripts/lucide/LICENSE](scripts/lucide/LICENSE) |
| 界面组件 | [Shoelace](https://shoelace.style/) / [Lit](https://lit.dev/) | MIT，随 `renderer/vendor/` 一并分发 |

本项目与 Bulkhead Interactive 及 WARDOGS 开发组**无任何隶属关系**，未获其授权、赞助或认可。
「WARDOGS」及相关名称为其各自所有者的商标。

**地图瓦片的使用请自行判断。** 程序只是替你发了一个和你用浏览器打开图片一样的 HTTP 请求，
是否下载、存多久、怎么用，决定权和使用风险都在你这边。

数据与算法本身也有边界，用之前请知悉：

- 计算假设**炮位与目标等高**，不处理地形起伏、建筑遮挡、风向与车辆倾斜；
- L81 自带约 50 MOA 散布（685 m 处约 ±10 m），**第一发永远是试射弹**；
- 地形数据里的「海拔」不显示——那套高程基准有约 900 m 的整体偏移，直接读会误导人。

---

## 目录结构

```
mortar-map.html          网页版：单文件战术工具箱
mortar-calculator.html   网页版：纯坐标计算器（不依赖底图）
serve.cmd                起本地静态服务（网页版推荐用它打开）
download_tiles.cmd       一键批量下载瓦片（aria2，支持断点续传）
build-exe.cmd            从源码构建桌面版单文件 exe

app/renderer/            渲染层：engine.js（数学/瓦片/画布，与 DOM 解耦）
                         + app.js（界面）+ app.css（设计系统）
                         + desktop.js（Tauri 桥接，网页版里自动退化为空操作）
                         + icons.js / weapons.js（生成产物，见下）
app/src-tauri/           桌面版 Tauri 2 外壳（Rust）：main.rs / tile.rs / download.rs
app/src-tauri/icons/     应用图标（由脚本生成）
app/main.js              上一版 Electron 外壳，已不出货，仅作参考

scripts/                 下载、生成器与验收测试
scripts/make_weapons.js  射表生成器：ref/weapons.json → weapons.js + 网页版内联脚本
scripts/make_icons.js    界面图标生成器：scripts/lucide/*.svg → icons.js + HTML sprite
scripts/make_app_icon.js 应用图标生成器：程序化生成 .ico / .png（不携带二进制素材）
scripts/serve.js         本地静态服务（验收测试的前置），另含 /__hold?ms=N 延时端点
scripts/fetch_tiles.py   瓦片下载器（curl 并发 + 断点续传）
scripts/gen_urls.py      生成瓦片下载清单
scripts/integrity_check.py 瓦片完整性校验

tiles/  tile-conf/  ref/  .research/    本地素材与调研资料，.gitignore 排除，不入库
```

---

## 从源码构建

### 构建环境

只有**桌面版**需要编译；网页版是纯静态文件，改完直接刷新浏览器。

**第一步：前端依赖。** 桌面版界面用的 Shoelace / Lit 走 `renderer/vendor/` 本地加载
（运行零网络），但那个目录不入库，由 `postinstall` 从 `node_modules` 重建：

```cmd
cd app
npm install
```

**第二步：WSL 工具链。** 桌面版在 **WSL 内交叉编译出 Windows 的 MSVC 目标**，
所以宿主机上不需要装 Visual Studio：

```bash
# 在 WSL（Ubuntu）里
sudo apt install -y clang lld
cargo install cargo-xwin
rustup target add x86_64-pc-windows-msvc    # 可选，cargo-xwin 也会自己拉
```

**第三步：构建。** 在 Windows 侧双击 `build-exe.cmd`。首次约 5–10 分钟
（要下 Windows SDK 头文件与全部依赖），之后增量构建很快。
产物是单个 `WARDOGS-Toolbox.exe`，静态链接 CRT，约 9 MB。

> 渲染层是**编译期**打进二进制的，`renderer/vendor/` 也一样。所以 `npm install`
> 必须在 `build-exe.cmd` **之前**做——否则 vendor 是空的，exe 编得出来但界面起不来。

> 为什么是 MSVC 而不是 GNU 目标：GNU 目标需要额外带一个 `WebView2Loader.dll`，
> 那就不是一个单文件 exe 了。

> 改了 `app/renderer/` 下的任何东西，光刷新窗口不会生效，必须重跑 `build-exe.cmd`。
> 另外网页版 `mortar-map.html` 是**另一份实现**，改一边不会同步到另一边。

### 开发与校验

改完代码跑这几条，全绿再发布（后五条需要先 `node scripts/serve.js`）：

```cmd
node scripts/check_emoji.js       REM emoji 清零（逐码点扫描，含 U+FE0F 变体选择符）
node scripts/check_icons.js       REM 图标 sprite 无悬空引用
node scripts/check_contrast.js    REM 文字对比度：<3:1 硬失败；3~4.5:1 只告警（刻意的次要色阶）
node scripts/test_ballistics.js   REM 弹道 + 界面验收（网页版 / 桌面版 / 悬浮窗，127 项）
node scripts/test_download.js     REM 下载进度条验收（取消 / 暂停 / 收尾，16 项）
node scripts/test_map.js          REM 底图投影验收（瓦片铺在哪 / 两份数据是否一致，57 项）
```

`--keep` 可保留生成的测试页便于排查。**新增界面行为时请顺手加断言**——这几条测试
全部踩过「断言写得太松，等于没测」的坑。写之前先问自己：**这个断言在坏代码上会不会也通过？**

- `test_download.js` 用 `scripts/test/fake_tauri.js` 在模块加载前装上假 Tauri 桥，
  让 `IS_TAURI` 为真，从而覆盖 `desktop.js` 里那些「网页版直接退化成空操作」的分支。
  **它只覆盖渲染层**：Rust 侧的分片睡眠、取消标志何时被看到，要起真进程手工验。
- `test_map.js` 拿不到磁盘上的瓦片也照样跑（它把瓦片图换成假图，一个字都不下载），
  因为它验的不是「画得像不像」，而是**渲染层真正交给 `drawImage` 的矩形**铺在哪。
  底图铺错范围是个静默故障：标点、网格、半径圈全都自洽，数值断言一个都拦不住，
  只有盯住那个矩形才抓得住。**修过投影相关的东西，务必回跑这条。**
- 对照度扫描器：低于 3:1 是硬失败（那个字号下无论多大都读不清），
  3~4.5:1 只报告不失败（次要文字本来就该比正文淡，强拉上去层级会塌）。

**两处生成产物请勿手改**，它们会被下一次生成覆盖：

```cmd
node scripts/make_weapons.js      REM → app/renderer/weapons.js + mortar-map.html 的内联脚本
node scripts/make_icons.js        REM → app/renderer/icons.js + index.html / mortar-map.html 的 sprite
node scripts/make_app_icon.js     REM → app/src-tauri/icons/（改完图标要重新 build-exe.cmd）
```

改过 `scripts/make_weapons.js` 或 engine 的插值逻辑后**务必**再跑 `test_ballistics.js`：
密位的方向是随弹道反的（迫击炮 950→120 递减，SPH-2 低弹道 20→600 递增），
写反了不会抛异常，只会安静地算出一个看起来正常但其实完全错的密位——只有断言拦得住。

> `build-exe.cmd` 里请**只写 ASCII**。cmd.exe 按字节重定位批处理文件，
> 一个多字节字符就会让它读串行，把 `REM` 的后半截当命令执行，
> 报一堆「不是内部或外部命令」。加 UTF-8 BOM 也不管用。

---

## 排障

**先看 `wardogs-debug.log`（就在 exe 同级）。** 出问题时把这个文件发过来，
比「我这儿不动了」有用得多。它能直接区分几种长得一模一样的症状：

| 日志里看到 | 说明 |
|---|---|
| `ipc PROBE 渲染层已识别为 Tauri 桌面版` | 渲染层认出了自己是桌面版。**没有这行** ＝ 前端没跑起来，问题在渲染层 |
| `proto HIT` / `tile DISK` | 瓦片走了本地代理并从磁盘命中 |
| `tile CDN` | 本地没有、回源下载了。首次打开某区域出现是正常的 |
| 一行 `proto HIT` 都没有 | 地图根本没请求底图（**曾经的真凶**：引擎只在 window resize 时重绘，窗口尺寸不变就永远不画，启动后是一张空地图） |

- **地图空白 / 一直转圈**：先按上表看日志。若一行 `proto HIT` 都没有，是渲染层压根没发起请求；
  若有 `proto HIT` 但没有 `tile DISK`，多半是 `tiles` 目录指错了（「数据」页可看到当前目录并更换）。
- **`Alt+X` 没反应**：多半被别的程序占了，看日志里 `Alt+X 注册失败`。
  托盘菜单的「悬浮窗 开/关」不受影响。
- **底图糊、或者标点看着和地图对不上**：先跑 `node scripts/test_map.js`。
  瓦片金字塔铺满的是**整个世界**（163.84 × 163.84，`tileBounds`），
  可玩区 `bounds` 只是世界中间的一块；两者混用会让底图被放大 1.486 倍并平移，
  表现是「糊」加上「Tower 的点落在塔旁边的野地里」，越靠边偏得越多。
- **虚拟机 / 远程桌面白屏**：应用已内置 `--disable-gpu`（纯 2D 地图，没有性能损失）。
- **改了渲染层但 exe 里没生效**：`renderer/` 是编译期打进二进制的，必须重跑 `build-exe.cmd`。
- **`build-exe.cmd` 报「不是内部或外部命令」**：这个脚本被改成非 ASCII 或 LF 换行了，
  见上面「开发与校验」末尾的说明。

---

## TODO

欢迎 PR。标着「最优先」的是作者自己最想先做的。

- [ ] **国际化（i18n）** ← 最优先：目前界面文案、注释、文档全是中文硬编码。
      计划是把 UI 文案抽成词条表 + 运行时切换，至少先出英文；
      文档再拆一份 `README.en.md`。数据层（武器名、地标名）要不要跟着翻译还没定。
- [ ] 网页版与桌面版目前是**两份渲染层实现**，逻辑要靠人肉同步。
      想收敛成一份，网页版走 `<script type="module">` 引同一套 ESM。
- [ ] GitHub Actions：打 tag 自动交叉编译 + 自动跑上面那五条验收 + 发 Release。
- [ ] README 补截图 / GIF（悬浮窗和标绘那两块，光看文字想象不出来）。
- [ ] 支持更多武器与地图（射表由 `ref/weapons.json` 驱动，加数据即可）。
- [ ] 包一个深色/浅色之外的**高对比主题**（现在两个主题都是按 WCAG AA 调的，
      但户外强光下的可读性还没实测）。

## 许可

[Apache License 2.0](LICENSE) —— **仅限代码**。

地图瓦片、射表与地标数据、图标等第三方内容不属于本仓库，也不被该许可覆盖，
详见上面的[第三方素材与数据声明](#第三方素材与数据声明)与 [NOTICE](NOTICE)。

## 致谢

- [apollyon-sys/wardogs-calculator](https://github.com/apollyon-sys/wardogs-calculator) —— 射表与地标数据参考
- [Lucide](https://lucide.dev/) —— 界面图标
- [Shoelace](https://shoelace.style/) —— 桌面版 Web Components
- [Tauri](https://tauri.app/) —— 桌面版外壳（约 9 MB 单文件，托它的福）
