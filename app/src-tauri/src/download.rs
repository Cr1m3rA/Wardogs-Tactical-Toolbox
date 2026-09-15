/* =====================================================================
 * 批量下载地图瓦片（对应「给用户一个下载按钮」的需求）
 * ---------------------------------------------------------------------
 * 支持暂停 / 继续 / 取消，且天然支持断点续传：已存在于磁盘的瓦片直接跳过，
 * 所以取消后重来不会重下已完成的部分。1.79 GB 的下载必须能中断重来。
 * 全程在线程池里跑，用 event 往前端推进度，绝不阻塞 UI。
 * ===================================================================== */
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub const WORKERS: usize = 8;

pub struct Job {
    pub id: String,
    pub map: String,
    pub cancel: AtomicBool,
    pub paused: AtomicBool,
    pub done: AtomicUsize,
    pub failed: AtomicUsize,
    /// 本次真正下载了多少张（跳过的不算），用来算速度和剩余时间
    pub fetched: AtomicUsize,
    pub bytes: AtomicU64,
    pub total: usize,
}

#[derive(Default)]
pub struct Manager {
    pub jobs: Mutex<HashMap<String, Arc<Job>>>,
}

#[derive(Serialize, Clone)]
pub struct Progress {
    pub id: String,
    pub map: String,
    pub done: usize,
    pub total: usize,
    pub failed: usize,
    pub bytes: u64,
    /// 张/秒，前端据此显示剩余时间
    pub rate: f64,
    pub paused: bool,
    pub finished: bool,
    /// 用户主动取消而结束。必须和「下完了」分开：前端据此把进度条撤掉、
    /// 并且不再自动开始下一张图。
    pub cancelled: bool,
}

/// 进度上报的最小间隔
const TICK_MS: u64 = 400;
/// 分片睡眠的粒度。取消/暂停要立刻反映到界面上，而原来是一觉睡满 TICK_MS，
/// 用户点完取消最长要干等 400 ms 才有反应——看起来就是「进度条卡住一会才消失」。
const NAP_SLICE_MS: u64 = 25;

/// 分片睡眠，最多 total_ms；期间一旦检测到取消、或暂停状态发生变化就提前返回，
/// 让上层立刻重发一次进度。提前返回只发生一次，随后状态不再变，不会空转。
fn nap(job: &Job, total_ms: u64) {
    let paused0 = job.paused.load(Ordering::Relaxed);
    let mut slept = 0;
    while slept < total_ms {
        if job.cancel.load(Ordering::Relaxed) { return; }
        if job.paused.load(Ordering::Relaxed) != paused0 { return; }
        std::thread::sleep(Duration::from_millis(NAP_SLICE_MS));
        slept += NAP_SLICE_MS;
    }
}

/// 每一级是 2^z × 2^z 的网格；按由粗到细的顺序排，先下完的立刻可用。
fn build_list(map: &str, min_z: u32, max_z: u32) -> Vec<String> {
    let mut v = Vec::new();
    for z in min_z..=max_z {
        let n: u32 = 1 << z;
        for x in 0..n {
            for y in 0..n {
                v.push(format!("{map}/zoom_{z}/{x}_{y}.webp"));
            }
        }
    }
    v
}

pub fn start(app: AppHandle, job: Arc<Job>, min_z: u32, max_z: u32, root: PathBuf) {
    let list = Arc::new(build_list(&job.map, min_z, max_z));

    // 进度上报线程：固定节奏推，与工作线程解耦，前端不必猜
    {
        let app = app.clone();
        let job = job.clone();
        std::thread::spawn(move || {
            /* 先发再睡：这样进度条在任务开始的那一刻就出现，
               而不是先干等一个 tick 才有第一帧。 */
            let mut last_t = Instant::now();
            let mut last_fetched = 0usize;
            let mut rate = 0f64;
            loop {
                let done = job.done.load(Ordering::Relaxed);
                let total = job.total;
                let fetched = job.fetched.load(Ordering::Relaxed);
                let cancelled = job.cancel.load(Ordering::Relaxed);
                let paused = job.paused.load(Ordering::Relaxed);

                /* 瞬时速率 = 本片窗口内新下的张数 / 窗口时长。
                   原来算的是「累计张数 / 任务开始至今」——暂停过之后分母里
                   混进了暂停时间，剩余时间会越算越离谱。 */
                let now = Instant::now();
                let dt = now.duration_since(last_t).as_secs_f64();
                let df = fetched.saturating_sub(last_fetched);
                if df > 0 && dt > 0.05 { rate = df as f64 / dt; }
                last_t = now;
                last_fetched = fetched;

                let finished = done >= total || cancelled;
                let _ = app.emit("dl-progress", Progress {
                    id: job.id.clone(),
                    map: job.map.clone(),
                    done, total,
                    failed: job.failed.load(Ordering::Relaxed),
                    bytes: job.bytes.load(Ordering::Relaxed),
                    rate,
                    paused,
                    finished,
                    cancelled,
                });
                if finished { break; }
                nap(&job, TICK_MS);
            }
        });
    }

    let cursor = Arc::new(AtomicUsize::new(0));
    for _ in 0..WORKERS {
        let job = job.clone();
        let list = list.clone();
        let cursor = cursor.clone();
        let root = root.clone();
        std::thread::spawn(move || loop {
            if job.cancel.load(Ordering::Relaxed) { break; }
            // 暂停时原地空转等待，不退出线程，这样「继续」是瞬时的
            while job.paused.load(Ordering::Relaxed) && !job.cancel.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(50));
            }
            if job.cancel.load(Ordering::Relaxed) { break; }

            let i = cursor.fetch_add(1, Ordering::Relaxed);
            if i >= list.len() { break; }
            let rel = &list[i];
            let file = root.join(rel);

            // 断点续传：已有且非空就跳过。取消后重来不会重下。
            if let Ok(md) = std::fs::metadata(&file) {
                if md.is_file() && md.len() > 0 {
                    job.done.fetch_add(1, Ordering::Relaxed);
                    continue;
                }
            }

            match crate::tile::fetch(rel) {
                Some(b) => {
                    crate::tile::write_atomic(&file, &b);
                    job.bytes.fetch_add(b.len() as u64, Ordering::Relaxed);
                    job.fetched.fetch_add(1, Ordering::Relaxed);
                }
                None => { job.failed.fetch_add(1, Ordering::Relaxed); }
            }
            job.done.fetch_add(1, Ordering::Relaxed);
        });
    }
}
