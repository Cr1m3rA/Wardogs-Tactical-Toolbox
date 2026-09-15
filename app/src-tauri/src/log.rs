/* =====================================================================
 * 诊断日志（exe 同级 wardogs-debug.log）
 * ---------------------------------------------------------------------
 * 出问题时让用户把这个文件发过来，比「我这儿不动了」有用得多。
 * 上限 1 MB，超了就重开，避免长期运行把盘写满。
 * ===================================================================== */
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

const MAX: u64 = 1024 * 1024;

fn path() -> PathBuf {
    crate::config::exe_dir().join("wardogs-debug.log")
}

/* 「跳过」和「该写但没有补记行」是两回事——一开始用 Option 同时表达这两层含义，
   结果每一条新消息都被当成「跳过」丢掉，日志一个字节都没写出来。用枚举分开。 */
enum Verdict {
    /// 与上一条完全相同，只累加计数，不落盘
    Suppressed,
    /// 该写这一条；Some 表示顺带补记上一批被折叠了多少次
    Write(Option<String>),
}

/// 与上一条完全相同的消息只记一次并计数。
/// 批量下载失败时 65535 条一模一样的报错会把日志刷爆，反而盖住真正的第一条。
fn dedup(s: &str) -> Verdict {
    static LAST: Mutex<(String, u64)> = Mutex::new((String::new(), 0));
    let mut last = LAST.lock().unwrap_or_else(|e| e.into_inner());
    if last.0 == s {
        last.1 += 1;
        return Verdict::Suppressed;
    }
    let tail = if last.1 > 0 {
        Some(format!("  （上一条重复 {} 次）", last.1))
    } else {
        None
    };
    last.0 = s.to_string();
    last.1 = 0;
    Verdict::Write(tail)
}

pub fn log(s: &str) {
    static LOCK: Mutex<()> = Mutex::new(());
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());

    let tail = match dedup(s) {
        Verdict::Suppressed => return,
        Verdict::Write(t) => t,
    };

    let p = path();
    if let Ok(md) = std::fs::metadata(&p) {
        if md.len() > MAX {
            let _ = std::fs::remove_file(&p);
        }
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&p) {
        if let Some(t) = tail {
            let _ = writeln!(f, "{}", t);
        }
        let _ = writeln!(f, "{}", s);
    }
}
