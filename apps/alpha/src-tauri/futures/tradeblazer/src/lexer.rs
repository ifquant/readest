//! 词法分析器
//! 将TradeBlazer脚本转换为Token流

use crate::error::{lex_error, CompileError, ErrorLocation};
use std::iter::Peekable;
use std::str::Chars;

#[derive(Debug, PartialEq, Clone)]
pub enum Token {
    // 关键字
    If,
    Else,
    For,
    Function,
    Return,
    Var,
    Series,
    True,
    False,
    // 标识符
    Ident(String),
    // 字面量
    Number(f64),
    String(String),
    // 运算符
    Plus,
    Minus,
    Star,
    Slash,
    Equals,
    PlusEquals,  // +=
    MinusEquals, // -=
    StarEquals,  // *=
    SlashEquals, // /=
    EqualsEquals,
    NotEquals,
    LessThan,
    GreaterThan,
    LessThanOrEqual,
    GreaterThanOrEqual,
    Not, // ! 逻辑非
    AndAnd,
    OrOr,
    Ampersand,
    // 分隔符
    LParen,
    RParen,
    LBrace,
    RBrace,
    LBracket, // 左方括号 [
    RBracket, // 右方括号 ]
    Comma,
    Semicolon,
    Dot, // 点号 .
    // 结束标记
    Eof,
}

/// `Peekable` 在这里非常关键：我们既需要按字符推进，又要在遇到复合运算符
///（如 `==`、`+=`）或注释前窥视下一个字符，`chars().peekable()` 能够让我们在
///不消费字符的情况下查看即将到来的输入。
/// 这也是“单次扫描 + 回看”常见实现方式，避免为了回退引入手动索引。
pub struct Lexer<'a> {
    input: Peekable<Chars<'a>>,
    line: usize,
    column: usize,
    source: &'a str,
}

impl<'a> Lexer<'a> {
    pub fn new(input: &'a str) -> Self {
        Lexer {
            input: input.chars().peekable(),
            line: 1,
            column: 1,
            source: input,
        }
    }

    /// 词法分析并返回Token流和对应的位置信息
    pub fn tokenize(&mut self) -> Result<(Vec<Token>, Vec<ErrorLocation>), CompileError> {
        let mut tokens = Vec::new();
        let mut positions = Vec::new();

        while let Some(c) = self.next_char() {
            // 经典的 DFA 式分支：Rust 的 `match` 能将不同词法分支编译成高效跳转表。
            match c {
                // 忽略空白字符
                ' ' | '\t' | '\n' | '\r' => continue,
                // `#` 行注释
                '#' => self.skip_line_comment(),
                '/' => {
                    let start_location = self.current_location();
                    if self.match_char('=') {
                        tokens.push(Token::SlashEquals);
                        positions.push(start_location);
                    } else if self.match_char('/') {
                        self.skip_line_comment();
                    } else if self.match_char('*') {
                        self.skip_block_comment(start_location)?;
                    } else {
                        tokens.push(Token::Slash);
                        positions.push(start_location);
                    }
                }
                '+' => {
                    let start_location = self.current_location();
                    if self.match_char('=') {
                        tokens.push(Token::PlusEquals);
                    } else {
                        tokens.push(Token::Plus);
                    }
                    positions.push(start_location);
                }
                '-' => {
                    let start_location = self.current_location();
                    if self.match_char('=') {
                        tokens.push(Token::MinusEquals);
                    } else {
                        tokens.push(Token::Minus);
                    }
                    positions.push(start_location);
                }
                '*' => {
                    let start_location = self.current_location();
                    if self.match_char('=') {
                        tokens.push(Token::StarEquals);
                    } else {
                        tokens.push(Token::Star);
                    }
                    positions.push(start_location);
                }
                '(' => {
                    tokens.push(Token::LParen);
                    positions.push(self.current_location());
                }
                ')' => {
                    tokens.push(Token::RParen);
                    positions.push(self.current_location());
                }
                '{' => {
                    tokens.push(Token::LBrace);
                    positions.push(self.current_location());
                }
                '}' => {
                    tokens.push(Token::RBrace);
                    positions.push(self.current_location());
                }
                '[' => {
                    tokens.push(Token::LBracket);
                    positions.push(self.current_location());
                }
                ']' => {
                    tokens.push(Token::RBracket);
                    positions.push(self.current_location());
                }
                ',' => {
                    tokens.push(Token::Comma);
                    positions.push(self.current_location());
                }
                ';' => {
                    tokens.push(Token::Semicolon);
                    positions.push(self.current_location());
                }
                '.' => {
                    let start_location = self.current_location();
                    if self.peek_is_digit() {
                        let number = self.lex_number_literal('.', start_location.clone())?;
                        tokens.push(Token::Number(number));
                        positions.push(start_location);
                    } else {
                        tokens.push(Token::Dot);
                        positions.push(start_location);
                    }
                }
                '=' => {
                    let start_location = self.current_location();
                    if self.match_char('=') {
                        tokens.push(Token::EqualsEquals);
                    } else {
                        tokens.push(Token::Equals);
                    }
                    positions.push(start_location);
                }
                '!' => {
                    let start_location = self.current_location();
                    if self.match_char('=') {
                        tokens.push(Token::NotEquals);
                    } else {
                        tokens.push(Token::Not);
                    }
                    positions.push(start_location);
                }
                '<' => {
                    let start_location = self.current_location();
                    if self.match_char('=') {
                        tokens.push(Token::LessThanOrEqual);
                    } else {
                        tokens.push(Token::LessThan);
                    }
                    positions.push(start_location);
                }
                '>' => {
                    let start_location = self.current_location();
                    if self.match_char('=') {
                        tokens.push(Token::GreaterThanOrEqual);
                    } else {
                        tokens.push(Token::GreaterThan);
                    }
                    positions.push(start_location);
                }
                '&' => {
                    let start_location = self.current_location();
                    if self.match_char('&') {
                        tokens.push(Token::AndAnd);
                    } else {
                        tokens.push(Token::Ampersand);
                    }
                    positions.push(start_location);
                }
                '|' => {
                    let start_location = self.current_location();
                    if self.match_char('|') {
                        tokens.push(Token::OrOr);
                        positions.push(start_location);
                    } else {
                        return Err(lex_error("意外的字符: |")
                            .with_location(start_location)
                            .with_source(self.source)
                            .with_suggestion("Use '||' for logical OR, or remove the extra '|'"));
                    }
                }
                '"' => {
                    let start_location = self.current_location();
                    let literal = self.lex_string_literal(start_location.clone())?;
                    tokens.push(Token::String(literal));
                    positions.push(start_location);
                }
                '0'..='9' => {
                    let start_location = self.current_location();
                    let number = self.lex_number_literal(c, start_location.clone())?;
                    tokens.push(Token::Number(number));
                    positions.push(start_location);
                }
                'a'..='z' | 'A'..='Z' | '_' => {
                    let start_location = self.current_location();
                    let ident = self.lex_identifier(c);
                    let token = match ident.as_str() {
                        "if" => Token::If,
                        "else" => Token::Else,
                        "for" => Token::For,
                        "function" => Token::Function,
                        "return" => Token::Return,
                        "var" => Token::Var,
                        "series" => Token::Series,
                        "true" => Token::True,
                        "false" => Token::False,
                        _ => Token::Ident(ident),
                    };
                    tokens.push(token);
                    positions.push(start_location);
                }
                _ => {
                    let location = ErrorLocation::new(self.line, self.column);
                    return Err(lex_error(&format!("意外的字符: {}", c))
                        .with_location(location)
                        .with_source(self.source)
                        .with_suggestion(
                            "Replace unsupported characters with valid TradeBlazer syntax",
                        ));
                }
            }
        }

        // 追加 EOF 哨兵，避免解析阶段额外处理边界。
        tokens.push(Token::Eof);
        positions.push(self.current_location());
        Ok((tokens, positions))
    }

    fn skip_line_comment(&mut self) {
        while let Some(&ch) = self.peek_char() {
            if ch == '\n' {
                break;
            }
            self.next_char();
        }
    }

    fn skip_block_comment(&mut self, start_location: ErrorLocation) -> Result<(), CompileError> {
        while let Some(ch) = self.next_char() {
            if ch == '*' && self.match_char('/') {
                return Ok(());
            }
        }

        Err(lex_error("未结束的块注释")
            .with_location(start_location)
            .with_source(self.source)
            .with_suggestion("Add '*/' to close the block comment"))
    }

    fn lex_string_literal(
        &mut self,
        start_location: ErrorLocation,
    ) -> Result<String, CompileError> {
        let mut literal = String::new();

        while let Some(ch) = self.next_char() {
            match ch {
                '\\' => {
                    if let Some(escaped) = self.next_char() {
                        let translated = match escaped {
                            'n' => '\n',
                            'r' => '\r',
                            't' => '\t',
                            '\\' => '\\',
                            '"' => '"',
                            other => other,
                        };
                        // 典型的转义序列翻译方式：先解析，再写入原始字符串。
                        literal.push(translated);
                    } else {
                        break;
                    }
                }
                '"' => return Ok(literal),
                _ => literal.push(ch),
            }
        }

        Err(lex_error("字符串缺少结束引号")
            .with_location(start_location)
            .with_source(self.source)
            .with_suggestion("Add a closing double quote to the string"))
    }

    fn lex_number_literal(
        &mut self,
        first_char: char,
        start_location: ErrorLocation,
    ) -> Result<f64, CompileError> {
        let mut num_str = String::new();
        num_str.push(first_char);

        while let Some(&next) = self.peek_char() {
            if next.is_ascii_digit() || matches!(next, '.' | 'e' | 'E') {
                num_str.push(next);
                self.next_char();
            } else if (next == '+' || next == '-')
                && matches!(num_str.chars().last(), Some('e') | Some('E'))
            {
                // 支持科学计数法中的 `e+10` 之类写法。
                num_str.push(next);
                self.next_char();
            } else {
                break;
            }
        }

        num_str.parse::<f64>().map_err(|_| {
            lex_error(&format!("无效的数字: {}", num_str))
                .with_location(start_location)
                .with_source(self.source)
                .with_suggestion("Check the number format for duplicate decimal points or invalid exponent syntax")
        })
    }

    fn lex_identifier(&mut self, first_char: char) -> String {
        let mut ident = String::new();
        ident.push(first_char);

        while let Some(&next) = self.peek_char() {
            if next.is_ascii_alphanumeric() || next == '_' {
                ident.push(next);
                self.next_char();
            } else {
                break;
            }
        }

        ident
    }

    fn peek_is_digit(&mut self) -> bool {
        matches!(self.peek_char(), Some(ch) if ch.is_ascii_digit())
    }

    fn match_char(&mut self, expected: char) -> bool {
        match self.peek_char() {
            Some(&next) if next == expected => {
                self.next_char();
                true
            }
            _ => false,
        }
    }

    /// 返回下一个字符，同时更新行列信息。由于源码经常需要精确的列号，我们在
    /// 遇到换行时重置列号，在普通字符时自增。这里的列号以“下一个要读取的
    /// 字符”位置表示，因此 `current_location` 会做一次回调调整。
    fn next_char(&mut self) -> Option<char> {
        let c = self.input.next();
        if let Some(ch) = c {
            if ch == '\n' {
                self.line += 1;
                self.column = 1;
            } else {
                self.column += 1;
            }
        }
        c
    }

    fn peek_char(&mut self) -> Option<&char> {
        self.input.peek()
    }

    // 获取当前位置
    /// 此函数返回的是“刚刚消费的字符”的位置，因此需要在 `column` 基础上减一。
    /// `saturating_sub` 确保在极端情况下不会发生下溢。列号统一从 1 开始，更贴近
    /// 终端或编辑器的显示习惯。
    pub fn current_location(&self) -> ErrorLocation {
        let column = if self.column > 0 { self.column - 1 } else { 0 };
        // 列号在词法阶段常常“指向上一个字符”，这里做一次安全的回退修正。
        ErrorLocation::new(self.line, if column == 0 { 1 } else { column })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ErrorType;

    #[test]
    fn test_lexer_basic() {
        let script = r#"
            var a = 10 + 20;
            if (a > 15) {
                Print("a is greater than 15");
            }
        "#;

        let mut lexer = Lexer::new(script);
        let (tokens, _) = lexer.tokenize().unwrap();

        // 简单验证token流是否符合预期
        assert!(tokens.contains(&Token::Var));
        assert!(tokens
            .iter()
            .any(|t| matches!(t, Token::Ident(s) if s == "a")));
        assert!(tokens.contains(&Token::Number(10.0)));
        assert!(tokens.contains(&Token::Plus));
        assert!(tokens.contains(&Token::Number(20.0)));
        assert!(tokens.contains(&Token::If));
    }

    #[test]
    fn test_lexer_with_positions() {
        let script = "var a = 10;";
        let mut lexer = Lexer::new(script);
        let (tokens, positions) = lexer.tokenize().unwrap();

        // 验证tokens和positions的数量是否匹配
        assert_eq!(tokens.len(), positions.len());

        // 验证基本token的位置是否合理
        assert!(matches!(tokens[0], Token::Var));
        assert_eq!(positions[0].line, 1);
        assert_eq!(positions[0].column, 1);
    }

    #[test]
    fn test_lexer_error_handling() {
        let script = "var a = 10.2.3;";
        let mut lexer = Lexer::new(script);
        let result = lexer.tokenize();

        assert!(result.is_err());
        if let Err(err) = result {
            assert_eq!(err.error_type, ErrorType::Lexical);
            assert!(err.message.contains("无效的数字"));
            assert_eq!(err.location.as_ref().unwrap().line, 1);
            assert_eq!(err.location.as_ref().unwrap().column, 9);
            assert!(!err.suggestions.is_empty());
            assert!(err
                .suggestions
                .iter()
                .any(|s| s.to_lowercase().contains("number")));
        }
    }
}
