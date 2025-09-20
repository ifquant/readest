# TradeBlazer 脚本引擎 API 文档

## 1. 概述

本文档详细描述了TradeBlazer脚本引擎的API接口，包括各核心模块的功能、参数和使用方法。开发者可以通过这些API来集成、扩展和使用TradeBlazer脚本引擎。

## 2. 核心模块API

### 2.1 词法分析器 (Lexer) API

#### 2.1.1 创建词法分析器

```rust
pub fn new(input: &str) -> Self
```

**功能**：创建一个新的词法分析器实例。

**参数**：
- `input`: 要分析的TradeBlazer脚本文本。

**返回值**：词法分析器实例。

#### 2.1.2 获取下一个Token

```rust
pub fn next_token(&mut self) -> Token
```

**功能**：获取脚本文本中的下一个Token。

**参数**：无。

**返回值**：下一个Token对象。

#### 2.1.3 Token结构

```rust
pub struct Token {
    pub token_type: TokenType,
    pub literal: String,
    pub line: u32,
    pub column: u32,
}
```

**字段说明**：
- `token_type`: Token的类型，如关键字、标识符、运算符等。
- `literal`: Token的文本内容。
- `line`: Token所在的行号。
- `column`: Token所在的列号。

### 2.2 语法分析器 (Parser) API

#### 2.2.1 创建语法分析器

```rust
pub fn new(lexer: Lexer) -> Self
```

**功能**：创建一个新的语法分析器实例。

**参数**：
- `lexer`: 词法分析器实例。

**返回值**：语法分析器实例。

#### 2.2.2 解析脚本

```rust
pub fn parse_script(&mut self) -> Result<Script, ParseError>
```

**功能**：解析整个TradeBlazer脚本，生成抽象语法树。

**参数**：无。

**返回值**：解析结果，成功时返回Script对象，失败时返回ParseError。

#### 2.2.3 Script结构

```rust
pub struct Script {
    pub statements: Vec<Statement>,
}
```

**字段说明**：
- `statements`: 脚本中的语句列表。

### 2.3 语义分析器 (Semantic) API

#### 2.3.1 创建语义分析器

```rust
pub fn new() -> Self
```

**功能**：创建一个新的语义分析器实例。

**参数**：无。

**返回值**：语义分析器实例。

#### 2.3.2 检查脚本语义

```rust
pub fn check_script(&mut self, script: &Script) -> Result<(), SemanticError>
```

**功能**：对脚本进行语义检查，验证其合法性。

**参数**：
- `script`: 要检查的Script对象。

**返回值**：检查结果，成功时返回Ok(())，失败时返回SemanticError。

### 2.4 解释器 (Interpreter) API

#### 2.4.1 创建解释器

```rust
pub fn new() -> Self
```

**功能**：创建一个新的解释器实例。

**参数**：无。

**返回值**：解释器实例。

#### 2.4.2 执行脚本

```rust
pub fn execute_script(&mut self, script: &Script) -> Result<Value, RuntimeError>
```

**功能**：执行TradeBlazer脚本，返回执行结果。

**参数**：
- `script`: 要执行的Script对象。

**返回值**：执行结果，成功时返回Value对象，失败时返回RuntimeError。

#### 2.4.3 设置数据上下文

```rust
pub fn set_data_context(&mut self, data_context: DataContext)
```

**功能**：设置解释器的数据上下文，提供K线和Tick数据。

**参数**：
- `data_context`: 数据上下文对象。

**返回值**：无。

#### 2.4.4 设置交易执行器

```rust
pub fn set_trading_executor(&mut self, trading_executor: TradingExecutor)
```

**功能**：设置解释器的交易执行器，处理交易指令。

**参数**：
- `trading_executor`: 交易执行器对象。

**返回值**：无。

#### 2.4.5 调用OnInit函数

```rust
pub fn call_on_init(&mut self) -> Result<(), RuntimeError>
```

**功能**：调用脚本中的OnInit函数，进行初始化操作。

**参数**：无。

**返回值**：调用结果，成功时返回Ok(())，失败时返回RuntimeError。

#### 2.4.6 调用OnTick函数

```rust
pub fn call_on_tick(&mut self) -> Result<(), RuntimeError>
```

**功能**：调用脚本中的OnTick函数，处理Tick事件。

**参数**：无。

**返回值**：调用结果，成功时返回Ok(())，失败时返回RuntimeError。

#### 2.4.7 调用OnBar函数

```rust
pub fn call_on_bar(&mut self) -> Result<(), RuntimeError>
```

**功能**：调用脚本中的OnBar函数，处理Bar事件。

**参数**：无。

**返回值**：调用结果，成功时返回Ok(())，失败时返回RuntimeError。

## 3. 数据结构API

### 3.1 表达式 (Expr) API

#### 3.1.1 创建数值表达式

```rust
pub fn new_number(value: f64) -> Self
```

**功能**：创建一个数值表达式。

**参数**：
- `value`: 数值。

**返回值**：Expr对象。

#### 3.1.2 创建字符串表达式

```rust
pub fn new_string(value: String) -> Self
```

**功能**：创建一个字符串表达式。

**参数**：
- `value`: 字符串。

**返回值**：Expr对象。

#### 3.1.3 创建布尔表达式

```rust
pub fn new_boolean(value: bool) -> Self
```

**功能**：创建一个布尔表达式。

**参数**：
- `value`: 布尔值。

**返回值**：Expr对象。

#### 3.1.4 创建变量引用表达式

```rust
pub fn new_variable(name: String) -> Self
```

**功能**：创建一个变量引用表达式。

**参数**：
- `name`: 变量名。

**返回值**：Expr对象。

#### 3.1.5 创建二元运算表达式

```rust
pub fn new_binary(left: Box<Expr>, op: Op, right: Box<Expr>) -> Self
```

**功能**：创建一个二元运算表达式。

**参数**：
- `left`: 左操作数表达式。
- `op`: 运算符。
- `right`: 右操作数表达式。

**返回值**：Expr对象。

#### 3.1.6 创建函数调用表达式

```rust
pub fn new_call(name: String, args: Vec<Expr>) -> Self
```

**功能**：创建一个函数调用表达式。

**参数**：
- `name`: 函数名。
- `args`: 参数表达式列表。

**返回值**：Expr对象。

### 3.2 语句 (Statement) API

#### 3.2.1 创建变量赋值语句

```rust
pub fn new_assign(name: String, expr: Expr) -> Self
```

**功能**：创建一个变量赋值语句。

**参数**：
- `name`: 变量名。
- `expr`: 赋值表达式。

**返回值**：Statement对象。

#### 3.2.2 创建序列声明语句

```rust
pub fn new_series(name: String) -> Self
```

**功能**：创建一个序列声明语句。

**参数**：
- `name`: 序列变量名。

**返回值**：Statement对象。

#### 3.2.3 创建条件语句

```rust
pub fn new_if(condition: Expr, consequence: Vec<Statement>, alternative: Option<Vec<Statement>>) -> Self
```

**功能**：创建一个条件语句。

**参数**：
- `condition`: 条件表达式。
- `consequence`: 条件为真时执行的语句列表。
- `alternative`: 条件为假时执行的语句列表（可选）。

**返回值**：Statement对象。

#### 3.2.4 创建循环语句

```rust
pub fn new_for(init: Option<Statement>, condition: Option<Expr>, update: Option<Expr>, body: Vec<Statement>) -> Self
```

**功能**：创建一个循环语句。

**参数**：
- `init`: 初始化语句（可选）。
- `condition`: 循环条件表达式（可选）。
- `update`: 更新表达式（可选）。
- `body`: 循环体语句列表。

**返回值**：Statement对象。

#### 3.2.5 创建函数定义语句

```rust
pub fn new_function(name: String, params: Vec<String>, body: Vec<Statement>) -> Self
```

**功能**：创建一个函数定义语句。

**参数**：
- `name`: 函数名。
- `params`: 参数名列表。
- `body`: 函数体语句列表。

**返回值**：Statement对象。

#### 3.2.6 创建函数调用语句

```rust
pub fn new_expression(expr: Expr) -> Self
```

**功能**：创建一个函数调用语句。

**参数**：
- `expr`: 函数调用表达式。

**返回值**：Statement对象。

#### 3.2.7 创建交易指令语句

```rust
pub fn new_trade_command(command_type: TradeCommandType, expr: Expr) -> Self
```

**功能**：创建一个交易指令语句。

**参数**：
- `command_type`: 交易指令类型（如buy, sell等）。
- `expr`: 指令参数表达式。

**返回值**：Statement对象。

## 4. 工具函数API

### 4.1 脚本加载与保存

#### 4.1.1 加载脚本

```rust
pub fn load_script_from_file(path: &str) -> Result<String, io::Error>
```

**功能**：从文件加载TradeBlazer脚本。

**参数**：
- `path`: 脚本文件路径。

**返回值**：加载结果，成功时返回脚本内容字符串，失败时返回io::Error。

#### 4.1.2 保存脚本

```rust
pub fn save_script_to_file(path: &str, content: &str) -> Result<(), io::Error>
```

**功能**：将TradeBlazer脚本保存到文件。

**参数**：
- `path`: 脚本文件保存路径。
- `content`: 脚本内容字符串。

**返回值**：保存结果，成功时返回Ok(())，失败时返回io::Error。

### 4.2 脚本编译与执行

#### 4.2.1 编译脚本

```rust
pub fn compile_script(source: &str) -> Result<Script, CompileError>
```

**功能**：编译TradeBlazer脚本，生成可执行的Script对象。

**参数**：
- `source`: 脚本源代码。

**返回值**：编译结果，成功时返回Script对象，失败时返回CompileError。

#### 4.2.2 运行脚本

```rust
pub fn run_script(script: &Script, data_context: DataContext) -> Result<Value, RunError>
```

**功能**：运行编译后的TradeBlazer脚本。

**参数**：
- `script`: 编译后的Script对象。
- `data_context`: 数据上下文对象。

**返回值**：运行结果，成功时返回Value对象，失败时返回RunError。

## 5. 错误类型API

### 5.1 编译错误 (CompileError)

```rust
pub enum CompileError {
    LexerError(LexerError),
    ParserError(ParserError),
    SemanticError(SemanticError),
}
```

**变体说明**：
- `LexerError`: 词法分析错误。
- `ParserError`: 语法分析错误。
- `SemanticError`: 语义分析错误。

### 5.2 运行时错误 (RuntimeError)

```rust
pub enum RuntimeError {
    UndefinedVariable(String),
    UndefinedFunction(String),
    TypeMismatch(String),
    DivisionByZero,
    IndexOutOfBounds,
    TradingError(String),
    Other(String),
}
```

**变体说明**：
- `UndefinedVariable`: 引用了未定义的变量。
- `UndefinedFunction`: 调用了未定义的函数。
- `TypeMismatch`: 类型不匹配错误。
- `DivisionByZero`: 除零错误。
- `IndexOutOfBounds`: 索引越界错误。
- `TradingError`: 交易相关错误。
- `Other`: 其他运行时错误。

## 6. 内置函数参考

### 6.1 数学函数

- **abs(x)**: 计算绝对值
- **sqrt(x)**: 计算平方根
- **pow(x, y)**: 计算x的y次方
- **log(x)**: 计算自然对数
- **log10(x)**: 计算常用对数
- **sin(x)**: 计算正弦值
- **cos(x)**: 计算余弦值
- **tan(x)**: 计算正切值
- **max(x, y)**: 返回较大值
- **min(x, y)**: 返回较小值

### 6.2 统计函数

- **avg(x)**: 计算平均值
- **sum(x)**: 计算总和
- **stddev(x)**: 计算标准差
- **var(x)**: 计算方差
- **median(x)**: 计算中位数
- **rank(x)**: 计算排名

### 6.3 技术指标函数

- **ma(x, n)**: 计算移动平均线
- **ema(x, n)**: 计算指数移动平均线
- **macd(x, fast, slow, signal)**: 计算MACD指标
- **rsi(x, n)**: 计算RSI指标
- **kdj(x, n, m1, m2)**: 计算KDJ指标
- **bollinger(x, n, k)**: 计算布林带
- **cci(x, n)**: 计算CCI指标
- **dmi(x, h, l, n)**: 计算DMI指标

### 6.4 时间函数

- **time()**: 获取当前时间
- **date()**: 获取当前日期
- **dayofweek()**: 获取当前星期几
- **dayofmonth()**: 获取当前月份中的日期
- **month()**: 获取当前月份
- **year()**: 获取当前年份

### 6.5 字符串函数

- **len(s)**: 计算字符串长度
- **strcat(s1, s2)**: 连接两个字符串
- **substr(s, start, length)**: 截取子字符串
- **upper(s)**: 转换为大写
- **lower(s)**: 转换为小写
- **trim(s)**: 去除首尾空格

---
**版本**: v1.0
**更新日期**: 2023-xx-xx