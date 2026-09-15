/* =====================================================================
 * 瓦片代理 + 持久化磁盘缓存（对应原始需求第 3 条）
 * ---------------------------------------------------------------------
 * 渲染层用 http://tile.localhost/{map}/zoom_{z}/{x}_{y}.webp 请求，这里：
 *   1. 命中磁盘 → 直接返回字节（不走网络）
 *   2. 未命中   → 从 CDN 拉取，落盘，再返回
 *   3. 失败     → 404，交给渲染层走「祖先瓦片兜底」
 * 第 1 条是关键：原版 tileCache 是纯内存 Map，应用一重启全部重下——
 * 这是「地图加载极慢」的真正原因（CDN 的 TTFB 每块 0.6–2.8 秒）。
 * ===================================================================== */
use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::Duration;

pub const CDN: &str = "https://assets.wardogs-artillery.com/releases/assets-v1/maps/tiles";

/// 瓦片根目录。config 里改过就跟着变，所以是 RwLock 而不是 OnceLock<值>。
fn dir_slot() -> &'static RwLock<PathBuf> {
    static D: OnceLock<RwLock<PathBuf>> = OnceLock::new();
    D.get_or_init(|| RwLock::new(crate::config::Config::default().tiles_dir()))
}

pub fn set_dir(p: PathBuf) {
    if let Ok(mut d) = dir_slot().write() {
        *d = p;
    }
}

pub fn dir() -> PathBuf {
    dir_slot().read().map(|d| d.clone()).unwrap_or_default()
}

fn inflight() -> &'static Mutex<HashMap<String, Arc<OnceLock<Vec<u8>>>>> {
    static M: OnceLock<Mutex<HashMap<String, Arc<OnceLock<Vec<u8>>>>>, > = OnceLock::new();
    M.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 只允许 "map/zoom_N/x_y.webp" 这种形状，挡掉 ../ 之类的路径穿越。
pub fn sanitize(rel: &str) -> Option<String> {
    let rel = rel.trim_start_matches('/');
    if rel.is_empty() || rel.len() > 128 { return None; }
    let ok = rel.split('/').all(|seg| {
        !seg.is_empty() && seg != "." && seg != ".."
            && seg.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-')
    });
    if !ok || !rel.ends_with(".webp") { return None; }
    Some(rel.to_string())
}

/// 取瓦片：磁盘优先，其次 CDN 并落盘。None = 拿不到（渲染层据此走兜底）。
pub fn get(rel: &str) -> Option<Vec<u8>> {
    let raw = rel;
    let Some(rel) = sanitize(rel) else {
        crate::log::log(&format!("tile REJECT  raw={raw}"));
        return None;
    };
    let file = dir().join(&rel);

    if let Ok(b) = std::fs::read(&file) {
        if !b.is_empty() {
            crate::log::log(&format!("tile DISK    {rel} {}B", b.len()));
            return Some(b);
        }
    }

    /* 并发去重：同一块瓦片被多个请求同时命中时，只有一个真去下载，
       其余等它的结果——否则平铺时同一块会被拉好几次。 */
    let follower = {
        let mut m = inflight().lock().unwrap();
        match m.get(&rel) {
            Some(cell) => Some(cell.clone()),
            None => {
                m.insert(rel.clone(), Arc::new(OnceLock::new()));
                None
            }
        }
    };

    if let Some(cell) = follower {
        for _ in 0..2500 {
            if let Some(v) = cell.get() {
                return if v.is_empty() { None } else { Some(v.clone()) };
            }
            std::thread::sleep(Duration::from_millis(12));
        }
        return None;
    }

    let got = fetch(&rel).unwrap_or_default();
    if !got.is_empty() {
        write_atomic(&file, &got);
        crate::log::log(&format!("tile NET     {rel} {}B", got.len()));
    } else {
        crate::log::log(&format!("tile MISS    {rel}"));
    }
    if let Some(cell) = inflight().lock().unwrap().remove(&rel) {
        let _ = cell.set(got.clone());
    }
    if got.is_empty() { None } else { Some(got) }
}

/// 先写临时文件再改名：中途中断不会留下半截文件被当成「已下载」。
pub fn write_atomic(file: &PathBuf, bytes: &[u8]) {
    if let Some(p) = file.parent() {
        if std::fs::create_dir_all(p).is_err() { return; }
    }
    let tmp = file.with_extension("webp.part");
    if std::fs::write(&tmp, bytes).is_ok() {
        let _ = std::fs::rename(&tmp, file);
    }
}

pub fn fetch(rel: &str) -> Option<Vec<u8>> {
    let url = format!("{CDN}/{rel}");
    // 不要用 .ok()? 把错误吞掉：曾经因为这里静默失败，症状表现为
    // 「瓦片不落盘、渲染层悄悄回退到直连 CDN」，查了很久。错因要写进诊断日志。
    let resp = match ureq::get(&url).timeout(Duration::from_secs(25)).call() {
        Ok(r) => r,
        Err(e) => {
            crate::log::log(&format!("fetch ERR   {url}\n  {e}"));
            return None;
        }
    };
    let mut buf = Vec::with_capacity(32 * 1024);
    if let Err(e) = resp
        .into_reader()
        .take(4 * 1024 * 1024)      // 单块瓦片不可能超过 4MB，防异常响应撑爆内存
        .read_to_end(&mut buf)
    {
        crate::log::log(&format!("fetch READ  {url}\n  {e}"));
        return None;
    }
    if buf.is_empty() { None } else { Some(buf) }
}

/* ---------- 磁盘占用统计（给下载界面显示「当前占用」） ---------- */
#[derive(serde::Serialize, Default)]
pub struct ZoomStat {
    pub z: u32,
    pub have: u32,
    pub total: u32,
}

#[derive(serde::Serialize, Default)]
pub struct MapStat {
    pub id: String,
    pub have: u32,
    pub total: u32,
    pub bytes: u64,
    pub zooms: Vec<ZoomStat>,
}

/// 扫盘统计每个地图每一级已下载多少张、占多少字节。
/// 只 read_dir 不读文件内容，1.7GB 规模下也是秒级。
pub fn stats(map_ids: &[&str], max_zoom: u32) -> Vec<MapStat> {
    let root = dir();
    let mut out = Vec::new();
    for id in map_ids {
        let mut ms = MapStat { id: id.to_string(), ..Default::default() };
        for z in 0..=max_zoom {
            let n = 1u32 << z;
            let zd = root.join(id).join(format!("zoom_{z}"));
            let mut have = 0u32;
            let mut bytes = 0u64;
            if let Ok(rd) = std::fs::read_dir(&zd) {
                for e in rd.flatten() {
                    if let Ok(md) = e.metadata() {
                        if md.is_file() {
                            have += 1;
                            bytes += md.len();
                        }
                    }
                }
            }
            ms.have += have;
            ms.bytes += bytes;
            ms.zooms.push(ZoomStat { z, have, total: n * n });
        }
        ms.total = (0..=max_zoom).map(|z| (1u32 << z) * (1u32 << z)).sum();
        out.push(ms);
    }
    out
}
