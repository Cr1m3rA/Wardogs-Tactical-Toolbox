# WARDOGS 战术工具箱

面向 WARDOGS 的战术辅助工具，提供**火炮诸元解算 · 测距标绘 · 情报速查 · 建造规划**四类功能。

本项目提供两种使用形式，二者共用同一套弹道模型与地图数据：

- **网页版**：单文件 `mortar-map.html`，无需安装，双击即可使用；
- **桌面版**：单文件 `WARDOGS-Toolbox.exe`（约 9 MB），提供**游戏内悬浮窗**，`Alt+X` 开关。

> **反作弊声明**
>
> 本项目的实现方式是在屏幕上独立绘制，**不读取、不注入、不修改任何游戏进程或内存**，
> 与游戏之间不存在任何交互。桌面悬浮窗是一个普通的置顶窗口，原理等同于在游戏旁另开一个浏览器窗口。
> 使用悬浮窗时，游戏需设为**无边框窗口 / 窗口化**模式。

---

## 功能

### 火炮解算

| 功能 | 说明 |
|---|---|
| **算诸元** | 炮位 + 目标 → 方位角 / 距离 / 密位 / 射击口令，附最小·最大射程与散布提示 |
| **双武器** | L81 迫击炮（132–684 m）、SPH-2 自行火炮（780–2629 m），工具栏可一键切换，解算 / 射表 / 情报同步跟随 |
| **双弹道** | SPH-2 在 1181–2629 m 区间同时存在低弹道与高弹道两条解，界面并列给出两个密位，可点击切换；780–1180 m 仅有高弹道 |
| **推落点** | 按方位 + 密位（或距离）反推落点，用于修正 |
| **修偏差** | 按实际弹坑修正下一发诸元 |
| **完整射表** | 所选武器的全表速查（L81 84 档；SPH-2 低弹道 59 档 / 高弹道 79 档），输入距离或密位反查高亮 |

### 标绘与情报

- **工具**：测距尺 · 半径圈 · 方位线 · 标记 · 路线规划（分段 + 总长）· 多边形禁炸区
  （点击起点圆圈闭合；目标落入禁炸区时解算结果以红字告警）
- **情报**：出生点决策矩阵 · 炮位推荐（按可架设性与射程排序，可一键设炮）· 打击范围分析 · 地标速查
- **建造**：23 种建筑的建材计算器（托盘 / 花费 / 重量）· FOB 60 m 建造半径规划器（超出范围的建筑标红）
- **指针坐标**：指针位于地图上时，旁侧浮标实时显示所在坐标（1 格 = 100 m）

### 桌面版独有

- **游戏内悬浮窗**（`Alt+X` 全局开关）：透明置顶小窗，仅含一张地图与底部 HUD
  （方位 / 距离 / 密位大数字 + 复制口令 + 地图下拉），`Esc` 隐藏，拖动底部 HUD 条移动
- **托盘常驻**：主窗口关闭时最小化至托盘，不退出进程
- **便携**：配置与瓦片均位于 exe 同级目录，整个目录复制即可迁移全部数据

---

## 使用方法

### 网页版（无需安装）

1. 下载或 clone 本仓库；
2. 双击 **`serve.cmd`**，浏览器将自动打开 `http://127.0.0.1:8099/mortar-map.html`。

> 直接双击 `mortar-map.html`（`file://` 方式）亦可打开，但部分浏览器会拦截本地图片读取，
> 表现为底图始终无法加载、界面右上角持续显示「底图 在线 CDN」。使用 `serve.cmd` 可避免该问题。

`mortar-calculator.html` 为纯坐标计算器，不依赖底图，双击即可使用。

### 桌面版

1. 到 [Releases](../../releases) 下载 `WARDOGS-Toolbox.exe`；
2. 放置于任意**可写**目录（例如 `D:\WardogsToolbox\`），双击运行。

无需安装，无需 Node.js 或任何附加运行时——Win10/11 已内置 WebView2。
配置与日志在 exe 同级目录自动生成，迁移时复制整个目录即可。

**操作一览**

| 按键 / 操作 | 作用 |
|---|---|
| `Alt+X` | 全局开关游戏内悬浮窗（在任意程序中均生效） |
| `Esc` | 隐藏悬浮窗 |
| 拖动悬浮窗底部 HUD 条 | 移动悬浮窗（位置会被记住） |
| 主窗口 `×` | 最小化至托盘，不退出 |
| 托盘图标右键 | 显示主窗口 / 悬浮窗开关 / 退出 |

悬浮窗不含标题栏，切换地图使用 HUD 上的下拉菜单。

### 地图数据（不随 exe 打包）

地图瓦片全量约 **1.79 GB**，且属于游戏素材，因此既不打包进可执行文件，也不随仓库分发。
桌面版采用**本地代理 + 持久化磁盘缓存**：

- 渲染层向本地代理请求瓦片，代理先查磁盘，命中则直接返回；未命中才回源 CDN 拉取并写入磁盘。
  因此同一区域**第二次打开（包括重启应用后）无需联网，可即时显示**。
- **无任何预下载也可直接使用**：未缓存的区域自动使用在线底图，浏览过程中同步缓存。
- 如需一次性下载全部瓦片，「数据」页提供下载管理，两个档位均标注所需体积：

  | 档位 | 内容 | 体积 | 精度 |
  |---|---|---|---|
  | **默认精度** | z0–z5，三张图 | 约 **132 MB** | 1 像素 ≈ 1.35 m |
  | **高精度** | z0–z7，三张图 | 约 **1.79 GB** | 1 像素 ≈ 0.34 m |

  支持暂停 / 继续 / 取消，已完成部分不会重复下载（断点续传）。

若瓦片已下载至其他位置（例如通过 `download_tiles.cmd` 下载到 `tiles\` 目录），
可在「数据」页将瓦片目录指向该位置，不会产生任何重复下载。

#### 自行下载瓦片（网页版离线使用）

瓦片地址格式如下。服务端仅提供单张图片，不提供打包文件，需逐张获取：

```
https://assets.wardogs-artillery.com/releases/assets-v1/maps/tiles/{地图}/zoom_{z}/{x}_{y}.webp
```

- `{地图}`：`bakurani` / `ozeti` / `zestafona`
- `{z}`：`0` ~ `7`，第 z 级为 2^z × 2^z 的网格（z=0 → 1 张，z=7 → 16384 张）
- `{x}_{y}`：左上角为 `0_0`，x 向右、y 向下；WebP 格式，单张约 20–40 KB

三张图 8 个层级合计 65,535 张 / 约 1.79 GB。三种下载方式：

```cmd
REM A. 一键下载（推荐；aria2 批量 + 断点续传，中断后重跑即可）
winget install aria2
download_tiles.cmd

REM B. 使用图形化下载器（Motrix / Free Download Manager / IDM）
scripts\gen_urls.py          REM 生成 scripts\urls.txt（纯 URL 列表）与 scripts\aria2.txt（带落盘路径）
                             REM urls.txt 拖入下载器；下载完成后按 aria2.txt 中的 dir=/out= 归位

REM C. 使用 Python 脚本
python scripts\fetch_tiles.py --out "<仓库>\tiles"
```

代理设置在 `download_tiles.cmd` 开头的 `set "PROXY=..."` 处修改；
`fetch_tiles.py` 通过 `--proxy` 指定，直连时填写 `--proxy none`。

下载完成后执行完整性校验：

```cmd
python scripts\integrity_check.py        REM 应输出 65,535 / 65,535，末行 PASS
```

### 典型流程

**射击解算**

1. 在左栏选择「算诸元」，在地图上依次点击炮位与目标位置（也可直接粘贴坐标）；
2. 右侧显示方位角、距离与密位，点击「复制口令」；
3. 若目标位于禁炸区内，此处会以红字告警，确认后再行射击。

**偏差修正**

- 由方位与密位反推落点：使用「推落点」，按方位 + 密位反推；
- 已观察到弹坑、需修正下一发：使用「修偏差」，依次点击弹坑位置与目标位置。

**开局规划**

1. 在「情报」页查看炮位推荐，选择射程可覆盖目标区的位置，一键设炮；
2. 在「工具」中绘制 FOB 半径圈（60 m）以检查建筑是否超出范围，超出者标红；
3. 将敌方可能的来向框选为禁炸区，此后解算结果落入该区域会自动告警。

---

## 第三方素材与数据声明

**本仓库仅提供代码。下列内容不属于本项目，亦不受本项目 Apache-2.0 许可的覆盖。**
完整声明见 [NOTICE](NOTICE)。

| 内容 | 来源 | 许可 / 说明 |
|---|---|---|
| 地图瓦片、游戏内影像 | WARDOGS 官方资源 CDN | **WARDOGS 游戏资产**。本仓库不打包、不再分发，程序仅在运行时按用户操作请求并按需本地缓存 |
| 射表、地图边界、地标坐标 | [apollyon-sys/wardogs-calculator](https://github.com/apollyon-sys/wardogs-calculator) | 该项目代码为 MIT；其中的**数值为社区测量值，非 Bulkhead 官方数据** |
| 界面图标 | [Lucide](https://lucide.dev/) | ISC，全文见 [scripts/lucide/LICENSE](scripts/lucide/LICENSE) |
| 界面组件 | [Shoelace](https://shoelace.style/) / [Lit](https://lit.dev/) | MIT，随 `renderer/vendor/` 一并分发 |

本项目与 Bulkhead Interactive 及 WARDOGS 开发组**无任何隶属关系**，未获其授权、赞助或认可。
「WARDOGS」及相关名称为其各自所有者的商标。

**地图瓦片的使用需自行判断。** 程序仅发起一个与用浏览器打开图片相同的 HTTP 请求；
是否下载、保存期限与使用方式，均由使用者自行决定并承担相应风险。

数据与算法存在以下限制，使用前请知悉：

- 解算假设**炮位与目标等高**，不考虑地形起伏、建筑遮挡、风向与车辆倾斜；
- L81 自带约 50 MOA 散布（685 m 处约 ±10 m），**首发射击仅为试射**；
- 地形数据中的「海拔」不予显示——该高程基准存在约 900 m 的整体偏移，直接读取会产生误导。

---

## 目录结构

```
mortar-map.html          网页版：单文件战术工具箱
mortar-calculator.html   网页版：纯坐标计算器（不依赖底图）
serve.cmd                启动本地静态服务（网页版推荐以此方式打开）
download_tiles.cmd       一键批量下载瓦片（aria2，支持断点续传）
build-exe.cmd            从源码构建桌面版单文件 exe

app/renderer/            渲染层：engine.js（数学/瓦片/画布，与 DOM 解耦）
                         + app.js（界面）+ app.css（设计系统）
                         + desktop.js（Tauri 桥接，网页版中自动退化为空操作）
                         + icons.js / weapons.js（生成产物，见下）
app/src-tauri/           桌面版 Tauri 2 外壳（Rust）：main.rs / tile.rs / download.rs
app/src-tauri/icons/     应用图标（由脚本生成）
app/main.js              上一版 Electron 外壳，已不再发布，仅作参考

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

仅**桌面版**需要编译；网页版为纯静态文件，修改后刷新浏览器即可生效。

**第一步：前端依赖。** 桌面版界面所用的 Shoelace / Lit 从 `renderer/vendor/` 本地加载
（运行时不访问网络），该目录不入库，由 `postinstall` 从 `node_modules` 重建：

```cmd
cd app
npm install
```

**第二步：WSL 工具链。** 桌面版在 **WSL 内交叉编译至 Windows 的 MSVC 目标**，
因此宿主机无需安装 Visual Studio：

```bash
# 在 WSL（Ubuntu）中执行
sudo apt install -y clang lld
cargo install cargo-xwin
rustup target add x86_64-pc-windows-msvc    # 可选，cargo-xwin 亦会自动拉取
```

**第三步：构建。** 在 Windows 侧双击 `build-exe.cmd`。首次构建约需 5–10 分钟
（需下载 Windows SDK 头文件与全部依赖），此后为增量构建。
产物为单个 `WARDOGS-Toolbox.exe`，静态链接 CRT，约 9 MB。

> 渲染层在**编译期**嵌入二进制，`renderer/vendor/` 同理。因此 `npm install`
> 必须在 `build-exe.cmd` **之前**完成——否则 vendor 目录为空，exe 虽可构建成功，但界面无法启动。

> 目标平台选用 MSVC 而非 GNU 的原因：GNU 目标需要额外附带一个 `WebView2Loader.dll`，
> 那样将不再是单文件 exe。

> 修改 `app/renderer/` 下任何文件后，仅刷新窗口不会生效，必须重新执行 `build-exe.cmd`。
> 此外，网页版 `mortar-map.html` 是**另一份独立实现**，修改一方不会同步至另一方。

### 开发与校验

提交前应执行以下检查，全部通过方可发布（后五项需先运行 `node scripts/serve.js`）：

```cmd
node scripts/check_emoji.js       REM emoji 清零（逐码点扫描，含 U+FE0F 变体选择符）
node scripts/check_icons.js       REM 图标 sprite 无悬空引用
node scripts/check_contrast.js    REM 文字对比度：<3:1 硬失败；3~4.5:1 只告警（刻意的次要色阶）
node scripts/test_ballistics.js   REM 弹道 + 界面验收（网页版 / 桌面版 / 悬浮窗，127 项）
node scripts/test_download.js     REM 下载进度条验收（取消 / 暂停 / 收尾，16 项）
node scripts/test_map.js          REM 底图投影验收（瓦片铺在哪 / 两份数据是否一致，57 项）
```

`--keep` 可保留生成的测试页以便排查。**新增界面行为时应同步补充断言**——上述测试均出现过
断言过松而失去检出能力的情况。编写断言前应先确认：**该断言在缺陷代码上是否同样会通过？**

- `test_download.js` 使用 `scripts/test/fake_tauri.js` 在模块加载前装入假 Tauri 桥，
  使 `IS_TAURI` 为真，从而覆盖 `desktop.js` 中「网页版直接退化为空操作」的分支。
  **该测试仅覆盖渲染层**：Rust 侧的分片睡眠、取消标志的生效时机，需启动真实进程手工验证。
- `test_map.js` 在磁盘上无瓦片的情况下亦可运行（将瓦片图替换为假图，不产生任何下载），
  因为它验证的不是「绘制结果是否相似」，而是**渲染层实际交给 `drawImage` 的矩形**位于何处。
  底图覆盖范围错误属于静默故障：标记、网格、半径圈均自洽，数值断言无法检出，
  只有锁定该矩形才能发现。**修改投影相关代码后，必须重新执行此项。**
- 对比度扫描器：低于 3:1 为硬失败（该字号下无论对比度多高均无法辨读），
  3~4.5:1 仅报告而不失败（次要文字本应弱于正文，强行提升会破坏层级）。

**以下生成产物请勿手动修改**，将被下一次生成覆盖：

```cmd
node scripts/make_weapons.js      REM → app/renderer/weapons.js + mortar-map.html 的内联脚本
node scripts/make_icons.js        REM → app/renderer/icons.js + index.html / mortar-map.html 的 sprite
node scripts/make_app_icon.js     REM → app/src-tauri/icons/（修改图标后需重新执行 build-exe.cmd）
```

修改 `scripts/make_weapons.js` 或引擎的插值逻辑后，**务必**重新执行 `test_ballistics.js`：
密位随距离的增减方向取决于弹道弧（L81 迫击炮 950→120 递减，SPH-2 低弹道 20→600 递增），
方向写反不会抛出异常，只会静默产生看似正常但完全错误的密位，仅能由断言检出。

> `build-exe.cmd` 内**只能使用 ASCII 字符**。cmd.exe 按字节读取批处理文件，
> 出现多字节字符会导致读取错位，将 `REM` 的后半部分当作命令执行，
> 输出大量「不是内部或外部命令」错误；写入 UTF-8 BOM 亦无法解决。

---

## 排障

**请先查看 `wardogs-debug.log`（位于 exe 同级目录）。** 遇到问题时提供该文件，
可显著缩短定位时间。它能够区分若干表现相似但成因不同的故障：

| 日志内容 | 说明 |
|---|---|
| `ipc PROBE 渲染层已识别为 Tauri 桌面版` | 渲染层已识别为桌面版。**缺少该行**表示前端未启动，问题位于渲染层 |
| `proto HIT` / `tile DISK` | 瓦片经由本地代理并从磁盘命中 |
| `tile CDN` | 本地无缓存，已回源下载。首次打开某区域时出现属正常现象 |
| 完全没有 `proto HIT` 行 | 底图完全未被请求（**历史成因**：引擎仅在 window resize 时重绘，窗口尺寸不变则不绘制，启动后为空地图） |

- **地图空白 / 持续加载**：先按上表查看日志。若完全没有 `proto HIT` 行，是渲染层未发起请求；
  若有 `proto HIT` 但无 `tile DISK`，通常为 `tiles` 目录指向错误（「数据」页可查看当前目录并更改）。
- **`Alt+X` 无响应**：通常为该快捷键已被其他程序占用，可查看日志中的 `Alt+X 注册失败`。
  托盘菜单的「悬浮窗 开/关」不受影响。
- **底图模糊，或标记与地图位置不符**：先执行 `node scripts/test_map.js`。
  瓦片金字塔覆盖的是**整个世界**（163.84 × 163.84，`tileBounds`），
  可玩区 `bounds` 仅为其中心的一部分；混用二者会使底图被放大 1.486 倍并发生平移，
  表现为底图模糊且「Tower 标记落在塔旁空地」，偏移量越靠边缘越大。
- **虚拟机 / 远程桌面环境下白屏**：应用已内置 `--disable-gpu`（纯 2D 地图，无性能损失）。
- **修改渲染层后 exe 中未生效**：`renderer/` 在编译期嵌入二进制，必须重新执行 `build-exe.cmd`。
- **`build-exe.cmd` 报「不是内部或外部命令」**：该脚本被改为非 ASCII 字符或 LF 换行，
  参见上文「开发与校验」末尾的说明。

---

## TODO

欢迎提交 PR。标注「最优先」者为作者当前的优先项。

- [ ] **国际化（i18n）** ← 最优先：目前界面文案、代码注释与文档均为中文硬编码。
      计划将 UI 文案抽为词条表并支持运行时切换，优先提供英文；
      文档另拆出 `README.en.md`。数据层（武器名、地标名）是否一并翻译尚未确定。
- [ ] 网页版与桌面版目前为**两份渲染层实现**，逻辑需人工同步。
      计划收敛为一份，网页版通过 `<script type="module">` 引用同一套 ESM。
- [ ] GitHub Actions：打 tag 自动交叉编译 + 自动执行上述全部验收测试 + 发布 Release。
- [ ] README 补充截图 / GIF（悬浮窗与标绘部分仅凭文字难以直观呈现）。
- [ ] 支持更多武器与地图（射表由 `ref/weapons.json` 驱动，补充数据即可）。
- [ ] 增加深色/浅色之外的**高对比主题**（现有两套主题均按 WCAG AA 调整，
      户外强光下的可读性尚未实测）。

## 许可

[Apache License 2.0](LICENSE) —— **仅限代码**。

地图瓦片、射表与地标数据、图标等第三方内容不属于本仓库，亦不受该许可覆盖，
详见上文的[第三方素材与数据声明](#第三方素材与数据声明)与 [NOTICE](NOTICE)。

## 致谢

- [apollyon-sys/wardogs-calculator](https://github.com/apollyon-sys/wardogs-calculator) —— 射表与地标数据参考
- [Lucide](https://lucide.dev/) —— 界面图标
- [Shoelace](https://shoelace.style/) —— 桌面版 Web Components
- [Tauri](https://tauri.app/) —— 桌面版外壳（约 9 MB 单文件）
