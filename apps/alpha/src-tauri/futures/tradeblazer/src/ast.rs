//! 抽象语法树(AST)定义
//! 用于表示TradeBlazer脚本的语法结构

use std::collections::HashSet;
use std::fmt::{Display, Formatter, Result as FmtResult};
use std::str::FromStr;


#[derive(Debug, PartialEq, Clone, Copy, serde::Serialize, serde::Deserialize)]
pub enum BarDataType {
    Close,
    Open,
    High,
    Low,
    Volume,
    // 可扩展更多指标
}


#[derive(Debug, PartialEq, Clone, Copy, serde::Serialize, serde::Deserialize)]
pub struct DataSymbol {
    pub data_idx:usize,
    pub data_type:BarDataType,
}


#[derive(Debug, PartialEq, Clone, Copy, serde::Serialize, serde::Deserialize)]
pub enum IndicatorIdx {
    Close,
    Open,
    High,
    Low,
    Volume,
    // 可扩展更多指标
}

impl IndicatorIdx {
    pub fn as_str(&self) -> &'static str {
        match self {
            IndicatorIdx::Close => "Close",
            IndicatorIdx::Open => "Open",
            IndicatorIdx::High => "High",
            IndicatorIdx::Low => "Low",
            IndicatorIdx::Volume => "Volume",
        }
    }
}

impl FromStr for IndicatorIdx {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Close" => Ok(IndicatorIdx::Close),
            "Open" => Ok(IndicatorIdx::Open),
            "High" => Ok(IndicatorIdx::High),
            "Low" => Ok(IndicatorIdx::Low),
            "Volume" => Ok(IndicatorIdx::Volume),
            _ => Err(()),
        }
    }
}

impl Display for IndicatorIdx {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        match self {
            IndicatorIdx::Close => write!(f, "Close"),
            IndicatorIdx::Open => write!(f, "Open"),
            IndicatorIdx::High => write!(f, "High"),
            IndicatorIdx::Low => write!(f, "Low"),
            IndicatorIdx::Volume => write!(f, "Volume"),
        }
    }
}

/// 表达式节点。`Box<Expr>` 在这里用于避免递归类型带来的编译期大小未知问题，
/// 这是 Rust 里构建树形结构的常见技巧：通过堆分配打破无限嵌套的大小计算。
// `serde` 派生保证 AST 可直接序列化到 JSON，方便做快照调试或缓存。
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

/// 运算符枚举，既用于二元运算也用于一元运算。
/// 注意 `LogicalAnd`/`LogicalOr` 仅在语义阶段实现短路逻辑，而 `Negate`
/// 则配合 `Expr::UnaryOp` 表示一元负号。
#[derive(Debug, PartialEq, Clone, serde::Serialize, serde::Deserialize)]
pub enum Op {
    Add,
    Subtract,
    Multiply,
    Divide,
    Equals,
    NotEquals,
    LessThan,
    GreaterThan,
    LessThanOrEqual,
    GreaterThanOrEqual,
    Not,    // 逻辑非
    Negate, // 一元负号
    LogicalAnd,
    LogicalOr,
}

/// 语句节点。大多数语句都携带子语句 `Vec<Statement>`，因此天然形成树结构。
// 通过 `serde` 派生让脚本结构可以做持久化快照或回放。
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

/// 脚本内唯一标识符的整数索引。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct SymbolId(pub u32);

/// 脚本的符号表，用于在语义/运行期通过整数快速定位标识符。
#[derive(Debug, PartialEq, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct SymbolTable {
    pub symbols: Vec<String>,
}

impl SymbolTable {
    pub fn new() -> Self {
        Self {
            symbols: Vec::new(),
        }
    }

    pub fn len(&self) -> usize {
        self.symbols.len()
    }

    pub fn is_empty(&self) -> bool {
        self.symbols.is_empty()
    }

    pub fn get(&self, id: SymbolId) -> &str {
        &self.symbols[id.0 as usize]
    }

    pub fn find(&self, name: &str) -> Option<SymbolId> {
        self.symbols
            .iter()
            .position(|candidate| candidate == name)
            .map(|idx| SymbolId(idx as u32))
    }

    pub fn iter(&self) -> impl Iterator<Item = (SymbolId, &str)> {
        self.symbols
            .iter()
            .enumerate()
            .map(|(idx, name)| (SymbolId(idx as u32), name.as_str()))
    }
}

/// 顶层脚本，包括语句和符号表。
#[derive(Debug, PartialEq, Clone, serde::Serialize, serde::Deserialize)]
pub struct Script {
    pub symbols: SymbolTable,
    pub statements: Vec<Statement>,
}

impl Script {
    /// 根据语句自动收集符号，构造脚本。
    pub fn new(statements: Vec<Statement>) -> Self {
        let mut collector = SymbolCollector::default();
        for stmt in &statements {
            collector.collect_statement(stmt);
        }
        Self {
            symbols: SymbolTable {
                symbols: collector.symbols,
            },
            statements,
        }
    }

    /// 在已有符号表的基础上，将热点节点（变量、赋值）降级为基于 SymbolId 的形式，
    /// 以便运行期绕过字符串查找。
    pub fn lower_ids(&mut self) {
        let symbols = &self.symbols;
        fn lower_expr(expr: Expr, symbols: &SymbolTable) -> Expr {
            match expr {
                Expr::Variable(name) => {
                    if let Some(id) = symbols.find(&name) {
                        Expr::VariableId(id)
                    } else {
                        Expr::Variable(name)
                    }
                }
                Expr::BinaryOp { op, left, right } => Expr::BinaryOp {
                    op,
                    left: Box::new(lower_expr(*left, symbols)),
                    right: Box::new(lower_expr(*right, symbols)),
                },
                Expr::UnaryOp { op, operand } => Expr::UnaryOp {
                    op,
                    operand: Box::new(lower_expr(*operand, symbols)),
                },
                Expr::Call { name, args } => {
                    let lowered_args: Vec<Expr> =
                        args.into_iter().map(|e| lower_expr(e, symbols)).collect();
                    if let Some(id) = symbols.find(&name) {
                        Expr::CallId {
                            name: id,
                            args: lowered_args,
                        }
                    } else {
                        Expr::Call {
                            name,
                            args: lowered_args,
                        }
                    }
                }
                Expr::Indicator(name) => Expr::Indicator(name),
                Expr::IndexAccess { target, index } => Expr::IndexAccess {
                    target,
                    index: Box::new(lower_expr(*index, symbols)),
                },
                Expr::MethodCall {
                    target,
                    method,
                    args,
                } => Expr::MethodCall {
                    target,
                    method,
                    args: args.into_iter().map(|e| lower_expr(e, symbols)).collect(),
                },
                Expr::PropertyAccess { target, property } => {
                    Expr::PropertyAccess { target, property }
                }
                Expr::AssignIntrinsic { target, value } => {
                    let lowered_value = lower_expr(*value, symbols);
                    if let Some(id) = symbols.find(&target) {
                        Expr::AssignIntrinsicId {
                            target: id,
                            value: Box::new(lowered_value),
                        }
                    } else {
                        Expr::AssignIntrinsic {
                            target,
                            value: Box::new(lowered_value),
                        }
                    }
                }
                Expr::AssignIntrinsicId { target, value } => Expr::AssignIntrinsicId {
                    target,
                    value: Box::new(lower_expr(*value, symbols)),
                },
                Expr::CallId { name, args } => Expr::CallId {
                    name,
                    args: args.into_iter().map(|e| lower_expr(e, symbols)).collect(),
                },
                // Already lowered or literals
                other @ (Expr::VariableId(_)
                | Expr::Number(_)
                | Expr::StringLiteral(_)
                | Expr::Boolean(_)
                | Expr::Data(_)) => other,
            }
        }

        let mut lowered: Vec<Statement> = Vec::with_capacity(self.statements.len());
        for stmt in std::mem::take(&mut self.statements) {
            let new_stmt = match stmt {
                Statement::Assign { name, value } => {
                    if let Some(id) = symbols.find(&name) {
                        Statement::AssignId {
                            name: id,
                            value: lower_expr(value, symbols),
                        }
                    } else {
                        Statement::Assign {
                            name,
                            value: lower_expr(value, symbols),
                        }
                    }
                }
                Statement::ExprStmt(expr) => Statement::ExprStmt(lower_expr(expr, symbols)),
                Statement::ArrayAssign { name, index, value } => Statement::ArrayAssign {
                    name,
                    index: lower_expr(index, symbols),
                    value: lower_expr(value, symbols),
                },
                Statement::If {
                    condition,
                    then_block,
                    else_block,
                } => Statement::If {
                    condition: lower_expr(condition, symbols),
                    then_block: then_block
                        .into_iter()
                        .map(|mut s| {
                            let mut tmp = Script {
                                symbols: symbols.clone(),
                                statements: vec![s],
                            };
                            tmp.lower_ids();
                            tmp.statements.into_iter().next().unwrap()
                        })
                        .collect(),
                    else_block: else_block.map(|block| {
                        block
                            .into_iter()
                            .map(|mut s| {
                                let mut tmp = Script {
                                    symbols: symbols.clone(),
                                    statements: vec![s],
                                };
                                tmp.lower_ids();
                                tmp.statements.into_iter().next().unwrap()
                            })
                            .collect()
                    }),
                },
                Statement::For {
                    var,
                    start,
                    end,
                    step,
                    body,
                } => {
                    let lowered_start = lower_expr(start, symbols);
                    let lowered_end = lower_expr(end, symbols);
                    let lowered_step = step.map(|e| lower_expr(e, symbols));
                    let lowered_body: Vec<Statement> = body
                        .into_iter()
                        .map(|mut s| {
                            let mut tmp = Script {
                                symbols: symbols.clone(),
                                statements: vec![s],
                            };
                            tmp.lower_ids();
                            tmp.statements.into_iter().next().unwrap()
                        })
                        .collect();
                    if let Some(id) = symbols.find(&var) {
                        Statement::ForId {
                            var: id,
                            start: lowered_start,
                            end: lowered_end,
                            step: lowered_step,
                            body: lowered_body,
                        }
                    } else {
                        Statement::For {
                            var,
                            start: lowered_start,
                            end: lowered_end,
                            step: lowered_step,
                            body: lowered_body,
                        }
                    }
                }
                Statement::ForId {
                    var,
                    start,
                    end,
                    step,
                    body,
                } => Statement::ForId {
                    var,
                    start: lower_expr(start, symbols),
                    end: lower_expr(end, symbols),
                    step: step.map(|e| lower_expr(e, symbols)),
                    body: body
                        .into_iter()
                        .map(|mut s| {
                            let mut tmp = Script {
                                symbols: symbols.clone(),
                                statements: vec![s],
                            };
                            tmp.lower_ids();
                            tmp.statements.into_iter().next().unwrap()
                        })
                        .collect(),
                },
                Statement::FunctionDef { name, params, body } => {
                    let lowered_params: Vec<FunctionParam> = params
                        .into_iter()
                        .map(|mut param| {
                            param.id = symbols.find(&param.name);
                            param
                        })
                        .collect();
                    let lowered_body: Vec<Statement> = body
                        .into_iter()
                        .map(|mut s| {
                            let mut tmp = Script {
                                symbols: symbols.clone(),
                                statements: vec![s],
                            };
                            tmp.lower_ids();
                            tmp.statements.into_iter().next().unwrap()
                        })
                        .collect();
                    Statement::FunctionDef {
                        name,
                        params: lowered_params,
                        body: lowered_body,
                    }
                }
                Statement::VarDecl { name, value } => {
                    let lowered_value = value.map(|expr| lower_expr(expr, symbols));
                    if let Some(id) = symbols.find(&name) {
                        Statement::VarDeclId {
                            name: id,
                            value: lowered_value,
                        }
                    } else {
                        Statement::VarDecl {
                            name,
                            value: lowered_value,
                        }
                    }
                }
                Statement::VarDeclId { name, value } => Statement::VarDeclId {
                    name,
                    value: value.map(|expr| lower_expr(expr, symbols)),
                },
                Statement::Series { name } => {
                    if let Some(id) = symbols.find(&name) {
                        Statement::SeriesId { name: id }
                    } else {
                        Statement::Series { name }
                    }
                }
                Statement::SeriesId { name } => Statement::SeriesId { name },
                Statement::ArrayDecl { name, size } => {
                    if let Some(id) = symbols.find(&name) {
                        Statement::ArrayDeclId { name: id, size }
                    } else {
                        Statement::ArrayDecl { name, size }
                    }
                }
                Statement::ArrayDeclId { name, size } => Statement::ArrayDeclId { name, size },
                // Other statements unchanged
                other => other,
            };
            lowered.push(new_stmt);
        }
        self.statements = lowered;
    }
}

#[derive(Default)]
struct SymbolCollector {
    seen: HashSet<String>,
    symbols: Vec<String>,
}

impl SymbolCollector {
    fn add(&mut self, name: &str) {
        if self.seen.insert(name.to_string()) {
            self.symbols.push(name.to_string());
        }
    }

    fn collect_statement(&mut self, stmt: &Statement) {
        match stmt {
            Statement::Assign { name, value }
            | Statement::VarDecl {
                name,
                value: Some(value),
            }
            | Statement::ArrayAssign { name, value, .. } => {
                self.add(name);
                self.collect_expr(value);
            }
            Statement::AssignId { .. } => {}
            Statement::VarDecl { name, value: None }
            | Statement::Series { name }
            | Statement::ArrayDecl { name, .. } => self.add(name),
            Statement::VarDeclId { .. }
            | Statement::SeriesId { .. }
            | Statement::ArrayDeclId { .. } => {}
            Statement::If {
                condition,
                then_block,
                else_block,
            } => {
                self.collect_expr(condition);
                for stmt in then_block {
                    self.collect_statement(stmt);
                }
                if let Some(block) = else_block {
                    for stmt in block {
                        self.collect_statement(stmt);
                    }
                }
            }
            Statement::For {
                var,
                start,
                end,
                step,
                body,
            } => {
                self.add(var);
                self.collect_expr(start);
                self.collect_expr(end);
                if let Some(step_expr) = step {
                    self.collect_expr(step_expr);
                }
                for stmt in body {
                    self.collect_statement(stmt);
                }
            }
            Statement::ForId {
                start,
                end,
                step,
                body,
                ..
            } => {
                self.collect_expr(start);
                self.collect_expr(end);
                if let Some(step_expr) = step {
                    self.collect_expr(step_expr);
                }
                for stmt in body {
                    self.collect_statement(stmt);
                }
            }
            Statement::FunctionDef { name, params, body } => {
                self.add(name);
                for param in params {
                    self.add(&param.name);
                }
                for stmt in body {
                    self.collect_statement(stmt);
                }
            }
            Statement::ExprStmt(expr) => self.collect_expr(expr),
            Statement::TradeCommand { cmd, params } => {
                self.add(cmd);
                for expr in params {
                    self.collect_expr(expr);
                }
            }
            Statement::Return(expr) => {
                if let Some(expr) = expr {
                    self.collect_expr(expr);
                }
            }
        }
    }

    fn collect_expr(&mut self, expr: &Expr) {
        match expr {
            Expr::Number(_) | Expr::StringLiteral(_) | Expr::Boolean(_) | Expr::Data(_) => {}
            Expr::VariableId(_) => {}
            Expr::CallId { .. } => {}
            Expr::Variable(name) => self.add(name),
            Expr::BinaryOp { left, right, .. } => {
                self.collect_expr(left);
                self.collect_expr(right);
            }
            Expr::UnaryOp { operand, .. } => self.collect_expr(operand),
            Expr::Call { name, args } => {
                self.add(name);
                for arg in args {
                    self.collect_expr(arg);
                }
            }
            Expr::Indicator(name) => {
                self.add(match name {
                    IndicatorIdx::Close => "Close",
                    IndicatorIdx::Open => "Open",
                    IndicatorIdx::High => "High",
                    IndicatorIdx::Low => "Low",
                    IndicatorIdx::Volume => "Volume",
                });
            }
            Expr::IndexAccess { target, index } => {
                self.add(target);
                self.collect_expr(index);
            }
            Expr::MethodCall {
                target,
                method,
                args,
            } => {
                self.add(target);
                self.add(method);
                for arg in args {
                    self.collect_expr(arg);
                }
            }
            Expr::PropertyAccess { target, property } => {
                self.add(target);
                self.add(property);
            }
            Expr::AssignIntrinsic { target, value } => {
                self.add(target);
                self.collect_expr(value);
            }
            Expr::AssignIntrinsicId { value, .. } => {
                self.collect_expr(value);
            }
        }
    }
}

/// 函数参数定义，记录名称及传参模式。
// 将参数签名定义成结构体，便于未来扩展更多修饰符（默认值等）。
#[derive(Debug, PartialEq, Clone, serde::Serialize, serde::Deserialize)]
pub struct FunctionParam {
    pub name: String,
    pub kind: ParamKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub id: Option<SymbolId>,
}

/// 参数传递方式
// 枚举不同的传参语义，避免运行期用字符串判断。
#[derive(Debug, PartialEq, Clone, serde::Serialize, serde::Deserialize)]
pub enum ParamKind {
    VarByValue,
    VarByRef,
    SeriesByRef,
}
