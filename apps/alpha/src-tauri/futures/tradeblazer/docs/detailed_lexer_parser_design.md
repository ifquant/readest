# TradeBlazer 详细词法和语法设计文档

## 1. 项目概述

TradeBlazer 是一个金融交易策略脚本编译器和解释器，用于解析、编译和执行TradeBlazer格式的交易策略脚本。本文档将详细描述TradeBlazer的词法和语法设计，包括每个词法单元和语法单元的具体定义和实现细节。

## 2. 词法分析器设计

词法分析器负责将源代码文本转换为有意义的Token序列。TradeBlazer采用DFA（确定有限自动机）的思想，通过分支处理不同类型的字符，逐步构建Token流。

### 2.1 词法单元定义

```rust
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
    AndAnd, // && 逻辑与
    OrOr,   // || 逻辑或
    Ampersand, // &
    // 分隔符
    LParen,   // (
    RParen,   // )
    LBrace,   // {
    RBrace,   // }
    LBracket, // [
    RBracket, // ]
    Comma,    // ,
    Semicolon,// ;
    Dot,      // .
    // 结束标记
    Eof,
}
```

### 2.2 Lexer 结构体设计

```rust
pub struct Lexer<'a> {
    input: Peekable<Chars<'a>>,
    line: usize,
    column: usize,
    source: &'a str,
}
```

### 2.3 词法分析流程

1. **初始化**：创建Lexer实例，初始化字符流、行号和列号
2. **字符扫描**：逐个字符扫描源代码，根据字符类型生成相应的Token
3. **Token收集**：将生成的Token及其位置信息添加到结果列表中
4. **错误处理**：检测并报告词法错误，如无效字符、未闭合的字符串等

### 2.4 词法分析核心方法

#### 2.4.1 tokenize 方法

```rust
pub fn tokenize(&mut self) -> Result<(Vec<Token>, Vec<ErrorLocation>), CompileError> {
    let mut tokens = Vec::new();
    let mut positions = Vec::new();

    while let Some(c) = self.next_char() {
        // 根据字符类型生成相应的Token
        match c {
            // 处理空白字符、注释、运算符、标识符、字面量等
            // ...
        }
    }

    // 添加结束标记
    tokens.push(Token::Eof);
    positions.push(self.current_location());
    Ok((tokens, positions))
}
```

#### 2.4.2 辅助方法

- `skip_line_comment`：跳过单行注释
- `skip_block_comment`：跳过块注释
- `lex_string_literal`：词法分析字符串字面量
- `lex_number_literal`：词法分析数字字面量
- `lex_identifier`：词法分析标识符和关键字
- `match_char`：尝试匹配特定字符
- `next_char`：获取下一个字符并更新行列信息
- `peek_char`：预览下一个字符
- `current_location`：获取当前字符位置

### 2.5 词法单元详细说明

#### 2.5.1 关键字

关键字是语言中具有特殊意义的保留字，不能用作标识符：

| 关键字 | 描述 | 用途 |
|-------|------|------|
| `if` | 条件语句关键字 | 用于条件判断 |
| `else` | 条件语句关键字 | 用于条件分支 |
| `for` | 循环语句关键字 | 用于循环迭代 |
| `function` | 函数定义关键字 | 用于定义函数 |
| `return` | 返回语句关键字 | 用于从函数返回值 |
| `var` | 变量声明关键字 | 用于声明变量 |
| `series` | 序列声明关键字 | 用于声明序列变量 |
| `true` | 布尔字面量 | 表示真 |
| `false` | 布尔字面量 | 表示假 |

#### 2.5.2 标识符

标识符用于命名变量、函数、参数等，由字母、数字和下划线组成，且不能以数字开头。TradeBlazer中标识符区分大小写。

#### 2.5.3 字面量

字面量是程序中直接表示的值：

- **数字字面量**：支持整数、浮点数和科学计数法（如 10, 3.14, 2.5e3）
- **字符串字面量**：由双引号包围的字符序列，支持转义字符（如 "hello", "line\nbreak"）
- **布尔字面量**：`true` 和 `false`

#### 2.5.4 运算符

运算符用于执行各种操作：

| 运算符 | 类型 | 描述 |
|-------|-----|------|
| `+` | 算术运算符 | 加法 |
| `-` | 算术运算符 | 减法 |
| `*` | 算术运算符 | 乘法 |
| `/` | 算术运算符 | 除法 |
| `+=` | 复合赋值运算符 | 加法赋值 |
| `-=` | 复合赋值运算符 | 减法赋值 |
| `*=` | 复合赋值运算符 | 乘法赋值 |
| `/=` | 复合赋值运算符 | 除法赋值 |
| `==` | 比较运算符 | 等于 |
| `!=` | 比较运算符 | 不等于 |
| `<` | 比较运算符 | 小于 |
| `>` | 比较运算符 | 大于 |
| `<=` | 比较运算符 | 小于等于 |
| `>=` | 比较运算符 | 大于等于 |
| `!` | 逻辑运算符 | 逻辑非 |
| `&&` | 逻辑运算符 | 逻辑与 |
| `||` | 逻辑运算符 | 逻辑或 |
| `=` | 赋值运算符 | 赋值 |

#### 2.5.5 分隔符

分隔符用于分隔代码的不同部分：

| 分隔符 | 描述 | 用途 |
|-------|-----|------|
| `(` | 左括号 | 函数调用、表达式分组 |
| `)` | 右括号 | 函数调用、表达式分组 |
| `{` | 左花括号 | 代码块开始 |
| `}` | 右花括号 | 代码块结束 |
| `[` | 左方括号 | 数组索引 |
| `]` | 右方括号 | 数组索引 |
| `,` | 逗号 | 分隔函数参数、数组元素 |
| `;` | 分号 | 语句结束 |
| `.` | 点号 | 属性访问、方法调用 |

## 3. 语法分析器设计

语法分析器负责将Token流转换为结构化的抽象语法树(AST)。TradeBlazer采用递归下降解析算法和Pratt Parser（优先级爬升算法）来解析表达式。

### 3.1 语法单元定义

#### 3.1.1 表达式 (Expr)

表达式是计算并产生值的代码片段：

```rust
#[derive(Debug, PartialEq, Clone, serde::Serialize, serde::Deserialize)]
pub enum Expr {
    // 数值字面量
    Number(f64),
    // 字符串字面量
    StringLiteral(String),
    // 布尔字面量
    Boolean(bool),
    // 变量引用
    Variable(String),
    // 变量引用（编号版）
    VariableId(SymbolId),
    // 二元运算
    BinaryOp {
        op: Op,
        left: Box<Expr>,
        right: Box<Expr>,
    },
    // 一元运算
    UnaryOp {
        op: Op,
        operand: Box<Expr>,
    },
    // 函数调用
    Call {
        name: String,
        args: Vec<Expr>,
    },
    // 函数调用（编号版）
    CallId {
        name: SymbolId,
        args: Vec<Expr>,
    },
    // 数据引用
    Data(DataSymbol),
    // 指标引用 (如 Close, Open 等)
    Indicator(IndicatorIdx),
    // 序列或数组索引访问
    IndexAccess {
        target: String,
        index: Box<Expr>,
    },
    // 对象方法调用
    MethodCall {
        target: String,
        method: String,
        args: Vec<Expr>,
    },
    // 对象属性访问
    PropertyAccess {
        target: String,
        property: String,
    },
    // 解释器内部使用的赋值语法糖（for 循环步进等）
    AssignIntrinsic {
        target: String,
        value: Box<Expr>,
    },
    AssignIntrinsicId {
        target: SymbolId,
        value: Box<Expr>,
    },
}
```

#### 3.1.2 运算符 (Op)

```rust
#[derive(Debug, PartialEq, Clone, serde::Serialize, serde::Deserialize)]
pub enum Op {
    Add,       // +
    Subtract,  // -
    Multiply,  // *
    Divide,    // /
    Equals,    // ==
    NotEquals, // !=
    LessThan,  // <
    GreaterThan, // >
    LessThanOrEqual, // <=
    GreaterThanOrEqual, // >=
    Not,       // ! 逻辑非
    Negate,    // - 一元负号
    LogicalAnd, // &&
    LogicalOr,  // ||
}
```

#### 3.1.3 语句 (Statement)

语句是执行操作的代码片段：

```rust
#[derive(Debug, PartialEq, Clone, serde::Serialize, serde::Deserialize)]
pub enum Statement {
    // 变量赋值
    Assign {
        name: String,
        value: Expr,
    },
    // 变量赋值（编号版）
    AssignId {
        name: SymbolId,
        value: Expr,
    },
    // 变量声明
    VarDecl {
        name: String,
        value: Option<Expr>,
    },
    // 变量声明（编号版）
    VarDeclId {
        name: SymbolId,
        value: Option<Expr>,
    },
    // 序列声明
    Series {
        name: String,
    },
    // 序列声明（编号版）
    SeriesId {
        name: SymbolId,
    },
    // 条件语句
    If {
        condition: Expr,
        then_block: Vec<Statement>,
        else_block: Option<Vec<Statement>>,
    },
    // 循环语句
    For {
        var: String,
        start: Expr,
        end: Expr,
        step: Option<Expr>,
        body: Vec<Statement>,
    },
    ForId {
        var: SymbolId,
        start: Expr,
        end: Expr,
        step: Option<Expr>,
        body: Vec<Statement>,
    },
    // 函数定义
    FunctionDef {
        name: String,
        params: Vec<FunctionParam>,
        body: Vec<Statement>,
    },
    // 数组声明
    ArrayDecl {
        name: String,
        size: usize,
    },
    // 数组声明（编号版）
    ArrayDeclId {
        name: SymbolId,
        size: usize,
    },
    // 数组元素赋值
    ArrayAssign {
        name: String,
        index: Expr,
        value: Expr,
    },
    // 函数调用语句
    ExprStmt(Expr),
    // 交易指令
    TradeCommand {
        cmd: String,
        params: Vec<Expr>,
    },
    // 返回语句
    Return(Option<Expr>),
}
```

#### 3.1.4 脚本 (Script)

脚本是TradeBlazer程序的顶层结构：

```rust
#[derive(Debug, PartialEq, Clone, serde::Serialize, serde::Deserialize)]
pub struct Script {
    pub symbols: SymbolTable,
    pub statements: Vec<Statement>,
}
```

#### 3.1.5 符号表 (SymbolTable)

符号表用于管理脚本中的变量和函数名称，支持通过整数快速定位标识符：

```rust
#[derive(Debug, PartialEq, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct SymbolTable {
    pub symbols: Vec<String>,
}
```

### 3.2 Parser 结构体设计

```rust
pub struct Parser {
    tokens: Vec<Token>,
    token_positions: Vec<ErrorLocation>,
    pos: usize,
    source: Option<String>,
}
```

### 3.3 语法分析流程

1. **初始化**：创建Parser实例，设置Token流和位置信息
2. **语句解析**：按顺序解析每个语句，构建语句树
3. **表达式解析**：使用优先级爬升算法解析表达式
4. **错误恢复**：在遇到语法错误时尝试恢复，继续解析后续代码
5. **AST构建**：构建完整的抽象语法树

### 3.4 语法分析核心方法

#### 3.4.1 parse 方法

```rust
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
```

#### 3.4.2 语句解析方法

- `parse_statement`：根据当前Token选择解析特定类型的语句
- `parse_if_statement`：解析if语句
- `parse_for_statement`：解析for循环
- `parse_function_def`：解析函数定义
- `parse_var_declaration`：解析变量声明
- `parse_series_statement`：解析序列声明
- `parse_expression_statement`：解析表达式语句

#### 3.4.3 表达式解析方法

- `parse_expression`：解析表达式的入口方法
- `parse_binary_expression`：使用优先级爬升算法解析二元表达式
- `parse_primary`：解析基本表达式（字面量、变量、括号表达式等）
- `parse_operator`：解析运算符

#### 3.4.4 辅助方法

- `synchronize`：从语法错误中恢复
- `consume_expected`：消费预期的Token，如果不匹配则报错
- `parse_identifier`：解析标识符
- `parse_parameter_list`：解析参数列表
- `current_token_precedence`：获取当前Token的运算符优先级
- `current_token_location`：获取当前Token的位置信息

## 4. 语法规则详细说明

### 4.1 语句语法

#### 4.1.1 变量声明语句

**语法**：`var identifier [= expression];`

**示例**：
- `var a = 10;`
- `var b;`

**AST表示**：`Statement::VarDecl { name, value: Some(expr) }` 或 `Statement::VarDecl { name, value: None }`

#### 4.1.2 序列声明语句

**语法**：`series identifier;`

**示例**：`series close_prices;`

**AST表示**：`Statement::Series { name }`

#### 4.1.3 赋值语句

**语法**：`identifier = expression;`

**示例**：`a = 10 + 20;`

**AST表示**：`Statement::Assign { name, value }`

#### 4.1.4 条件语句

**语法**：
```
if (expression) {
    statements
} [else {
    statements
}] 
```

**示例**：
```
if (a > 10) {
    Print("a is greater than 10");
} else {
    Print("a is less than or equal to 10");
}
```

**AST表示**：`Statement::If { condition, then_block, else_block: Some(else_block) }` 或 `Statement::If { condition, then_block, else_block: None }`

#### 4.1.5 循环语句

**语法**：`for (var identifier = start_expr; condition_expr; step_expr) { statements }`

**示例**：
```
for (var i = 0; i < 10; i++) {
    Print(i);
}
```

**AST表示**：`Statement::For { var, start, end, step: Some(step), body }` 或 `Statement::For { var, start, end, step: None, body }`

#### 4.1.6 函数定义语句

**语法**：
```
function identifier([parameter_list]) {
    statements
}
```

**示例**：
```
function calculateMA(period) {
    var sum = 0;
    for (var i = 0; i < period; i++) {
        sum += Close[i];
    }
    return sum / period;
}
```

**AST表示**：`Statement::FunctionDef { name, params, body }`

#### 4.1.7 表达式语句

**语法**：`expression;`

**示例**：`Print("Hello, World!");`

**AST表示**：`Statement::ExprStmt(expr)`

#### 4.1.8 返回语句

**语法**：`return [expression];`

**示例**：
- `return;`
- `return a + b;`

**AST表示**：`Statement::Return(Some(expr))` 或 `Statement::Return(None)`

#### 4.1.9 交易指令语句

**语法**：`command([parameters]);`

**示例**：`Buy(1, Close);`

**AST表示**：`Statement::TradeCommand { cmd, params }`

### 4.2 表达式语法

#### 4.2.1 字面量表达式

**语法**：`number` | `string` | `true` | `false`

**示例**：
- `10`
- `3.14`
- `"Hello"`
- `true`

**AST表示**：`Expr::Number(n)` | `Expr::StringLiteral(s)` | `Expr::Boolean(b)`

#### 4.2.2 变量引用表达式

**语法**：`identifier`

**示例**：`a`

**AST表示**：`Expr::Variable(name)`

#### 4.2.3 二元运算表达式

**语法**：`expression operator expression`

**示例**：
- `a + b`
- `x > 10`
- `true && false`

**AST表示**：`Expr::BinaryOp { op, left, right }`

#### 4.2.4 一元运算表达式

**语法**：`operator expression`

**示例**：
- `-10`
- `!true`

**AST表示**：`Expr::UnaryOp { op, operand }`

#### 4.2.5 函数调用表达式

**语法**：`identifier([arguments])`

**示例**：`MA(Close, 10)`

**AST表示**：`Expr::Call { name, args }`

#### 4.2.6 指标引用表达式

**语法**：`indicator`

**示例**：`Close`

**AST表示**：`Expr::Indicator(idx)`

#### 4.2.7 数据访问表达式

**语法**：`indicator.number`

**示例**：`Close.1`

**AST表示**：`Expr::Data(data_symbol)`

#### 4.2.8 索引访问表达式

**语法**：`identifier[expression]`

**示例**：`prices[i]`

**AST表示**：`Expr::IndexAccess { target, index }`

#### 4.2.9 方法调用表达式

**语法**：`identifier.method([arguments])`

**示例**：`array.push(10)`

**AST表示**：`Expr::MethodCall { target, method, args }`

#### 4.2.10 属性访问表达式

**语法**：`identifier.property`

**示例**：`object.value`

**AST表示**：`Expr::PropertyAccess { target, property }`

### 4.3 运算符优先级

运算符优先级决定了表达式中操作的执行顺序：

| 优先级 | 运算符 | 结合性 |
|-------|-------|-------|
| 1 | `()` | 左到右 |
| 2 | `-`, `!` | 右到左 |
| 3 | `*`, `/` | 左到右 |
| 4 | `+`, `-` | 左到右 |
| 5 | `<`, `>`, `<=`, `>=` | 左到右 |
| 6 | `==`, `!=` | 左到右 |
| 7 | `&&` | 左到右 |
| 8 | `||` | 左到右 |
| 9 | `=` | 右到左 |

## 5. 辅助数据结构

### 5.1 位置信息 (ErrorLocation)

用于记录代码中的位置，用于错误报告：

```rust
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ErrorLocation {
    pub line: usize,
    pub column: usize,
}
```

### 5.2 符号ID (SymbolId)

用于在语义分析和运行时阶段通过整数快速定位标识符：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct SymbolId(pub u32);
```

### 5.3 数据符号 (DataSymbol)

用于表示数据访问表达式中的数据索引和类型：

```rust
#[derive(Debug, PartialEq, Clone, Copy, serde::Serialize, serde::Deserialize)]
pub struct DataSymbol {
    pub data_idx:usize,
    pub data_type:BarDataType,
}
```

### 5.4 K线数据类型 (BarDataType)

表示K线的不同数据类型：

```rust
#[derive(Debug, PartialEq, Clone, Copy, serde::Serialize, serde::Deserialize)]
pub enum BarDataType {
    Close,
    Open,
    High,
    Low,
    Volume,
    // 可扩展更多指标
}
```

### 5.5 指标索引 (IndicatorIdx)

表示技术指标的索引类型：

```rust
#[derive(Debug, PartialEq, Clone, Copy, serde::Serialize, serde::Deserialize)]
pub enum IndicatorIdx {
    Close,
    Open,
    High,
    Low,
    Volume,
    // 可扩展更多指标
}
```

## 6. 错误处理机制

### 6.1 编译错误 (CompileError)

统一的错误表示，包含错误类型、位置、消息和修复建议：

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CompileError {
    pub error_type: ErrorType,
    pub message: String,
    pub location: Option<ErrorLocation>,
    pub source: Option<String>,
    pub suggestions: Vec<String>,
}
```

### 6.2 错误类型 (ErrorType)

```rust
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum ErrorType {
    Lexical,    // 词法错误
    Syntax,     // 语法错误
    Semantic,   // 语义错误
    Runtime,    // 运行时错误
    Other,      // 其他错误
}
```

### 6.3 错误报告特点

- 提供精确的错误位置（行号和列号）
- 支持源代码片段显示，直观标记错误位置
- 提供修复建议，帮助用户快速解决问题
- 采用Builder模式，方便链式构造错误对象

## 7. 代码优化机制

### 7.1 符号降级

将热点节点（如变量引用、函数调用等）降级为基于SymbolId的形式，减少运行时字符串比较开销：

```rust
pub fn lower_ids(&mut self) {
    let symbols = &self.symbols;
    // 将表达式中的字符串标识符替换为SymbolId
    // ...
}
```

### 7.2 语法糖展开

将语法糖（如`i++`、`i += 2`等）展开为标准形式，简化解释器实现：

```rust
// 在parse_for_step_expression方法中展开语法糖
let binary = Expr::BinaryOp {
    op: Op::Add,
    left: Box::new(Expr::Variable(var.to_string())),
    right: Box::new(Expr::Number(1.0)),
};
let assign_expr = Expr::AssignIntrinsic {
    target: var.to_string(),
    value: Box::new(binary),
};
```

## 8. 语义分析

语义分析器对AST进行静态分析，确保脚本符合语言规则：

- 检查变量和函数的重复定义
- 验证变量引用的合法性
- 检查函数调用的正确性
- 验证TradeBlazer标准函数的存在
- 管理作用域和变量可见性

## 9. 实现细节和优化技巧

### 9.1 递归下降解析

TradeBlazer采用递归下降解析算法解析语句和表达式，这种方法简单直观，易于实现和调试。

### 9.2 Pratt Parser算法

对于表达式解析，TradeBlazer采用了Pratt Parser（优先级爬升算法）来高效处理运算符优先级问题。这种方法只需要一个函数就能处理不同优先级的运算符，是Pratt Parser的轻量变体。

### 9.3 错误恢复机制

在遇到语法错误时，解析器采用panic模式恢复策略，跳过直到分号或下一条语句的起始关键字，保证后续解析还能继续给出更多错误信息。

### 9.4 预计算和缓存

对于频繁使用的符号和表达式，解析器和语义分析器会进行预计算和缓存，提高后续处理效率。

### 9.5 轻量级数据结构

使用SmallVec等优化的数据结构减少内存分配，提高性能。

## 10. 总结

TradeBlazer的词法和语法设计遵循现代编程语言设计原则，采用了高效的算法和数据结构。词法分析器将源代码转换为Token流，语法分析器将Token流转换为结构化的抽象语法树，为后续的语义分析和执行提供了基础。

通过精确的词法单元和语法单元定义，TradeBlazer不仅保证了语言的表达能力和灵活性，还提供了高效的编译和执行性能，能够满足金融交易领域对速度和稳定性的要求。