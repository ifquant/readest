use tradeblazer_compiler::{Interpreter, Lexer, MarketDataContext, Parser, SimpleTradingExecutor};

fn main() {
    // 创建一个简单的脚本来测试解释器功能
    let simple_script = "
    var a = 10;
    var b = 20;
    function test_func(x, y) {
        return x + y;
    }
    ";

    // 创建解释器实例
    let market_data_context = MarketDataContext::new(100);
    let trading_executor: Box<dyn tradeblazer_compiler::TradingExecutor> = Box::new(SimpleTradingExecutor::new());
    let mut interpreter = Interpreter::new(market_data_context, 100, true, trading_executor);

    // 进行词法分析和语法分析
    let mut lexer = Lexer::new(simple_script);
    let (tokens, positions) = lexer.tokenize().expect("词法分析失败");

    let mut parser = Parser::new(tokens, positions);
    parser.set_source(simple_script);
    let script = parser.parse().expect("语法分析失败");

    println!("===== 简单脚本分析成功 ====");
    println!("脚本包含 {} 条语句", script.statements.len());

    // 尝试执行脚本
    if let Err(err) = interpreter.execute(&script) {
        println!("执行脚本时出错: {:?}", err);
    } else {
        println!("\n===== 脚本执行成功 ====");
    }

    // 示例如何使用解释器的公共API
    println!("\n===== 解释器状态信息 ====");
    println!("解释器已初始化，可以处理最多 {} 个K线数据", 100);
    println!("可通过execute方法执行编译好的脚本");
}
