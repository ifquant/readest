use std::fs;
use tradeblazer_compiler::{run_script_with_options, runtime_error, CompileError};

fn main() -> Result<(), CompileError> {
    // 解析命令行参数
    // 简单地把所有参数收集为 Vec，便于逐个解析标志。
    let args: Vec<String> = std::env::args().collect();

    // 检查是否提供了脚本文件路径
    if args.len() < 2 {
        println!(
            "用法: tradeblazer_compiler <脚本文件路径> [--ast <AST文件路径>] [--ast-password <密码>] [--force-compile] [--debug]"
        );
        println!("选项:");
        println!("  --ast <AST文件路径>    指定AST文件路径，用于加载或保存AST");
        println!("  --ast-password <密码>   如果指定了AST文件，为其加密或解密使用的密码");
        println!("  --force-compile        强制重新编译脚本，即使提供了AST文件");
        println!("  --debug                启用调试模式，保留字符串映射以便检查变量");
        return Err(runtime_error("请提供TradeBlazer脚本文件路径"));
    }

    let script_path = &args[1];
    let mut ast_file: Option<&str> = None;
    let mut ast_password: Option<&str> = None;
    let mut force_compile = false;
    let mut debug_mode = false;

    // 解析额外的选项
    let mut i = 2;
    while i < args.len() {
        match args[i].as_str() {
            "--ast" if i + 1 < args.len() => {
                ast_file = Some(&args[i + 1]);
                i += 2;
            }
            "--force-compile" => {
                force_compile = true;
                i += 1;
            }
            "--ast-password" if i + 1 < args.len() => {
                ast_password = Some(&args[i + 1]);
                i += 2;
            }
            "--debug" => {
                debug_mode = true;
                i += 1;
            }
            _ => {
                println!("未知选项: {}", args[i]);
                println!(
                    "用法: tradeblazer_compiler <脚本文件路径> [--ast <AST文件路径>] [--ast-password <密码>] [--force-compile] [--debug]"
                );
                return Err(runtime_error(&format!("未知选项: {}", args[i])));
            }
        }
    }

    // 直接一次性读入脚本：脚本文件通常较小，避免复杂的流式读取。
    let script_content = fs::read_to_string(script_path)
        .map_err(|e| runtime_error(&format!("无法读取文件 {}: {}", script_path, e)))?;

    // 编译并执行脚本
    run_script_with_options(
        &script_content,
        ast_file,
        force_compile,
        debug_mode,
        ast_password,
    )?;

    Ok(())
}
