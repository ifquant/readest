#![allow(dead_code)]

pub const SCRIPT_MINIMAL: &str = r#"
function OnInit() {
    Print("Hello, TradeBlazer!");
}
"#;

pub const SCRIPT_CLOSE: &str = r#"
// 测试 Close 指标
function OnBar() {
    Print("Close值:", Close);
}
"#;

pub const SCRIPT_COMMENTS: &str = r#"
# 这是#号开头的注释
// 这是双斜杠开头的注释
/* 这是多行块注释 */
var headline = "comments working";

function OnInit() {
    Print(headline);
}

function OnBar() {
    Print("bar", Close);
}
"#;

pub const SCRIPT_GLOBAL_VARS: &str = r#"
var totalTrades = 0;
var initialCapital = 100000;

function OnInit() {
    Print("Total trades:", totalTrades);
    Print("Initial capital:", initialCapital);
}

function OnTick() {
    Print("Tick trades:", totalTrades);
}

function OnBar() {
    Print("Bar trades:", totalTrades);
}
"#;

pub const SCRIPT_NOT_OPERATOR: &str = r#"
var bool_true = true;
var bool_false = false;

function OnInit() {
    Print("测试逻辑非运算符:");
    Print("!true =", !bool_true);
    Print("!false =", !bool_false);
    Print("!!true =", !!bool_true);
    Print("!(10 > 5) =", !(10 > 5));
    Print("!(10 < 5) =", !(10 < 5));
}

function OnBar() {
    Print("OnBar事件中的逻辑运算:");
    Print("!true =", !bool_true);
}
"#;

pub const SCRIPT_SERIES: &str = r#"
series close_prices;

function OnInit() {
    Print("初始化序列变量");
}

function OnBar() {
    Print("序列长度:", length(close_prices));
}
"#;

pub const SCRIPT_SERIES_INDEX: &str = r#"
series close_prices;

function OnBar() {
    Print("close_prices[0] 可访问:", close_prices[0]);
}
"#;

pub const SCRIPT_VAR_INIT_TYPE: &str = r#"
var num_var = 100;
var str_var = "hello";
var bool_var = true;

function OnInit() {
    Print("初始化策略");
    Print("数值变量:", num_var);
    Print("数值加法:", 100 + 1);
    Print("字符串变量:", str_var + "aaa");
    Print("布尔变量:", bool_var);
    Print("逻辑非:", !bool_var);
}

function OnBar() {
    Print("OnBar中的数值变量:", num_var);
}
"#;

pub const SCRIPT_VAR_INIT_VALUE: &str = r#"
var num_var = 100;
var calculated_var = 10 * 5 + 2;

function OnInit() {
    Print("初始化策略");
}

function OnBar() {
    Print("数值变量:", num_var);
    Print("数值变量2:", num_var + 2);
    Print("计算表达式结果:", calculated_var);
}
"#;

pub const SCRIPT_VAR_KEYWORD: &str = r#"
# 这是一个测试var关键字的脚本

var totalTrades = 0;
var initialCapital = 100000;
var strategyName = "Test Strategy";

function OnInit() {
    Print("Strategy initialized with capital:", initialCapital);
    Print("Total trades:", totalTrades);
}

function OnBar() {
    Print("Strategy name:", strategyName);
}
"#;

pub const SCRIPT_VALID_GLOBAL_VARS: &str = r#"
var global_var = 100;

function OnInit() {
    Print("全局变量 global_var 已成功在函数内访问");
}

function OnTick() {}

function OnBar() {}
"#;

pub const SCRIPT_VAR_DECLARATION: &str = r#"
var global_var = 100;
series close_series;

function OnInit() {
    Print("OnInit: 全局变量 global_var =", global_var);
    var local_var = 200;
    Print("这个代码不应该被执行到");
}

function OnTick() {}

function OnBar() {}
"#;

pub const SCRIPT_SERIES_RULES: &str = r#"
var global_var = 100;
series global_series;

function OnInit() {
    Print("OnInit: 全局变量 global_var =", global_var);
    series local_series;
    Print("这个代码不应该被执行到");
}

function OnTick() {}

function OnBar() {}
"#;

pub const SCRIPT_FUNCTION_NESTING: &str = r#"
var global_var = 100;

function OnInit() {
    Print("OnInit: 全局变量 global_var =", global_var);
    function NestedFunction() {
        Print("这个嵌套函数不应该被允许定义");
    }
    Print("这个代码不应该被执行到");
}

function OnTick() {}

function OnBar() {}
"#;

pub const SCRIPT_FOR_LOOP_VARS: &str = r#"
var global_var = 100;

function OnInit() {
    Print("OnInit: 全局变量 global_var =", global_var);
    for (var i = 0; i < 10; i = i + 1) {
        Print("循环索引:", i);
    }
    Print("这个代码不应该被执行到");
}

function OnTick() {}

function OnBar() {}
"#;

pub const SCRIPT_VAR_REDEFINITION: &str = r#"
var global_var = 100;
var global_var = 200;

function OnInit() {
    Print("这个代码不应该被执行到");
}

function OnTick() {}

function OnBar() {}
"#;
