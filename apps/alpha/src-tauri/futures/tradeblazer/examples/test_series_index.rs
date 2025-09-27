#[path = "support/script_sources.rs"]
mod script_sources;
use script_sources::SCRIPT_SERIES_INDEX;
use tradeblazer_compiler::run_script;

fn main() {
    // 运行脚本
    if let Err(err) = run_script(SCRIPT_SERIES_INDEX) {
        eprintln!("脚本执行失败: {}", err);
        std::process::exit(1);
    }
}
