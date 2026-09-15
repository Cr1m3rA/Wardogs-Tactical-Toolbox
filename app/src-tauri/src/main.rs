/* =====================================================================
 * WARDOGS 战术工具箱 — Tauri 桌面版
 * ---------------------------------------------------------------------
 * 反作弊安全声明（重要）：
 *   本应用只是一组普通的系统窗口（WebView2）。
 *   它【不读取、不注入、不修改】任何游戏进程或内存，与游戏零交互；
 *   悬浮窗就是一个置顶的透明小窗口，原理等同于开一个浏览器小窗。
 *   使用游戏内悬浮窗时，请把游戏设为「无边框窗口 / 窗口化」模式。
 * ---------------------------------------------------------------------
 * 快捷键：Alt+X 全局开关悬浮窗；Esc 隐藏悬浮窗（不退出）。
 * 地图：默认走 tile:// 代理 → 磁盘缓存 → CDN，瓦片不随应用打包。
 * ===================================================================== */
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod download;
mod log;
mod tile;

use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

struct St {
    cfg: Mutex<config::Config>,
    dl: download::Manager,
}

/* Esc 隐藏悬浮窗。用注入脚本做，渲染层就不必为桌面版特判。
   __TAURI_INTERNALS__ 是 Tauri 一定会注入的底层对象，__TAURI__ 则取决于
   withGlobalTauri 配置——两个都试，免得配置一变这里就悄悄失效。 */
const ESC_JS: &str = r#"
window.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  var t = window.__TAURI_INTERNALS__ || (window.__TAURI__ && window.__TAURI__.core);
  if (t) { try { t.invoke('hide_overlay'); } catch (_) {} }
}, true);
"#;

/* ============================================================
 * 窗口
 * ============================================================ */
fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// 拖拽中会连续触发 Moved/Resized，节流到 500ms 才落盘一次。
fn persist_overlay(app: &AppHandle) {
    static LAST: Mutex<Option<Instant>> = Mutex::new(None);
    {
        let mut last = LAST.lock().unwrap();
        let now = Instant::now();
        if let Some(t) = *last {
            if now.duration_since(t) < Duration::from_millis(500) {
                return;
            }
        }
        *last = Some(now);
    }
    if let Some(w) = app.get_webview_window("overlay") {
        if let (Ok(p), Ok(s)) = (w.outer_position(), w.inner_size()) {
            let st = app.state::<St>();
            let mut cfg = st.cfg.lock().unwrap();
            cfg.overlay = Some(config::Bounds {
                x: p.x,
                y: p.y,
                width: s.width,
                height: s.height,
            });
            config::save(&cfg);
        }
    }
}

fn create_overlay(app: &AppHandle) -> tauri::Result<()> {
    let saved = { app.state::<St>().cfg.lock().unwrap().overlay };

    let mut b = WebviewWindowBuilder::new(
        app,
        "overlay",
        WebviewUrl::App("index.html?src=auto&overlay=1".into()),
    )
    .title("WARDOGS 悬浮窗")
    .inner_size(560.0, 820.0)
    .min_inner_size(380.0, 420.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .initialization_script(ESC_JS);

    if let Some(bd) = saved {
        b = b
            .position(bd.x as f64, bd.y as f64)
            .inner_size(bd.width as f64, bd.height as f64);
    }

    let w = b.build()?;
    let handle = app.clone();
    w.on_window_event(move |e| {
        if matches!(e, WindowEvent::Moved(_) | WindowEvent::Resized(_)) {
            persist_overlay(&handle);
        }
    });
    Ok(())
}

fn toggle_overlay(app: &AppHandle) {
    match app.get_webview_window("overlay") {
        Some(w) => {
            if w.is_visible().unwrap_or(false) {
                let _ = w.hide();
            } else {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        None => {
            let _ = create_overlay(app);
        }
    }
}

/* ============================================================
 * 托盘
 * ============================================================ */
fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "悬浮窗 开/关 (Alt+X)", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &toggle, &sep, &quit])?;

    let mut tb = TrayIconBuilder::with_id("wardogs-tray")
        .tooltip("WARDOGS 战术工具箱")
        .menu(&menu)
        .on_menu_event(|app, ev| {
            let id: &str = ev.id.as_ref();
            match id {
                "show" => show_main(app),
                "toggle" => toggle_overlay(app),
                "quit" => app.exit(0),
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = ev
            {
                show_main(tray.app_handle());
            }
        });

    /* 图标直接复用窗口图标（内嵌在 exe 里，无需外部素材文件） */
    if let Some(ic) = app.default_window_icon() {
        tb = tb.icon(ic.clone());
    }
    tb.build(app)?;
    Ok(())
}

/* ============================================================
 * IPC 命令（前端用 window.__TAURI__.core.invoke 调用）
 * ============================================================ */
#[tauri::command]
fn hide_overlay(app: AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.hide();
    }
}

/* 启动探针：渲染层一进来就调这个。日志里有没有这一行，直接区分
   「前端没认出自己是桌面版」和「tile:// 协议没打通」两种情况——
   之前这两种症状长得一模一样（都是悄悄回退到直连 CDN）。 */
#[tauri::command]
fn js_probe() {
    log::log("ipc  PROBE   渲染层已识别为 Tauri 桌面版");
}

#[tauri::command]
fn get_settings(app: AppHandle) -> serde_json::Value {
    log::log("ipc  get_settings");
    let st = app.state::<St>();
    let cfg = st.cfg.lock().unwrap();
    let dflt = config::exe_dir().join("tiles");
    serde_json::json!({
        "tileDir": cfg.tiles_dir().to_string_lossy(),
        "defaultTileDir": dflt.to_string_lossy(),
        "exeDir": config::exe_dir().to_string_lossy(),
    })
}

#[tauri::command]
fn set_tile_dir(app: AppHandle, path: String) -> serde_json::Value {
    let st = app.state::<St>();
    let dir = {
        let mut cfg = st.cfg.lock().unwrap();
        cfg.tile_dir = if path.trim().is_empty() { None } else { Some(path) };
        config::save(&cfg);
        cfg.tiles_dir()
    };
    tile::set_dir(dir.clone());
    serde_json::json!({ "tileDir": dir.to_string_lossy() })
}

#[tauri::command]
fn tile_stats() -> Vec<tile::MapStat> {
    tile::stats(&["bakurani", "ozeti", "zestafona"], 7)
}

#[tauri::command]
fn download_start(app: AppHandle, map: String, min_zoom: u32, max_zoom: u32) -> String {
    let id = format!(
        "{}-{}",
        map,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let total: usize = (min_zoom..=max_zoom)
        .map(|z| (1usize << z) * (1usize << z))
        .sum();

    let job = Arc::new(download::Job {
        id: id.clone(),
        map,
        cancel: AtomicBool::new(false),
        paused: AtomicBool::new(false),
        done: AtomicUsize::new(0),
        failed: AtomicUsize::new(0),
        fetched: AtomicUsize::new(0),
        bytes: AtomicU64::new(0),
        total,
    });

    {
        let st = app.state::<St>();
        let mut jobs = st.dl.jobs.lock().unwrap();
        /* 顺手清掉已经收尾的任务。不然每下过一次就留一条记录常驻内存，
           而且 download_cancel/pause 还能翻到早就结束的任务。 */
        jobs.retain(|_, j| {
            !j.cancel.load(Ordering::Relaxed) && j.done.load(Ordering::Relaxed) < j.total
        });
        jobs.insert(id.clone(), job.clone());
    }
    download::start(app.clone(), job, min_zoom, max_zoom, tile::dir());
    id
}

fn job_ctl(app: &AppHandle, id: &str, pause: Option<bool>, cancel: bool) {
    let st = app.state::<St>();
    let jobs = st.dl.jobs.lock().unwrap();
    if let Some(j) = jobs.get(id) {
        if cancel {
            j.cancel.store(true, Ordering::Relaxed);
        }
        if let Some(p) = pause {
            j.paused.store(p, Ordering::Relaxed);
        }
    }
}

#[tauri::command]
fn download_pause(app: AppHandle, id: String) {
    job_ctl(&app, &id, Some(true), false);
}

#[tauri::command]
fn download_resume(app: AppHandle, id: String) {
    job_ctl(&app, &id, Some(false), false);
}

#[tauri::command]
fn download_cancel(app: AppHandle, id: String) {
    job_ctl(&app, &id, None, true);
}

#[tauri::command]
fn open_dir(path: String) {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer").arg(path).spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = path;
    }
}

/* ============================================================
 * 入口
 * ============================================================ */
fn main() {
    tauri::Builder::default()
        /* 单实例必须最先注册：否则第二个进程会跟第一个抢托盘和 Alt+X */
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main(app);
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed
                        && shortcut.matches(Modifiers::ALT, Code::KeyX)
                    {
                        toggle_overlay(app);
                    }
                })
                .build(),
        )
        /* tile:// 瓦片代理：磁盘缓存优先，未命中才走 CDN 并落盘。
           必须建在 Builder 上——配置里的主窗口在 setup 之前就已加载，
           建晚了会有一批瓦片请求打空。 */
        .register_asynchronous_uri_scheme_protocol("tile", |_ctx, request, responder| {
            let rel = request.uri().path().to_string();
            log::log(&format!("proto HIT   {} (host={})", request.uri(), request.uri().host().unwrap_or("?")));
            std::thread::spawn(move || {
                let resp = match tile::get(&rel) {
                    Some(b) => tauri::http::Response::builder()
                        .status(200)
                        .header("Content-Type", "image/webp")
                        .header("Cache-Control", "public, max-age=31536000, immutable")
                        .body(b),
                    None => tauri::http::Response::builder()
                        .status(404)
                        .header("Cache-Control", "no-store")
                        .body(Vec::new()),
                };
                responder.respond(resp.unwrap_or_else(|_| tauri::http::Response::new(Vec::new())));
            });
        })
        .setup(|app| {
            let cfg = config::load();
            let tdir = cfg.tiles_dir();
            log::log(&format!(
                "=== 启动 v{} | exe={} | tileDir={}",
                app.package_info().version,
                config::exe_dir().to_string_lossy(),
                tdir.to_string_lossy()
            ));
            tile::set_dir(tdir);
            app.manage(St {
                cfg: Mutex::new(cfg),
                dl: download::Manager::default(),
            });

            build_tray(app.handle())?;

            /* Alt+X 可能被别的程序占用，失败只警告不致命——托盘菜单仍可开关 */
            if let Err(e) = app
                .global_shortcut()
                .register(Shortcut::new(Some(Modifiers::ALT), Code::KeyX))
            {
                eprintln!("[警告] Alt+X 注册失败（可能已被占用）: {e}");
            }
            Ok(())
        })
        /* 主窗口关闭 = 缩到托盘，不退出 */
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            hide_overlay,
            js_probe,
            get_settings,
            set_tile_dir,
            tile_stats,
            download_start,
            download_pause,
            download_resume,
            download_cancel,
            open_dir,
        ])
        .run(tauri::generate_context!())
        .expect("WARDOGS 启动失败");
}
