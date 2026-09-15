/* =====================================================================
 * 便携配置：悬浮窗位置尺寸 + 瓦片目录
 * ---------------------------------------------------------------------
 * 存在 exe 同级目录（便携，拷走整个文件夹即带走配置）。若该目录不可写
 * （比如放在 Program Files 下），退回当前工作目录，绝不因为写配置失败而崩。
 * ===================================================================== */
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Config {
    /// 悬浮窗上次的位置尺寸；None = 还没存过，用默认值
    #[serde(default)]
    pub overlay: Option<Bounds>,
    /// 瓦片目录；None = 用 exe 同级的 tiles/
    #[serde(default)]
    pub tile_dir: Option<String>,
}

pub fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn config_path() -> PathBuf {
    exe_dir().join("wardogs-config.json")
}

pub fn load() -> Config {
    std::fs::read_to_string(config_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(cfg: &Config) {
    if let Ok(s) = serde_json::to_string_pretty(cfg) {
        let _ = std::fs::write(config_path(), s);
    }
}

impl Config {
    /// 瓦片根目录。默认 exe 同级 tiles/ —— 便携，且与本仓库现有 tiles/ 布局一致。
    pub fn tiles_dir(&self) -> PathBuf {
        match self.tile_dir.as_deref() {
            Some(d) if !d.trim().is_empty() => PathBuf::from(d),
            _ => exe_dir().join("tiles"),
        }
    }
}
