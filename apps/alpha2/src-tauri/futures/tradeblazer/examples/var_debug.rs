#[path = "support/script_sources.rs"]
mod script_sources;
use script_sources::SCRIPT_MINIMAL;
use tradeblazer_compiler::run_script;

fn main() {
    let script = SCRIPT_MINIMAL;

    println!("测试脚本内容:\n{}", script);

    // 创建一个更简单的测试脚本，直接在全局作用域中声明变量
    let global_script = "var global_var = 10;\nPrint(global_var);\n";

    println!("\n测试全局变量脚本:\n{}", global_script);

    // 测试全局变量
    println!("\n执行全局变量脚本:");
    match run_script(global_script) {
        Ok(_) => println!("全局变量脚本执行成功"),
        Err(e) => println!("全局变量脚本执行失败: {}", e),
    }

    // 测试原始的函数内部变量脚本
    println!("\n执行函数内部变量脚本:");
    match run_script(&script) {
        Ok(_) => println!("函数内部变量脚本执行成功"),
        Err(e) => println!("函数内部变量脚本执行失败: {}", e),
    }

    // 创建一个包含全局变量和函数内部变量的测试脚本
    let mixed_script = "var global_var = 10;\nfunction OnBar() {\n    var local_var = 20;\n    Print(global_var);\n    Print(local_var);\n}\n";

    println!("\n混合变量脚本:\n{}", mixed_script);

    // 测试混合变量
    println!("\n执行混合变量脚本:");
    match run_script(mixed_script) {
        Ok(_) => println!("混合变量脚本执行成功"),
        Err(e) => println!("混合变量脚本执行失败: {}", e),
    }
}
