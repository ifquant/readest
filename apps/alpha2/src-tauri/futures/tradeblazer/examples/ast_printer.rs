#[path = "support/script_sources.rs"]
mod script_sources;
use script_sources::SCRIPT_MINIMAL;
use tradeblazer_compiler::run_script_with_options;

fn main() {
    println!("执行脚本并验证编译功能...");

    // 直接使用公共API执行脚本
    if let Err(err) = run_script_with_options(SCRIPT_MINIMAL, None, true, true, None) {
        eprintln!("执行脚本时出错: {}", err);
    } else {
        println!("脚本执行成功，编译功能正常");
    }
}

/*

fn print_ast(ast: &ast::Script) {
    println!("AST结构:");
    for (i, stmt) in ast.statements.iter().enumerate() {
        println!("语句 {}:", i);
        print_statement(stmt, 1);
    }
}

fn print_statement(stmt: &ast::Statement, indent: usize) {
    let indent_str = " ".repeat(indent * 4);

    match stmt {
        ast::Statement::FunctionDef { name, params, body } => {
            println!("{}{}函数定义: {}, 参数: {:?}", indent_str, "->", name, params);
            println!("{}{}函数体:", indent_str, "->");
            for (i, body_stmt) in body.iter().enumerate() {
                println!("{}{}语句 {}:", indent_str, "->", i);
                print_statement(body_stmt, indent + 2);
            }
        },
        ast::Statement::VarDecl { name, value } => {
            println!("{}{}变量声明: {}", indent_str, "->", name);
            if let Some(value) = value {
                println!("{}{}初始值:", indent_str, "->");
                print_expression(value, indent + 1);
            }
        },
        ast::Statement::Assign { name, value } => {
            println!("{}{}赋值语句: {}", indent_str, "->", name);
            println!("{}{}表达式:", indent_str, "->");
            print_expression(value, indent + 1);
        },
        ast::Statement::ExprStmt(expr) => {
            println!("{}{}表达式语句:", indent_str, "->");
            print_expression(expr, indent + 1);
        },
        ast::Statement::Series { name } => {
            println!("{}{}序列定义: {}", indent_str, "->", name);
        },
        ast::Statement::If { condition, then_block, else_block } => {
            println!("{}{}条件语句:", indent_str, "->");
            println!("{}{}条件:", indent_str, "->");
            print_expression(condition, indent + 1);
            println!("{}{}then块:", indent_str, "->");
            for (i, stmt) in then_block.iter().enumerate() {
                print_statement(stmt, indent + 1);
            }
            if let Some(else_block) = else_block {
                println!("{}{}else块:", indent_str, "->");
                for (i, stmt) in else_block.iter().enumerate() {
                    print_statement(stmt, indent + 1);
                }
            }
        },
        ast::Statement::For { var, start, end, step, body } => {
            println!("{}{}循环语句: 变量={}", indent_str, "->", var);
            println!("{}{}起始值:", indent_str, "->");
            print_expression(start, indent + 1);
            println!("{}{}结束值:", indent_str, "->");
            print_expression(end, indent + 1);
            if let Some(step) = step {
                println!("{}{}步长:", indent_str, "->");
                print_expression(step, indent + 1);
            }
            println!("{}{}循环体:", indent_str, "->");
            for (i, stmt) in body.iter().enumerate() {
                print_statement(stmt, indent + 1);
            }
        },
        ast::Statement::Return(expr) => {
            println!("{}{}返回语句:", indent_str, "->");
            if let Some(expr) = expr {
                print_expression(expr, indent + 1);
            }
        },
        ast::Statement::TradeCommand { cmd, params } => {
            println!("{}{}交易指令: {}", indent_str, "->", cmd);
            for (i, param) in params.iter().enumerate() {
                println!("{}{}参数 {}:", indent_str, "->", i);
                print_expression(param, indent + 1);
            }
        },
    }
}

fn print_expression(expr: &ast::Expr, indent: usize) {
    let indent_str = " ".repeat(indent * 4);

    match expr {
        ast::Expr::Number(n) => {
            println!("{}{}数字: {}", indent_str, "->", n);
        },
        ast::Expr::StringLiteral(s) => {
            println!("{}{}字符串: {}", indent_str, "->", s);
        },
        ast::Expr::Boolean(b) => {
            println!("{}{}布尔值: {}", indent_str, "->", b);
        },
        ast::Expr::Variable(name) => {
            println!("{}{}变量: {}", indent_str, "->", name);
        },
        ast::Expr::BinaryOp { op, left, right } => {
            println!("{}{}二元运算: {:?}", indent_str, "->", op);
            println!("{}{}左操作数:", indent_str, "->");
            print_expression(left, indent + 1);
            println!("{}{}右操作数:", indent_str, "->");
            print_expression(right, indent + 1);
        },
        ast::Expr::Call { name, args } => {
            println!("{}{}函数调用: {}", indent_str, "->", name);
            for (i, arg) in args.iter().enumerate() {
                println!("{}{}参数 {}:", indent_str, "->", i);
                print_expression(arg, indent + 1);
            }
        },
        ast::Expr::Indicator(name) => {
            println!("{}{}指标: {}", indent_str, "->", name);
        },
    }
}

*/
