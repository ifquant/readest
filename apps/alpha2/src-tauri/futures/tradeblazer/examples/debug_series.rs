#[path = "support/script_sources.rs"]
mod script_sources;
use script_sources::SCRIPT_SERIES;
use tradeblazer_compiler::{Lexer, Parser};

fn main() {
    let script = SCRIPT_SERIES;
    println!("脚本内容:\n{}", script);

    // 词法分析
    let mut lexer = Lexer::new(script);
    let (tokens, positions) = lexer.tokenize().expect("词法分析失败");

    // 打印token流
    println!("\nToken流:");
    for (i, token) in tokens.iter().enumerate() {
        println!("{}: {:?}", i, token);
    }

    // 语法分析
    let mut parser = Parser::new(tokens, positions);
    let _ast = parser.parse().expect("语法分析失败");

    println!("\n语法分析成功，AST已生成");
}
