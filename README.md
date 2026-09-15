# WARDOGS 战术工具箱

WARDOGS（迫击炮模拟）的战术辅助工具：迫击炮诸元解算、测距标绘、情报速查、建造规划，支持浏览器直接使用，也提供 Electron 桌面版（带游戏内悬浮窗）。

> **反作弊声明**：本项目是纯「画在屏幕上的工具」。它**不读取、不注入、不修改任何游戏进程或内存**，与游戏零交互；桌面悬浮窗就是一个普通置顶窗口（原理等同于开一个浏览器小窗）。使用悬浮窗时请将游戏设为**无边框窗口 / 窗口化**模式。

## 功能一览

- **算诸元**：炮位 + 目标 → 方位角 / 距离 / 密位 / 射击口令，含最小·最大射程与 50 MOA 散布提示
- **推落点**：按方位 + 密位（或距离）反推落点，方便修正
- **修偏差**：按实际弹坑修正下一发诸元
- **工具**：测距尺、圆规、方位线、标记、路线规划、多边形禁炸区（目标落在禁炸区时解算自动报警）
- **情报**：出生点-塔楼决策矩阵、炮位推荐（按可架设性与射程排序）、打击范围分析
- **建造**：23 种建筑建材计算器（托盘数 / 花费 / 重量）、FOB 60m 建造半径规划器（圈外建筑自动标红）
- **射表**：L81 完整射表速查
- **设置**：三张地图切换（Bakurani / Ozeti / Zestafona）、底图来源、明暗主题、数据导入导出
- 全部标绘数据自动存本地（localStorage），1 格 = 100 m

## 网页版（零安装）

```cmd
cd /d D:\WardogsArtillery
serve.cmd         REM 启动本地服务，浏览器打开 http://127.0.0.1:8099/mortar-map.html
```

底图来源可切换：**自动**（本地瓦片优先，失败自动回退 CDN）/ **本地** / **在线**。
也可以加 URL 参数强制来源：`mortar-map.html?src=cdn`。

### 本地瓦片（可选，约 1.79 GB）

瓦片**不随仓库分发**（游戏资产）。如需离线使用：

```cmd
scripts\gen_urls.py       REM 生成全部瓦片地址
download_tiles.cmd        REM aria2 批量下载到 tiles\
scripts\integrity_check.py REM 校验（应输出 65,535/65,535 PASS）
```

瓦片地址格式：`https://assets.wardogs-artillery.com/releases/assets-v1/maps/tiles/{map}/zoom_{z}/{x}_{y}.webp`（z 0–7，2^z 网格）。

## 桌面版（悬浮窗 · 全新桌面 UI）

桌面版使用**独立设计的桌面界面**（非网页版换皮）：左侧导航 + 地图主区 + 右侧面板的布局，
深色军事风格，基于 [Shoelace](https://shoelace.style/) Web Components 组件库
（已随 `renderer/vendor/` 本地打包，运行零网络依赖）。

```cmd
cd app
npm install          REM 国内慢可先设置 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm start
```

- 主窗口：侧边栏导航（算诸元 / 推落点 / 修偏差 / 工具 / 情报 / 建造 / 射表 / 数据）
- `Alt+X`：全局开关**游戏内悬浮窗**——透明置顶小窗，只有一张地图 +
  底部 HUD（方位 / 距离 / 密位大数字 + 复制口令按钮），Esc 隐藏，拖动地图区可移动窗口
- 主窗口关闭 = 缩到托盘；托盘菜单可显示主窗 / 开关悬浮窗 / 退出
- 桌面版默认云端地图（不打包任何瓦片），首次加载需要联网；主窗口可选本地 tiles

### 技术说明

- 渲染层在 `app/renderer/`：`engine.js`（数学/瓦片/画布引擎，与 DOM 解耦）+ `app.js`（Shoelace UI）+ `app.css`（设计系统）
- 主进程注册了 `app://` 自定义协议加载渲染层（ESM import map 本地解析 lit 等运行时依赖，全部离线）
- 与网页版共用同一个 localStorage 存档键，网页版放的标记桌面版直接继承

### 打包单文件程序（可选）

```cmd
cd app
npm run dist         REM electron-builder，产物在 app\dist\
```

## 目录结构

```
mortar-map.html          核心：单文件战术工具箱（网页版）
app/                     Electron 桌面版（main.js + renderer/ 全新桌面 UI）
app/renderer/            桌面渲染层：engine.js + app.js + app.css + vendor/（Shoelace 本地包）
scripts/                 瓦片下载与校验脚本
tiles/                   本地瓦片（.gitignore 排除，不入库）
```

## 排障

- 报 `Cannot read properties of undefined (reading 'requestSingleInstanceLock')`：当前终端设了 `ELECTRON_RUN_AS_NODE` 环境变量（常见于 IDE 内置终端），`unset ELECTRON_RUN_AS_NODE` 后再 `npm start`。
- 虚拟机/远程桌面里 GPU 进程崩溃退出：加启动参数 `npx electron . --disable-gpu`。普通桌面环境无需。
- 桌面 UI 改动后只见白屏：打开 DevTools（开发模式可在 main.js 里 `win.webContents.openDevTools()`）看控制台；多数是 import map 与 `renderer/vendor/npm/` 内包路径不匹配。

## 致谢

- [apollyon-sys/wardogs-calculator](https://github.com/apollyon-sys/wardogs-calculator) —— 射表数据参考
- WARDOGS 官方瓦片 CDN

## License

[MIT](LICENSE)（仅限代码；游戏素材不属于本仓库，也不被本许可覆盖）
