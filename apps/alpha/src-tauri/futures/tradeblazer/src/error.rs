//! 错误类型定义
//! 统一的错误处理机制，提供详细的错误信息

use std::fmt;

/// 错误类型枚举
#[derive(Debug, PartialEq)]
pub enum ErrorType {
    /// 词法错误
    Lexical,
    /// 语法错误
    Syntax,
    /// 语义错误
    Semantic,
    /// 运行时错误
    Runtime,
    /// 其他错误
    Other,
}

/// 错误位置信息
#[derive(Debug, PartialEq, Clone)]
pub struct ErrorLocation {
    /// 行号，从1开始
    pub line: usize,
    /// 列号，从1开始
    pub column: usize,
    /// 可选的文件名
    pub file_name: Option<String>,
}

impl ErrorLocation {
    pub fn new(line: usize, column: usize) -> Self {
        Self {
            line,
            column,
            file_name: None,
        }
    }

    pub fn with_file(mut self, file_name: &str) -> Self {
        // 提供链式 API，保持调用端代码简洁。
        self.file_name = Some(file_name.to_string());
        self
    }
}

impl fmt::Display for ErrorLocation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.file_name {
            Some(file) => write!(f, "{}:{}:{}", file, self.line, self.column),
            None => write!(f, "{}:{}", self.line, self.column),
        }
    }
}

/// 编译器错误
#[derive(Debug)]
pub struct CompileError {
    /// 错误类型
    pub error_type: ErrorType,
    /// 错误位置
    pub location: Option<ErrorLocation>,
    /// 错误消息
    pub message: String,
    /// 源代码片段（可选）
    pub source_code: Option<String>,
    /// 修复建议
    pub suggestions: Vec<String>,
}

impl CompileError {
    // 简易 Builder 模式：链式配置位置/源码片段，调用方不需要构造大字段 struct。
    pub fn new(error_type: ErrorType, message: String) -> Self {
        Self {
            error_type,
            location: None,
            message,
            source_code: None,
            suggestions: Vec::new(),
        }
    }

    pub fn with_location(mut self, location: ErrorLocation) -> Self {
        self.location = Some(location);
        self
    }

    pub fn with_source(mut self, source_code: &str) -> Self {
        self.source_code = Some(source_code.to_string());
        self
    }

    pub fn with_suggestion(mut self, suggestion: impl Into<String>) -> Self {
        self.suggestions.push(suggestion.into());
        self
    }

    pub fn with_suggestions<I, S>(mut self, suggestions: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.suggestions
            .extend(suggestions.into_iter().map(|s| s.into()));
        self
    }
}

impl fmt::Display for CompileError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let error_type_str = match self.error_type {
            ErrorType::Lexical => "词法错误",
            ErrorType::Syntax => "语法错误",
            ErrorType::Semantic => "语义错误",
            ErrorType::Runtime => "运行时错误",
            ErrorType::Other => "错误",
        };

        match &self.location {
            Some(loc) => {
                write!(f, "{} [{}]: {}", error_type_str, loc, self.message)?;

                // 如果有源代码片段，显示出来并标记错误位置
                // 这里使用 `saturating_sub` 避免在 line 为 0 时下溢（尽管正常情况下 line >= 1）。
                if let Some(source) = &self.source_code {
                    let lines: Vec<&str> = source.lines().collect();
                    if let Some(line_text) = lines.get(loc.line.saturating_sub(1)) {
                        write!(f, "\n{}", line_text.trim())?;
                        // 经典的“插入 ^ 指向列”做法，便于快速定位问题。
                        write!(f, "\n{:width$}^", "", width = loc.column - 1)?;
                    }
                }
                for suggestion in &self.suggestions {
                    write!(f, "\n建议: {}", suggestion)?;
                }
                Ok(())
            }
            None => {
                write!(f, "{}: {}", error_type_str, self.message)?;
                for suggestion in &self.suggestions {
                    write!(f, "\n建议: {}", suggestion)?;
                }
                Ok(())
            }
        }
    }
}

impl std::error::Error for CompileError {}

/// 简化错误创建的辅助函数
pub fn lex_error(message: &str) -> CompileError {
    CompileError::new(ErrorType::Lexical, message.to_string())
}

pub fn syntax_error(message: &str) -> CompileError {
    CompileError::new(ErrorType::Syntax, message.to_string())
}

pub fn semantic_error(message: &str) -> CompileError {
    CompileError::new(ErrorType::Semantic, message.to_string())
}

pub fn runtime_error(message: &str) -> CompileError {
    CompileError::new(ErrorType::Runtime, message.to_string())
}
