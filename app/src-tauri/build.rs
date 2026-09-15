fn main() {
    /* exe 的图标资源是 build.rs 读 icons/ 生成出来的，cargo 默认并不知道
       那些文件变了没有：只换图标、不动一行代码时，build.rs 不重跑，
       编译也照样「成功」，但链接进去的还是上一版的图标——而且 exe 体积
       可能一模一样，从外面完全看不出来。所以把 icons/ 声明成输入。 */
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
