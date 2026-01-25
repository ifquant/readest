//! TradeBlazer脚本编译器综合测试程序
//! 使用内嵌脚本验证语义规则

use clap::{App, Arg};
use std::process::exit;
use tradeblazer_compiler::run_script_with_options;

#[path = "support/script_sources.rs"]
mod script_sources;
use script_sources::*;

/// 测试结果枚举
enum TestResult {
    Passed,
    Failed(String),
}

/// 通用测试配置结构体
struct TestConfig {
    test_name: &'static str,
    script: &'static str,
    expect_success: bool,
    success_message: &'static str,
    failure_message: &'static str,
}

/// 通用测试函数
fn test_tradeblazer_rule(config: &TestConfig) -> TestResult {
    println!("=== {} ===", config.test_name);
    println!("脚本内容:\n{}", config.script);

    match run_script_with_options(config.script, None, true, true, None) {
        Ok(_) => {
            if config.expect_success {
                println!("测试通过: {}", config.success_message);
                TestResult::Passed
            } else {
                let error_msg = config.failure_message.to_string();
                eprintln!("测试失败: {}", error_msg);
                TestResult::Failed(error_msg)
            }
        }
        Err(err) => {
            if !config.expect_success {
                println!("脚本执行结果: 检测到预期的错误");
                println!("错误信息: {}", err);
                println!("测试通过: {}", config.success_message);
                TestResult::Passed
            } else {
                let error_msg = format!("{}\n错误信息: {}", config.failure_message, err);
                eprintln!("测试失败: {}", error_msg);
                TestResult::Failed(error_msg)
            }
        }
    }
}

fn test_global_vars() -> TestResult {
    let config = TestConfig {
        test_name: "测试全局变量正常使用",
        script: SCRIPT_VALID_GLOBAL_VARS,
        expect_success: true,
        success_message: "全局变量在函数内可以正常使用",
        failure_message: "全局变量在函数内使用时发生错误",
    };
    test_tradeblazer_rule(&config)
}

fn test_var_declaration() -> TestResult {
    let config = TestConfig {
        test_name: "测试变量声明规则",
        script: SCRIPT_VAR_DECLARATION,
        expect_success: false,
        success_message: "函数内部不允许声明新变量的规则已正确实现",
        failure_message: "函数内部声明新变量没有被检测到错误",
    };
    test_tradeblazer_rule(&config)
}

fn test_series_rules() -> TestResult {
    let config = TestConfig {
        test_name: "测试序列变量声明规则",
        script: SCRIPT_SERIES_RULES,
        expect_success: false,
        success_message: "函数内部不允许声明序列变量的规则已正确实现",
        failure_message: "函数内部声明序列变量没有被检测到错误",
    };
    test_tradeblazer_rule(&config)
}

fn test_function_nesting() -> TestResult {
    let config = TestConfig {
        test_name: "测试函数嵌套定义规则",
        script: SCRIPT_FUNCTION_NESTING,
        expect_success: false,
        success_message: "不允许在函数内部定义嵌套函数的规则已正确实现",
        failure_message: "函数内部定义嵌套函数没有被检测到错误",
    };
    test_tradeblazer_rule(&config)
}

fn test_for_loop_vars() -> TestResult {
    let config = TestConfig {
        test_name: "测试循环变量声明规则",
        script: SCRIPT_FOR_LOOP_VARS,
        expect_success: false,
        success_message: "不允许在函数内部声明循环变量的规则已正确实现",
        failure_message: "函数内部声明循环变量没有被检测到错误",
    };
    test_tradeblazer_rule(&config)
}

fn test_var_redefinition() -> TestResult {
    let config = TestConfig {
        test_name: "测试变量重复定义检测",
        script: SCRIPT_VAR_REDEFINITION,
        expect_success: false,
        success_message: "变量重复定义的检测已正确实现",
        failure_message: "变量重复定义没有被检测到错误",
    };
    test_tradeblazer_rule(&config)
}

fn test_var_init_values() -> TestResult {
    let config = TestConfig {
        test_name: "测试变量初始化值规则",
        script: SCRIPT_VAR_INIT_VALUE,
        expect_success: true,
        success_message: "变量初始化值类型处理正确实现",
        failure_message: "变量初始化值类型处理未正确实现",
    };
    test_tradeblazer_rule(&config)
}

fn main() {
    let matches = App::new("TradeBlazer Compiler Comprehensive Test")
        .version("1.0")
        .author("Developer")
        .about("Tests various semantic rules of the TradeBlazer compiler")
        .arg(
            Arg::with_name("test")
                .value_name("TEST_NAME")
                .help("Specify which test to run (global_vars, var_declaration, series_rules, function_nesting, for_loop_vars, var_redefinition, var_init_values, all)")
                .required(false)
                .default_value("all")
                .index(1),
        )
        .get_matches();

    let test_name = matches.value_of("test").unwrap_or("all");

    println!("=== TradeBlazer脚本编译器综合测试 ===");
    println!("运行测试: {}", test_name);

    let mut passed_count = 0;
    let mut failed_count = 0;
    let mut record_result = |result: TestResult| match result {
        TestResult::Passed => passed_count += 1,
        TestResult::Failed(reason) => {
            failed_count += 1;
            println!("失败详情: {}", reason);
        }
    };

    match test_name {
        "global_vars" => record_result(test_global_vars()),
        "var_declaration" => record_result(test_var_declaration()),
        "series_rules" => record_result(test_series_rules()),
        "function_nesting" => record_result(test_function_nesting()),
        "for_loop_vars" => record_result(test_for_loop_vars()),
        "var_redefinition" => record_result(test_var_redefinition()),
        "var_init_values" => record_result(test_var_init_values()),
        "all" => {
            for (name, test_fn) in [
                ("global_vars", test_global_vars as fn() -> TestResult),
                (
                    "var_declaration",
                    test_var_declaration as fn() -> TestResult,
                ),
                ("series_rules", test_series_rules as fn() -> TestResult),
                (
                    "function_nesting",
                    test_function_nesting as fn() -> TestResult,
                ),
                ("for_loop_vars", test_for_loop_vars as fn() -> TestResult),
                (
                    "var_redefinition",
                    test_var_redefinition as fn() -> TestResult,
                ),
                (
                    "var_init_values",
                    test_var_init_values as fn() -> TestResult,
                ),
            ] {
                println!();
                println!("开始测试: {}", name);
                record_result(test_fn());
            }
        }
        _ => {
            eprintln!("未知的测试名称: {}", test_name);
            eprintln!("可用的测试名称: global_vars, var_declaration, series_rules, function_nesting, for_loop_vars, var_redefinition, var_init_values, all");
            exit(1);
        }
    }

    println!();
    println!("=== 测试摘要 ===");
    println!("总测试数: {}", passed_count + failed_count);
    println!("通过测试数: {}", passed_count);
    println!("失败测试数: {}", failed_count);

    if failed_count > 0 {
        println!("测试未全部通过");
        exit(1);
    } else {
        println!("所有测试通过！");
        exit(0);
    }
}
