use crate::ast::{Expr, FunctionParam, Op, ParamKind, Script, Statement};
use crate::error::{CompileError, ErrorLocation, ErrorType};
use crate::lexer::Token;
use std::str::FromStr;
/// 解析器结构体
pub struct Parser {
    tokens: Vec<Token>,
    token_positions: Vec<ErrorLocation>,
    pos: usize,
    source: Option<String>,
}

impl Parser {
    /// 创建新的解析器实例
    pub fn new(tokens: Vec<Token>, token_positions: Vec<ErrorLocation>) -> Self {
        Parser {
            tokens,
            token_positions,
            pos: 0,
            source: None,
        }
    }

    /// 设置源文件内容
    pub fn set_source(&mut self, source: &str) {
        self.source = Some(source.to_string());
    }

    /// 获取当前token的位置信息
    pub fn current_token_location(&self) -> Option<ErrorLocation> {
        if self.pos < self.token_positions.len() {
            Some(self.token_positions[self.pos].clone())
        } else {
            None
        }
    }

    /// 解析脚本
    pub fn parse(&mut self) -> Result<Script, CompileError> {
        let mut statements = Vec::new();
        let mut errors = Vec::new();

        // 解析所有语句
        while self.current_token() != &Token::Eof {
            match self.parse_statement() {
                Ok(statement) => statements.push(statement),
                Err(err) => {
                    errors.push(err);
                    // 尝试从错误中恢复
                    self.synchronize();
                }
            }
        }

        if errors.is_empty() {
            Ok(Script::new(statements))
        } else {
            // 返回第一个错误作为主错误
            Err(errors.into_iter().next().unwrap())
        }
    }

    /// 尝试从错误中恢复
    fn synchronize(&mut self) {
        // 采用最简单的 panic 模式恢复策略：跳过直到分号或下一条语句的起始关键字，
        // 保证后续解析还能继续给出更多错误信息。
        // 这是语法分析器里常见的“同步点”技巧，可以隔离错误范围。
        self.consume();

        while self.current_token() != &Token::Eof {
            if self.current_token() == &Token::Semicolon {
                self.consume();
                return;
            }

            match self.current_token() {
                Token::If | Token::For | Token::Function | Token::Return | Token::Var => return,
                _ => self.consume(),
            }
        }
    }

    /// 解析语句
    fn parse_statement(&mut self) -> Result<Statement, CompileError> {
        match self.current_token() {
            Token::If => self.parse_if_statement(),
            Token::For => self.parse_for_statement(),
            Token::Function => self.parse_function_def(),
            Token::Return => self.parse_return_statement(),
            Token::Var => self.parse_var_declaration(),
            Token::Series => self.parse_series_statement(),
            Token::Ident(_) => {
                if let Some(array_assign) = self.try_parse_array_assignment()? {
                    Ok(array_assign)
                } else if let Some(assign) = self.try_parse_assignment()? {
                    Ok(assign)
                } else {
                    self.parse_expression_statement()
                }
            }
            _ => self.parse_expression_statement(),
        }
    }

    /// 解析if语句
    fn parse_if_statement(&mut self) -> Result<Statement, CompileError> {
        self.consume(); // 消耗 if
        self.consume_expected(Token::LParen)?;
        let condition = self.parse_expression()?;
        self.consume_expected(Token::RParen)?;
        let then_block = self.parse_block()?;

        // 解析else块
        let else_block = if self.current_token() == &Token::Else {
            self.consume(); // 消耗 else

            if self.current_token() == &Token::If {
                // 处理 else if
                vec![self.parse_if_statement()?]
            } else {
                self.parse_block()?
            }
        } else {
            Vec::new()
        };

        Ok(Statement::If {
            condition,
            then_block,
            else_block: if else_block.is_empty() {
                None
            } else {
                Some(else_block)
            },
        })
    }

    /// 解析for循环
    fn parse_for_statement(&mut self) -> Result<Statement, CompileError> {
        self.consume(); // 消耗 for
        self.consume_expected(Token::LParen)?;

        let var = if self.current_token() == &Token::Var {
            self.consume();
            self.parse_identifier("loop variable name")?
        } else {
            self.parse_identifier("loop variable name")?
        };

        self.consume_expected(Token::Equals)?;
        let start = self.parse_expression()?;
        self.consume_expected(Token::Semicolon)?;

        let condition = if self.current_token() == &Token::Semicolon {
            // 支持 `for (;;)` 风格：缺省条件默认视作 `true`，交由运行期控制跳出。
            Expr::Boolean(true)
        } else {
            self.parse_expression()?
        };

        self.consume_expected(Token::Semicolon)?;
        let step = self.parse_for_step_expression(&var)?;

        self.consume_expected(Token::RParen)?;
        let body = self.parse_block()?;

        Ok(Statement::For {
            var,
            start,
            end: condition,
            step,
            body,
        })
    }

    fn parse_for_step_expression(&mut self, var: &str) -> Result<Option<Expr>, CompileError> {
        // 将 for-step 中的各种语法糖（`i++`, `i += 2`, `i = i + 2` 等）
        // 统一展开成 `_assign` 调用，让解释器只需要维护一个赋值入口。
        // 这种“语法糖下沉”手法能让运行期逻辑保持统一入口，减少状态机爆炸。
        if self.current_token() == &Token::RParen {
            return Ok(None);
        }

        if self.current_token() == &Token::Ident(var.to_string()) {
            // 尝试匹配递增/递减等特殊写法，失败时回退继续走通用表达式路径。
            let saved_pos = self.pos;
            self.consume();
            let assign_expr = |expr: Expr| Expr::AssignIntrinsic {
                target: var.to_string(),
                value: Box::new(expr),
            };

            let step_expr = match self.current_token() {
                Token::Plus => {
                    self.consume();
                    if self.current_token() == &Token::Plus {
                        self.consume();
                        let expr = Expr::BinaryOp {
                            op: Op::Add,
                            left: Box::new(Expr::Variable(var.to_string())),
                            right: Box::new(Expr::Number(1.0)),
                        };
                        Some(assign_expr(expr))
                    } else {
                        self.pos = saved_pos;
                        Some(self.parse_expression()?)
                    }
                }
                Token::Minus => {
                    self.consume();
                    if self.current_token() == &Token::Minus {
                        self.consume();
                        let expr = Expr::BinaryOp {
                            op: Op::Subtract,
                            left: Box::new(Expr::Variable(var.to_string())),
                            right: Box::new(Expr::Number(1.0)),
                        };
                        Some(assign_expr(expr))
                    } else {
                        self.pos = saved_pos;
                        Some(self.parse_expression()?)
                    }
                }
                Token::PlusEquals => {
                    self.consume();
                    let expr = self.parse_expression()?;
                    let binary = Expr::BinaryOp {
                        op: Op::Add,
                        left: Box::new(Expr::Variable(var.to_string())),
                        right: Box::new(expr),
                    };
                    Some(assign_expr(binary))
                }
                Token::MinusEquals => {
                    self.consume();
                    let expr = self.parse_expression()?;
                    let binary = Expr::BinaryOp {
                        op: Op::Subtract,
                        left: Box::new(Expr::Variable(var.to_string())),
                        right: Box::new(expr),
                    };
                    Some(assign_expr(binary))
                }
                Token::StarEquals => {
                    self.consume();
                    let expr = self.parse_expression()?;
                    let binary = Expr::BinaryOp {
                        op: Op::Multiply,
                        left: Box::new(Expr::Variable(var.to_string())),
                        right: Box::new(expr),
                    };
                    Some(assign_expr(binary))
                }
                Token::SlashEquals => {
                    self.consume();
                    let expr = self.parse_expression()?;
                    let binary = Expr::BinaryOp {
                        op: Op::Divide,
                        left: Box::new(Expr::Variable(var.to_string())),
                        right: Box::new(expr),
                    };
                    Some(assign_expr(binary))
                }
                Token::Equals => {
                    self.consume();
                    let expr = self.parse_expression()?;
                    Some(assign_expr(expr))
                }
                _ => {
                    self.pos = saved_pos;
                    Some(self.parse_expression()?)
                }
            };

            Ok(step_expr)
        } else {
            Ok(Some(self.parse_expression()?))
        }
    }

    /// 解析函数定义    /// 解析函数定义
    fn parse_function_def(&mut self) -> Result<Statement, CompileError> {
        self.consume(); // 消耗 function
        let name = self.parse_identifier("function name")?;

        self.consume_expected(Token::LParen)?;
        let params = self.parse_parameter_list()?;
        self.consume_expected(Token::RParen)?;

        let body = self.parse_block()?;

        Ok(Statement::FunctionDef { name, params, body })
    }

    /// 解析表达式
    fn parse_expression(&mut self) -> Result<Expr, CompileError> {
        self.parse_binary_expression(0)
    }

    // 使用 precedence climbing 算法解析二元表达式
    // 该算法只需一个函数即可处理不同优先级，是 Pratt Parser 的轻量变体。
    fn parse_binary_expression(&mut self, precedence: u8) -> Result<Expr, CompileError> {
        let mut left = self.parse_primary()?;

        loop {
            let current_precedence = self.current_token_precedence();

            // `<=` 让同优先级的运算符左结合，例如 `a - b - c` 被解析成
            // `(a - b) - c`，符合大多数语言的习惯。
            if current_precedence <= precedence {
                break;
            }

            let op = self.parse_operator()?;
            let right = self.parse_binary_expression(current_precedence)?;

            left = Expr::BinaryOp {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }

        Ok(left)
    }

    /// 解析基本表达式
    fn parse_primary(&mut self) -> Result<Expr, CompileError> {
        match self.current_token() {
            Token::Minus => {
                self.consume();
                let operand = Box::new(self.parse_primary()?);
                Ok(Expr::UnaryOp {
                    op: Op::Negate,
                    operand,
                })
            }
            Token::Plus => {
                self.consume();
                self.parse_primary()
            }
            Token::Not => {
                self.consume();
                let operand = Box::new(self.parse_primary()?);
                Ok(Expr::UnaryOp {
                    op: Op::Not,
                    operand,
                })
            }
            Token::Number(n) => {
                let num = *n;
                self.consume();
                Ok(Expr::Number(num))
            }
            Token::String(s) => {
                let s = s.clone();
                self.consume();
                Ok(Expr::StringLiteral(s))
            }
            Token::True => {
                self.consume();
                Ok(Expr::Boolean(true))
            }
            Token::False => {
                self.consume();
                Ok(Expr::Boolean(false))
            }
            Token::Ident(name) => {
                let name = name.clone();
                self.consume();

                // 检查是否是函数调用
                if self.current_token() == &Token::LParen {
                    self.consume(); // 消耗 (

                    let mut args = Vec::new();
                    while self.current_token() != &Token::RParen {
                        args.push(self.parse_expression()?);

                        if self.current_token() == &Token::Comma {
                            self.consume();
                        } else if self.current_token() != &Token::RParen {
                            let location = self.current_token_location();
                            if let Some(loc) = location {
                                return Err(CompileError::new(
                                    ErrorType::Syntax,
                                    "Expected comma or closing parenthesis in function arguments"
                                        .to_string(),
                                )
                                .with_location(loc)
                                .with_suggestions([
                                    "Separate arguments with ','",
                                    "Add ')' to close the argument list",
                                ]));
                            } else {
                                return Err(CompileError::new(
                                    ErrorType::Syntax,
                                    "Expected comma or closing parenthesis in function arguments"
                                        .to_string(),
                                )
                                .with_suggestions([
                                    "Separate arguments with ','",
                                    "Add ')' to close the argument list",
                                ]));
                            }
                        }
                    }

                    self.consume(); // 消耗 )

                    Ok(Expr::Call { name, args })
                } else {
                        // 检查是否是内置指标名称
                        if let "Close" | "Open" | "High" | "Low" | "Volume" = name.as_str() {
                            // 检查是否是指标+数字的格式，如 Close.1, Open.1 等
                            if self.current_token() == &Token::Dot {
                                self.consume(); // 消耗 .
                                if let Token::Number(n) = self.current_token() {
                                    let data_idx = *n as usize;
                                    self.consume();
                                    
                                    // 将指标名称转换为BarDataType
                                    let data_type = match name.as_str() {
                                        "Close" => crate::ast::BarDataType::Close,
                                        "Open" => crate::ast::BarDataType::Open,
                                        "High" => crate::ast::BarDataType::High,
                                        "Low" => crate::ast::BarDataType::Low,
                                        "Volume" => crate::ast::BarDataType::Volume,
                                        _ => unreachable!(),
                                    };
                                    
                                    // 创建DataSymbol结构
                                    let data_symbol = crate::ast::DataSymbol {
                                        data_idx,
                                        data_type,
                                    };
                                    
                                    return Ok(Expr::Data(data_symbol));
                                } else {
                                    // 如果点号后面不是数字，恢复解析器位置并继续处理
                                    self.pos -= 1;
                                }
                            }
                            
                            // 如果不是Data访问格式，则返回普通的Indicator
                            Ok(Expr::Indicator(
                                crate::ast::IndicatorIdx::from_str(&name).unwrap(),
                            ))
                        } else {
                            // 其余属性访问、方法调用、下标运算都通过伪函数下放到解释器，
                            // 避免在AST层面为每种语法糖引入额外节点类型。
                            // 检查是否是索引访问（如 var[1]）
                            if self.current_token() == &Token::LBracket {
                                self.consume(); // 消耗 [
                                let index = self.parse_expression()?;
                                self.consume_expected(Token::RBracket)?;

                                Ok(Expr::IndexAccess {
                                    target: name,
                                    index: Box::new(index),
                                })
                            } else if self.current_token() == &Token::Dot {
                                // 处理点号访问（如 obj.method() 或 obj.property）
                                // 点号同样被翻译成内部伪函数，原因是解释器用统一的入口
                                // 数据结构（字符串+参数）来执行成员逻辑，能避开静态类型
                                // 检查和可变借用的限制。
                                self.consume(); // 消耗 .
                                if let Token::Ident(method_name) = self.current_token() {
                                    let method_name = method_name.clone();
                                    self.consume();

                                    // 检查是否是方法调用
                                    if self.current_token() == &Token::LParen {
                                        self.consume(); // 消耗 (

                                        let mut args = Vec::new();
                                        while self.current_token() != &Token::RParen {
                                            args.push(self.parse_expression()?);

                                            if self.current_token() == &Token::Comma {
                                                self.consume();
                                            } else if self.current_token() != &Token::RParen {
                                                let location = self.current_token_location();
                                                if let Some(loc) = location {
                                                    return Err(CompileError::new(
                                                        ErrorType::Syntax,
                                                        "Expected comma or closing parenthesis in method arguments".to_string()
                                                    ).with_location(loc).with_suggestions([
                                                        "Separate method arguments with ','",
                                                        "Add ')' to finish the method call",
                                                    ]));
                                                } else {
                                                    return Err(CompileError::new(
                                                        ErrorType::Syntax,
                                                        "Expected comma or closing parenthesis in method arguments".to_string()
                                                    ).with_suggestions([
                                                        "Separate method arguments with ','",
                                                        "Add ')' to finish the method call",
                                                    ]));
                                                }
                                            }
                                        }

                                        self.consume(); // 消耗 )

                                        Ok(Expr::MethodCall {
                                            target: name,
                                            method: method_name,
                                            args,
                                        })
                                    } else {
                                        // 处理属性访问（返回特殊函数调用）
                                        Ok(Expr::PropertyAccess {
                                            target: name,
                                            property: method_name,
                                        })
                                    }
                                } else {
                                    let location = self.current_token_location();
                                    if let Some(loc) = location {
                                        return Err(CompileError::new(
                                            ErrorType::Syntax,
                                            "Expected identifier after dot".to_string(),
                                        )
                                        .with_location(loc)
                                        .with_suggestion(
                                            "Add a property or method name after '.'",
                                        ));
                                    } else {
                                        return Err(CompileError::new(
                                            ErrorType::Syntax,
                                            "Expected identifier after dot".to_string(),
                                        )
                                        .with_suggestion(
                                            "Add a property or method name after '.'",
                                        ));
                                    }
                                }
                            } else {
                                Ok(Expr::Variable(name))
                            }
                        }
                }
            }
            Token::LParen => {
                self.consume(); // 消耗 (
                let expr = self.parse_expression()?;
                self.consume_expected(Token::RParen)?;
                Ok(expr)
            }
            _ => {
                let location = self.current_token_location();
                if let Some(loc) = location {
                    Err(CompileError::new(
                        ErrorType::Syntax,
                        format!("Unexpected token {:?} in expression", self.current_token()),
                    )
                    .with_location(loc)
                    .with_suggestion("Check for a missing operand or extra symbol here"))
                } else {
                    Err(CompileError::new(
                        ErrorType::Syntax,
                        format!("Unexpected token {:?} in expression", self.current_token()),
                    )
                    .with_suggestion("Check for a missing operand or extra symbol here"))
                }
            }
        }
    }

    /// 解析运算符
    fn parse_operator(&mut self) -> Result<Op, CompileError> {
        let op = match self.current_token() {
            Token::Plus => Op::Add,
            Token::Minus => Op::Subtract,
            Token::Star => Op::Multiply,
            Token::Slash => Op::Divide,
            Token::EqualsEquals => Op::Equals,
            Token::NotEquals => Op::NotEquals,
            Token::LessThan => Op::LessThan,
            Token::GreaterThan => Op::GreaterThan,
            Token::LessThanOrEqual => Op::LessThanOrEqual,
            Token::GreaterThanOrEqual => Op::GreaterThanOrEqual,
            Token::AndAnd => Op::LogicalAnd,
            Token::OrOr => Op::LogicalOr,
            _ => {
                let location = self.current_token_location();
                if let Some(loc) = location {
                    return Err(CompileError::new(
                        ErrorType::Syntax,
                        format!("Unexpected token {:?} as operator", self.current_token()),
                    )
                    .with_location(loc)
                    .with_suggestion("Ensure the correct operator appears here"));
                } else {
                    return Err(CompileError::new(
                        ErrorType::Syntax,
                        format!("Unexpected token {:?} as operator", self.current_token()),
                    )
                    .with_suggestion("Ensure the correct operator appears here"));
                }
            }
        };
        self.consume();
        Ok(op)
    }

    /// 获取当前token的优先级
    fn current_token_precedence(&self) -> u8 {
        // 越大的返回值优先级越高，与经典算术优先级保持一致。
        match self.current_token() {
            Token::OrOr => 1,
            Token::AndAnd => 2,
            Token::EqualsEquals | Token::NotEquals => 3,
            Token::LessThan
            | Token::GreaterThan
            | Token::LessThanOrEqual
            | Token::GreaterThanOrEqual => 4,
            Token::Plus | Token::Minus => 5,
            Token::Star | Token::Slash => 6,
            _ => 0,
        }
    }

    /// 获取当前token
    fn current_token(&self) -> &Token {
        if self.pos < self.tokens.len() {
            &self.tokens[self.pos]
        } else {
            &Token::Eof
        }
    }

    fn peek_token(&self) -> &Token {
        if self.pos + 1 < self.tokens.len() {
            &self.tokens[self.pos + 1]
        } else {
            &Token::Eof
        }
    }

    fn try_parse_array_assignment(&mut self) -> Result<Option<Statement>, CompileError> {
        if let Token::Ident(name) = self.current_token() {
            if self.peek_token() == &Token::LBracket {
                let saved_pos = self.pos;
                let saved_positions = self.token_positions.clone();

                let name_clone = name.clone();
                self.consume(); // ident
                self.consume(); // [
                let index = self.parse_expression()?;
                self.consume_expected(Token::RBracket)?;
                if self.current_token() == &Token::Equals {
                    self.consume();
                    let value = self.parse_expression()?;
                    self.consume_semicolon()?;
                    return Ok(Some(Statement::ArrayAssign {
                        name: name_clone,
                        index,
                        value,
                    }));
                }

                self.pos = saved_pos;
                self.token_positions = saved_positions;
            }
        }
        Ok(None)
    }

    fn try_parse_assignment(&mut self) -> Result<Option<Statement>, CompileError> {
        if let Token::Ident(name) = self.current_token() {
            if self.peek_token() == &Token::Equals {
                let name = name.clone();
                self.consume(); // ident
                self.consume(); // =
                let value = self.parse_expression()?;
                self.consume_semicolon()?;
                return Ok(Some(Statement::Assign { name, value }));
            }
        }
        Ok(None)
    }

    /// 消耗当前token
    fn consume(&mut self) {
        if self.pos < self.tokens.len() {
            self.pos += 1;
        }
    }

    /// 消耗指定的token
    fn consume_expected(&mut self, expected: Token) -> Result<(), CompileError> {
        if self.current_token() == &expected {
            self.consume();
            Ok(())
        } else {
            // 常见的“期待 X 结果拿到 Y”错误格式，方便 IDE 直接展示。
            let err = self.syntax_error(format!(
                "Expected {:?}, but found {:?}",
                expected,
                self.current_token()
            ));

            let err = match expected {
                Token::Semicolon => err.with_suggestion("Add ';' at the end of the statement"),
                Token::RParen => {
                    err.with_suggestion("Add ')' to close the parenthesized expression")
                }
                Token::LParen => err.with_suggestion("Check for a missing '(' before this"),
                Token::RBrace => err.with_suggestion("Add '}' to close the block"),
                Token::LBrace => err.with_suggestion("Check for a missing '{' before this block"),
                Token::Comma => err.with_suggestion("Separate list items or arguments with ','"),
                Token::RBracket => err.with_suggestion("Add ']' to close the indexer"),
                Token::LBracket => err.with_suggestion("Check for a missing '[' at the start"),
                _ => err,
            };
            Err(err)
        }
    }

    /// 消耗分号
    fn consume_semicolon(&mut self) -> Result<(), CompileError> {
        self.consume_expected(Token::Semicolon)
    }

    fn parse_block(&mut self) -> Result<Vec<Statement>, CompileError> {
        self.consume_expected(Token::LBrace)?;
        let mut statements = Vec::new();
        while self.current_token() != &Token::RBrace && self.current_token() != &Token::Eof {
            statements.push(self.parse_statement()?);
        }
        self.consume_expected(Token::RBrace)?;
        Ok(statements)
    }

    fn parse_parameter_list(&mut self) -> Result<Vec<FunctionParam>, CompileError> {
        let mut params = Vec::new();
        if self.current_token() == &Token::RParen {
            return Ok(params);
        }

        loop {
            params.push(self.parse_function_param()?);
            match self.current_token() {
                Token::Comma => {
                    self.consume();
                }
                Token::RParen => break,
                _ => {
                    return Err(self
                        .syntax_error(
                            "Expected comma or closing parenthesis in function parameters",
                        )
                        .with_suggestions([
                            "Separate parameters with ','",
                            "Add ')' at the end of the parameter list",
                        ]));
                }
            }
        }

        Ok(params)
    }

    fn parse_function_param(&mut self) -> Result<FunctionParam, CompileError> {
        let kind = match self.current_token() {
            Token::Var => {
                self.consume();
                if self.current_token() == &Token::Ampersand {
                    self.consume();
                    ParamKind::VarByRef
                } else {
                    ParamKind::VarByValue
                }
            }
            Token::Series => {
                self.consume();
                if self.current_token() == &Token::Ampersand {
                    self.consume();
                }
                ParamKind::SeriesByRef
            }
            _ => {
                return Err(self
                    .syntax_error("Expected parameter type (var or series) in function definition")
                    .with_suggestions([
                        "Parameters must start with 'var' or 'series'",
                        "Example: var price or series& history",
                    ]));
            }
        };

        let name = self.parse_identifier("parameter name")?;
        Ok(FunctionParam {
            name,
            kind,
            id: None,
        })
    }

    fn parse_identifier(&mut self, context: &str) -> Result<String, CompileError> {
        if let Token::Ident(name) = self.current_token() {
            let name = name.clone();
            self.consume();
            Ok(name)
        } else {
            // 带上下文的报错信息，有助于定位缺失标识符的语境。
            Err(self
                .syntax_error(format!("Expected {}", context))
                .with_suggestion(format!("Provide {}", context)))
        }
    }

    fn syntax_error(&self, message: impl Into<String>) -> CompileError {
        if let Some(loc) = self.current_token_location() {
            CompileError::new(ErrorType::Syntax, message.into()).with_location(loc)
        } else {
            CompileError::new(ErrorType::Syntax, message.into())
        }
    }

    /// 解析return语句
    fn parse_return_statement(&mut self) -> Result<Statement, CompileError> {
        self.consume(); // 消耗 return 关键字

        let expr =
            if self.current_token() != &Token::Semicolon && self.current_token() != &Token::Eof {
                Some(self.parse_expression()?)
            } else {
                None
            };

        self.consume_semicolon()?;
        Ok(Statement::Return(expr))
    }

    /// 解析series语句
    fn parse_series_statement(&mut self) -> Result<Statement, CompileError> {
        self.consume(); // 消耗 series 关键字

        let name = self.parse_identifier("series name after series keyword")?;
        self.consume_semicolon()?;

        Ok(Statement::Series { name })
    }

    /// 解析变量声明
    fn parse_var_declaration(&mut self) -> Result<Statement, CompileError> {
        self.consume(); // 消耗 var
        let name = self.parse_identifier("variable name after var")?;

        if self.current_token() == &Token::LBracket {
            self.consume();
            let size_token = self.current_token();
            let size = if let Token::Number(n) = size_token {
                if *n < 0.0 {
                    return Err(self.syntax_error("数组长度必须为非负整数"));
                }
                *n as usize
            } else {
                return Err(self.syntax_error("数组长度必须是数字"));
            };
            self.consume();
            self.consume_expected(Token::RBracket)?;
            self.consume_semicolon()?;
            return Ok(Statement::ArrayDecl { name, size });
        }

        let init = if self.current_token() == &Token::Equals {
            self.consume();
            Some(self.parse_expression()?)
        } else {
            None
        };

        self.consume_semicolon()?;
        if let Some(init_expr) = init {
            Ok(Statement::VarDecl {
                name,
                value: Some(init_expr),
            })
        } else {
            Ok(Statement::VarDecl { name, value: None })
        }
    }

    /// 解析表达式语句
    fn parse_expression_statement(&mut self) -> Result<Statement, CompileError> {
        let expr = self.parse_expression()?;
        self.consume_semicolon()?;
        Ok(Statement::ExprStmt(expr))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::Op;
    use crate::lexer::Lexer;

    #[test]
    fn test_parse_assignment() {
        let script = "var a = 10 + 20;";
        let mut lexer = Lexer::new(script);
        let (tokens, positions) = lexer.tokenize().unwrap();

        let mut parser = Parser::new(tokens, positions);
        parser.set_source(script);
        let script = parser.parse().unwrap();

        assert_eq!(script.statements.len(), 1);
    }

    #[test]
    fn test_syntax_error() {
        let script = "var a = ;";
        let mut lexer = Lexer::new(script);
        let (tokens, positions) = lexer.tokenize().unwrap();

        let mut parser = Parser::new(tokens, positions);
        parser.set_source(script);
        let result = parser.parse();

        assert!(result.is_err());
        if let Err(err) = result {
            assert_eq!(err.error_type, ErrorType::Syntax);
            assert!(err.location.is_some());
            assert!(err.message.contains("Unexpected token"));
            assert!(!err.suggestions.is_empty());
        }
    }

    #[test]
    fn test_parse_unary_minus_and_logic() {
        let script = "var a = -10; if (a < 0 && true) { var b = -a; }";
        let mut lexer = Lexer::new(script);
        let (tokens, positions) = lexer.tokenize().unwrap();

        let mut parser = Parser::new(tokens, positions);
        parser.set_source(script);
        let ast = parser.parse().unwrap();

        assert_eq!(ast.statements.len(), 2);
        match &ast.statements[0] {
            Statement::VarDecl {
                value: Some(value), ..
            } => match value {
                Expr::UnaryOp { op, .. } => assert!(matches!(op, Op::Negate)),
                _ => panic!("expected unary negate"),
            },
            _ => panic!("expected assignment"),
        }
    }
}
