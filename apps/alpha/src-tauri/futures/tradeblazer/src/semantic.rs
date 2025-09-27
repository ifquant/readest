//! 语义分析器
//! 对AST进行语义检查，确保脚本符合TradeBlazer语法规则

use crate::ast::{Expr, IndicatorIdx, Script, Statement, SymbolId, SymbolTable};
use crate::error::{self, CompileError};
use std::cmp::Ordering;
use std::collections::HashSet;

type SymbolSet = HashSet<SymbolId>;

const BUILTIN_FUNCTIONS: &[&str] = &[
    "Print",
    "Alert",
    "Comment",
    "Plot",
    "Abs",
    "Max",
    "Min",
    "Sqrt",
    "Log",
    "Exp",
    "Sin",
    "Cos",
    "Tan",
    "Time",
    "Date",
    "Now",
    "Open",
    "High",
    "Low",
    "Close",
    "Volume",
    "Buy",
    "Sell",
    "BuyToCover",
    "SellShort",
    "ExitLong",
    "ExitShort",
    "length",
    "BuyCover",
    "SellCover",
    "MA",
    "EMA",
    "RSI",
    "ATR",
    "MACD",
];

const KNOWN_INDICATORS: &[&str] = &[
    "MA", "EMA", "SMA", "WMA", "KAMA", "RSI", "MACD", "KDJ", "BOLL", "SAR", "ATR", "OBV", "ROC",
    "WR", "CCI", "DMI", "BIAS", "PSY", "VR", "CR",
];

const PRICE_INDICATORS: &[&str] = &["Open", "High", "Low", "Close", "Volume"];

const TRADE_COMMANDS: &[&str] = &[
    "Buy",
    "Sell",
    "BuyCover",
    "SellCover",
    "ExitLong",
    "ExitShort",
    "BuyToCover",
    "SellShort",
];

pub fn analyze(script: &Script) -> Result<(), CompileError> {
    Analyzer::new(&script.symbols).analyze(script)
}

pub struct Analyzer<'a> {
    symbols: &'a SymbolTable,
    function_names: SymbolSet,
    global_variables: SymbolSet,
}

impl<'a> Analyzer<'a> {
    fn new(symbols: &'a SymbolTable) -> Self {
        Self {
            symbols,
            function_names: SymbolSet::new(),
            global_variables: SymbolSet::new(),
        }
    }

    fn analyze(mut self, script: &Script) -> Result<(), CompileError> {
        self.register_top_level(&script.statements)?;
        self.check_tradeblazer_functions();
        self.check_script(&script.statements)
    }

    fn register_top_level(&mut self, statements: &[Statement]) -> Result<(), CompileError> {
        for stmt in statements {
            match stmt {
                Statement::FunctionDef { name, .. } => {
                    let id = self.symbol_id(name);
                    Self::insert_unique(&mut self.function_names, self.symbols, id, "函数")?;
                }
                Statement::Assign { name, .. }
                | Statement::VarDecl { name, .. }
                | Statement::ArrayDecl { name, .. }
                | Statement::Series { name } => {
                    let id = self.symbol_id(name);
                    Self::insert_unique(&mut self.global_variables, self.symbols, id, "变量")?;
                }
                Statement::AssignId { name, .. } => {
                    Self::insert_unique(&mut self.global_variables, self.symbols, *name, "变量")?;
                }
                Statement::VarDeclId { name, .. }
                | Statement::ArrayDeclId { name, .. }
                | Statement::SeriesId { name } => {
                    Self::insert_unique(&mut self.global_variables, self.symbols, *name, "变量")?;
                }
                _ => {}
            }
        }
        Ok(())
    }

    fn insert_unique(
        set: &mut SymbolSet,
        symbols: &SymbolTable,
        id: SymbolId,
        kind: &str,
    ) -> Result<(), CompileError> {
        if !set.insert(id) {
            let name = symbols.get(id);
            Err(
                error::semantic_error(&format!("{} {} 重复定义", kind, name))
                    .with_suggestion(format!("Choose a unique name for {} '{}'", kind, name)),
            )
        } else {
            Ok(())
        }
    }

    fn check_tradeblazer_functions(&self) {
        let required_functions = ["OnInit", "OnTick", "OnBar"];
        for required in required_functions.iter() {
            let exists = self
                .function_names
                .iter()
                .any(|id| self.symbols.get(*id) == *required);
            if !exists {
                println!("警告: 未定义TradeBlazer标准函数 {}", required);
            }
        }
    }

    fn check_script(&self, statements: &[Statement]) -> Result<(), CompileError> {
        let mut scope = ScopeStack::new(self.global_variables.clone());
        for stmt in statements {
            self.check_statement(stmt, &mut scope, false)?;
        }
        Ok(())
    }

    fn check_statement(
        &self,
        stmt: &Statement,
        scope: &mut ScopeStack,
        inside_function: bool,
    ) -> Result<(), CompileError> {
        match stmt {
            Statement::If {
                condition,
                then_block,
                else_block,
            } => {
                self.check_expression(condition, scope)?;
                for stmt in then_block {
                    self.check_statement(stmt, scope, inside_function)?;
                }
                if let Some(block) = else_block {
                    for stmt in block {
                        self.check_statement(stmt, scope, inside_function)?;
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
                let var_id = self.symbol_id(var);
                let already_defined = scope.contains(var_id);
                scope.push();
                if !already_defined {
                    scope.insert_current(var_id);
                }
                self.check_expression(start, scope)?;
                self.check_expression(end, scope)?;
                if let Some(step_expr) = step {
                    self.check_expression(step_expr, scope)?;
                }
                for stmt in body {
                    self.check_statement(stmt, scope, inside_function)?;
                }
                scope.pop();
            }
            Statement::ForId {
                var,
                start,
                end,
                step,
                body,
            } => {
                let already_defined = scope.contains(*var);
                scope.push();
                if !already_defined {
                    scope.insert_current(*var);
                }
                self.check_expression(start, scope)?;
                self.check_expression(end, scope)?;
                if let Some(step_expr) = step {
                    self.check_expression(step_expr, scope)?;
                }
                for stmt in body {
                    self.check_statement(stmt, scope, inside_function)?;
                }
                scope.pop();
            }
            Statement::FunctionDef { name, params, body } => {
                if inside_function {
                    return Err(error::semantic_error("不支持在函数内部再定义函数")
                        .with_suggestion("Move the nested function to the top level"));
                }
                let mut inner_scope = scope.clone();
                let fn_id = self.symbol_id(name);
                inner_scope.push();
                for param in params {
                    let param_id = self.symbol_id(&param.name);
                    inner_scope.insert_current(param_id);
                }
                for stmt in body {
                    self.check_statement(stmt, &mut inner_scope, true)?;
                }
                inner_scope.pop();
                scope.insert_current(fn_id);
            }
            Statement::VarDecl { name, value } => {
                let id = self.symbol_id(name);
                if let Some(expr) = value {
                    self.check_expression(expr, scope)?;
                }
                scope.insert_current(id);
            }
            Statement::VarDeclId { name, value } => {
                if let Some(expr) = value {
                    self.check_expression(expr, scope)?;
                }
                scope.insert_current(*name);
            }
            Statement::Series { name } => {
                if inside_function {
                    return Err(error::semantic_error("series 只能在全局作用域声明")
                        .with_suggestion("Move the series declaration to the top level"));
                }
                let id = self.symbol_id(name);
                scope.insert_current(id);
            }
            Statement::SeriesId { name } => {
                if inside_function {
                    let symbol = self.symbols.get(*name);
                    return Err(error::semantic_error("series 只能在全局作用域声明")
                        .with_suggestion(format!(
                            "Move the series declaration '{}' to the top level",
                            symbol
                        )));
                }
                scope.insert_current(*name);
            }
            Statement::Assign { name, value } => {
                let id = self.symbol_id(name);
                if !scope.contains(id) {
                    let missing = name.as_str();
                    let candidates = scope.candidate_names(self.symbols);
                    let mut suggestions = vec![
                        "Declare the variable with 'var' or 'series' before using it".to_string(),
                        format!("If this is a typo, use the declared name: {}", missing),
                    ];
                    for similar in best_suggestions(missing, candidates.into_iter(), 2, 3) {
                        suggestions.push(format!("Did you mean '{}'?", similar));
                    }
                    return Err(
                        error::semantic_error(&format!("使用未定义的变量 '{}'", missing))
                            .with_suggestions(suggestions),
                    );
                }
                self.check_expression(value, scope)?;
            }
            Statement::ArrayDecl { name, .. } => {
                let id = self.symbol_id(name);
                scope.insert_current(id);
            }
            Statement::ArrayDeclId { name, .. } => {
                scope.insert_current(*name);
            }
            Statement::ArrayAssign { name, index, value } => {
                let id = self.symbol_id(name);
                if !scope.contains(id) {
                    return Err(
                        error::semantic_error(&format!("使用未定义的数组 '{}'", name))
                            .with_suggestion("Declare the array before assigning elements"),
                    );
                }
                self.check_expression(index, scope)?;
                self.check_expression(value, scope)?;
            }
            Statement::AssignId { name: _, value } => {
                // Already a lowered ID node: only validate the assigned expression
                self.check_expression(value, scope)?;
            }
            Statement::ExprStmt(expr) => {
                self.check_expression(expr, scope)?;
            }
            Statement::TradeCommand { cmd, params } => {
                if !TRADE_COMMANDS.contains(&cmd.as_str()) {
                    return Err(error::semantic_error(&format!("未知的交易指令: {}", cmd))
                        .with_suggestion("Use one of Buy/Sell/ExitLong/ExitShort/..."));
                }
                for expr in params {
                    self.check_expression(expr, scope)?;
                }
            }
            Statement::Return(expr) => {
                if !inside_function {
                    return Err(error::semantic_error("return 语句必须在函数内部使用")
                        .with_suggestion(
                            "Place the return statement inside a function or event handler",
                        ));
                }
                if let Some(expr) = expr {
                    self.check_expression(expr, scope)?;
                }
            }
        }
        Ok(())
    }

    fn check_expression(&self, expr: &Expr, scope: &ScopeStack) -> Result<(), CompileError> {
        match expr {
            Expr::BinaryOp { left, right, .. } => {
                self.check_expression(left, scope)?;
                self.check_expression(right, scope)?;
            }
            Expr::VariableId(_) => {}
            Expr::UnaryOp { operand, .. } => self.check_expression(operand, scope)?,
            Expr::Call { name, args } => {
                if !self.is_call_allowed(name) {
                    let mut suggestions = vec![
                        "Verify the function name is spelled correctly".to_string(),
                        format!("Define '{}' before calling it", name),
                    ];
                    let matches = best_suggestions(
                        name,
                        self.function_names
                            .iter()
                            .map(|id| self.symbols.get(*id))
                            .chain(BUILTIN_FUNCTIONS.iter().copied()),
                        2,
                        3,
                    );
                    for similar in matches {
                        suggestions.push(format!("Did you mean '{}'?", similar));
                    }

                    return Err(
                        error::semantic_error(&format!("调用未定义的函数: {}", name))
                            .with_suggestions(suggestions),
                    );
                }

                for arg in args {
                    self.check_expression(arg, scope)?;
                }
            }
            Expr::CallId { name, args } => {
                let call_name = self.symbols.get(*name);
                if !self.is_call_allowed(call_name) {
                    let mut suggestions = vec![
                        "Verify the function name is spelled correctly".to_string(),
                        format!("Define '{}' before calling it", call_name),
                    ];
                    for similar in
                        best_suggestions(call_name, BUILTIN_FUNCTIONS.iter().copied(), 2, 3)
                    {
                        suggestions.push(format!("Did you mean '{}'?", similar));
                    }
                    return Err(
                        error::semantic_error(&format!("调用未定义的函数: {}", call_name))
                            .with_suggestions(suggestions),
                    );
                }
                for arg in args {
                    self.check_expression(arg, scope)?;
                }
            }
            Expr::Variable(name) => {
                if !scope.contains(self.symbol_id(name)) && name != "true" && name != "false" {
                    let candidates = scope.candidate_names(self.symbols);
                    let mut suggestions = vec![
                        "Declare the variable with 'var' or 'series' before using it".to_string(),
                        format!("If this is a typo, use the declared name: {}", name),
                    ];
                    for similar in best_suggestions(name, candidates.into_iter(), 2, 3) {
                        suggestions.push(format!("Did you mean '{}'?", similar));
                    }

                    return Err(
                        error::semantic_error(&format!("使用未定义的变量 '{}'", name))
                            .with_suggestions(suggestions),
                    );
                }
            }
            Expr::Indicator(name) => {
                if !is_valid_indicator(name) {
                    let mut suggestions =
                        vec!["Verify the indicator name exists in the built-in list".to_string()];
                    for similar in
                        best_suggestions(name.as_str(), KNOWN_INDICATORS.iter().copied(), 2, 3)
                    {
                        suggestions.push(format!("Did you mean '{}'?", similar));
                    }
                    return Err(error::semantic_error(&format!("未知的指标: {}", name))
                        .with_suggestions(suggestions));
                }
            }
            Expr::IndexAccess { target, index } => {
                let id = self.symbol_id(target);
                if !scope.contains(id)
                    && !PRICE_INDICATORS.iter().any(|indicator| indicator == target)
                {
                    return Err(
                        error::semantic_error(&format!("使用未定义的变量 '{}'", target))
                            .with_suggestion("Declare the series or variable before indexing it"),
                    );
                }
                self.check_expression(index, scope)?;
            }
            Expr::MethodCall {
                target,
                method: _,
                args,
            } => {
                let id = self.symbol_id(target);
                if !scope.contains(id) {
                    return Err(
                        error::semantic_error(&format!("使用未定义的变量 '{}'", target))
                            .with_suggestion("Declare the object before invoking its methods"),
                    );
                }
                for arg in args {
                    self.check_expression(arg, scope)?;
                }
            }
            Expr::PropertyAccess {
                target,
                property: _,
            } => {
                let id = self.symbol_id(target);
                if !scope.contains(id) {
                    return Err(
                        error::semantic_error(&format!("使用未定义的变量 '{}'", target))
                            .with_suggestion("Declare the object before reading its property"),
                    );
                }
            }
            Expr::AssignIntrinsic { target, value } => {
                let id = self.symbol_id(target);
                if !scope.contains(id) {
                    return Err(
                        error::semantic_error(&format!("使用未定义的变量 '{}'", target))
                            .with_suggestion("Declare the variable before assigning to it"),
                    );
                }
                self.check_expression(value, scope)?;
            }
            Expr::AssignIntrinsicId { target, value } => {
                if !scope.contains(*target) {
                    let name = self.symbols.get(*target);
                    return Err(
                        error::semantic_error(&format!("使用未定义的变量 '{}'", name))
                            .with_suggestion("Declare the variable before assigning to it"),
                    );
                }
                self.check_expression(value, scope)?;
            }
            _ => {}
        }

        Ok(())
    }

    fn is_call_allowed(&self, name: &str) -> bool {
        let builtin = is_builtin_function(name)
            || matches!(
                name,
                "_index_access" | "_method_call" | "_property_access" | "_assign"
            );
        builtin
            || self
                .function_names
                .iter()
                .any(|id| self.symbols.get(*id) == name)
    }

    fn symbol_id(&self, name: &str) -> SymbolId {
        self.symbols
            .find(name)
            .unwrap_or_else(|| panic!("symbol '{}' not interned", name))
    }
}

#[derive(Clone)]
struct ScopeStack {
    scopes: Vec<SymbolSet>,
}

impl ScopeStack {
    fn new(base: SymbolSet) -> Self {
        Self { scopes: vec![base] }
    }

    fn push(&mut self) {
        self.scopes.push(SymbolSet::new());
    }

    fn pop(&mut self) {
        debug_assert!(self.scopes.len() > 1, "attempted to pop global scope");
        if self.scopes.len() > 1 {
            self.scopes.pop();
        }
    }

    fn contains(&self, symbol: SymbolId) -> bool {
        self.scopes
            .iter()
            .rev()
            .any(|scope| scope.contains(&symbol))
    }

    fn insert_current(&mut self, symbol: SymbolId) {
        if let Some(scope) = self.scopes.last_mut() {
            scope.insert(symbol);
        }
    }

    fn candidate_names<'a>(&'a self, symbols: &'a SymbolTable) -> Vec<&'a str> {
        self.scopes
            .iter()
            .flat_map(|scope| scope.iter())
            .map(|id| symbols.get(*id))
            .collect()
    }
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();

    if a_chars.is_empty() {
        return b_chars.len();
    }
    if b_chars.is_empty() {
        return a_chars.len();
    }

    let mut prev: Vec<usize> = (0..=b_chars.len()).collect();
    let mut curr = vec![0; b_chars.len() + 1];

    for (i, &ac) in a_chars.iter().enumerate() {
        curr[0] = i + 1;
        for (j, &bc) in b_chars.iter().enumerate() {
            let cost = if ac == bc { 0 } else { 1 };
            curr[j + 1] = (prev[j + 1] + 1).min(curr[j] + 1).min(prev[j] + cost);
        }
        prev.clone_from_slice(&curr);
    }

    prev[b_chars.len()]
}

fn best_suggestions<'a, I>(
    target: &str,
    candidates: I,
    max_distance: usize,
    limit: usize,
) -> Vec<String>
where
    I: IntoIterator<Item = &'a str>,
{
    let mut scored: Vec<(usize, String)> = candidates
        .into_iter()
        .filter_map(|candidate| {
            let distance = levenshtein(target, candidate);
            if distance <= max_distance {
                Some((distance, candidate.to_string()))
            } else {
                None
            }
        })
        .collect();

    scored.sort_by(|a, b| match a.0.cmp(&b.0) {
        Ordering::Equal => a.1.cmp(&b.1),
        other => other,
    });

    scored
        .into_iter()
        .take(limit)
        .map(|(_, name)| name)
        .collect()
}

fn is_builtin_function(name: &str) -> bool {
    BUILTIN_FUNCTIONS.iter().any(|candidate| *candidate == name)
}

fn is_valid_indicator(indidx: &IndicatorIdx) -> bool {
    /*
    KNOWN_INDICATORS
        .iter()
        .chain(PRICE_INDICATORS.iter())
        .any(|candidate| *candidate == name)
    */
    return true;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{Expr, FunctionParam, Op, ParamKind, Script, Statement};

    fn analyze_statements(statements: Vec<Statement>) -> Result<(), CompileError> {
        let script = Script::new(statements);
        analyze(&script)
    }

    fn expect_error(statements: Vec<Statement>) -> CompileError {
        analyze_statements(statements).expect_err("预期语义分析失败但却通过")
    }

    fn param_var(name: &str) -> FunctionParam {
        FunctionParam {
            name: name.to_string(),
            kind: ParamKind::VarByValue,
            id: None,
        }
    }

    #[allow(dead_code)]
    fn param_series(name: &str) -> FunctionParam {
        FunctionParam {
            name: name.to_string(),
            kind: ParamKind::SeriesByRef,
            id: None,
        }
    }

    #[test]
    fn function_parameters_are_treated_as_defined() {
        let result = analyze_statements(vec![Statement::FunctionDef {
            name: "Foo".to_string(),
            params: vec![param_var("x")],
            body: vec![Statement::Return(Some(Expr::Variable("x".to_string())))],
        }]);
        assert!(result.is_ok());
    }
}
