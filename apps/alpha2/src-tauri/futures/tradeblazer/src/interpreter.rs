//! 解释器实现
//! 执行编译后的TradeBlazer脚本

use crate::ast::{
    Expr, IndicatorIdx, Op, ParamKind, Script, Statement, SymbolId, SymbolTable,
};
use crate::error::{self, CompileError};
use crate::TradingExecutor;
use smallvec::SmallVec;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;

/// K线数据结构
#[derive(Debug, Clone)]
pub struct Bar {
    pub time: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

/// Tick数据结构
#[derive(Debug, Clone)]
pub struct Tick {
    pub time: String,
    pub price: f64,
    pub volume: f64,
}

/// 交易指令
#[derive(Debug, Clone)]
pub enum OrderCmd {
    Buy,
    Sell,
    BuyCover,
    SellCover,
    ExitLong,
    ExitShort,
}


/// 值类型
#[derive(Debug, PartialEq, Clone)]
pub enum Value {
    Number(f64),
    String(String),
    Boolean(bool),
    Series(SeriesData),
    Array(Vec<f64>),
    Builtin(BuiltinFunction),
}

#[derive(Debug, PartialEq, Clone, Default)]
pub struct SeriesData {
    pub data: Vec<f64>,
    pub accdata: f64,
}

impl SeriesData {
    pub fn new() -> Self {
        Self {
            data: Vec::new(),
            accdata: 0.0,
        }
    }

    pub fn push(&mut self, value: f64) {
        self.data.push(value);
    }

    pub fn len(&self) -> usize {
        self.data.len()
    }

    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn as_slice(&self) -> &[f64] {
        &self.data
    }
}

#[derive(Debug, PartialEq, Eq, Clone, Copy, Hash)]
pub enum BuiltinFunction {
    Plot,
    Abs,
    Max,
    Min,
    Sqrt,
    Log,
    Exp,
    Sin,
    Cos,
    Tan,
    Print,
    Length,
    Buy,
    Sell,
    BuyCover,
    SellCover,
    ExitLong,
    ExitShort,
    Ma,
    Ema,
    Rsi,
    Atr,
    Macd,
}

const BUILTIN_REGISTRY: &[(&str, BuiltinFunction)] = &[
    ("Plot", BuiltinFunction::Plot),
    ("Abs", BuiltinFunction::Abs),
    ("Max", BuiltinFunction::Max),
    ("Min", BuiltinFunction::Min),
    ("Sqrt", BuiltinFunction::Sqrt),
    ("Log", BuiltinFunction::Log),
    ("Exp", BuiltinFunction::Exp),
    ("Sin", BuiltinFunction::Sin),
    ("Cos", BuiltinFunction::Cos),
    ("Tan", BuiltinFunction::Tan),
    ("Print", BuiltinFunction::Print),
    ("length", BuiltinFunction::Length),
    ("Buy", BuiltinFunction::Buy),
    ("Sell", BuiltinFunction::Sell),
    ("BuyCover", BuiltinFunction::BuyCover),
    ("SellCover", BuiltinFunction::SellCover),
    ("ExitLong", BuiltinFunction::ExitLong),
    ("ExitShort", BuiltinFunction::ExitShort),
    ("MA", BuiltinFunction::Ma),
    ("EMA", BuiltinFunction::Ema),
    ("RSI", BuiltinFunction::Rsi),
    ("ATR", BuiltinFunction::Atr),
    ("MACD", BuiltinFunction::Macd),
];

/// 解释器
pub struct Interpreter {
    // 值栈，从全局作用域开始逐层向内扩展。
    frames: Vec<ScopeFrame>,
    // `functions` 纯粹记录顶层声明，避免在执行阶段还原AST结构。
    functions: HashMap<String, FunctionDef>,
    // 形参引用别名映射，同步跟随作用域栈。
    references: Vec<HashMap<String, ScopeRef>>,
    // 变量名称到实际位置的快速索引，避免每次都在 HashMap 链中遍历。
    bindings: Vec<HashMap<String, ScopeRef>>,
    // ID 版引用与绑定（逐步迁移过程中与字符串并存）
    references_by_id: Vec<HashMap<SymbolId, ScopeRef>>,
    bindings_by_id: Vec<HashMap<SymbolId, ScopeRef>>,
    builtins_by_id: HashMap<SymbolId, BuiltinFunction>,
    functions_by_id: HashMap<SymbolId, FunctionDef>,
    market_data_context: MarketDataContext,
    trading_executor: Box<dyn TradingExecutor>,
    max_bars: usize,
    symbol_table: Option<Arc<SymbolTable>>,
    symbol_lookup: HashMap<String, SymbolId>,
    maintain_string_bindings: bool,
}

#[derive(Clone, Debug)]
struct ScopeRef {
    scope_index: usize,
    slot: usize,
}

#[derive(Clone, Debug)]
struct ScopeFrame {
    values: Vec<Value>,
    slot_names: Option<Vec<String>>,
    name_to_slot: Option<HashMap<String, usize>>,
    id_to_slot: HashMap<SymbolId, usize>,
    maintain_strings: bool,
}

impl ScopeFrame {
    fn new(maintain_strings: bool) -> Self {
        Self {
            values: Vec::new(),
            slot_names: if maintain_strings {
                Some(Vec::new())
            } else {
                None
            },
            name_to_slot: if maintain_strings {
                Some(HashMap::new())
            } else {
                None
            },
            id_to_slot: HashMap::new(),
            maintain_strings,
        }
    }

    fn ensure_string_maps(&mut self) {
        if self.slot_names.is_none() {
            self.slot_names = Some(Vec::new());
        }
        if self.name_to_slot.is_none() {
            self.name_to_slot = Some(HashMap::new());
        }
    }

    fn insert_named(&mut self, name: &str, value: Value) -> usize {
        self.ensure_string_maps();
        let name_to_slot = self.name_to_slot.as_mut().unwrap();
        let slot_names = self.slot_names.as_mut().unwrap();
        if let Some(&slot) = name_to_slot.get(name) {
            self.values[slot] = value;
            slot
        } else {
            let slot = self.values.len();
            self.values.push(value);
            slot_names.push(name.to_string());
            name_to_slot.insert(name.to_string(), slot);
            slot
        }
    }

    fn insert_with_id(&mut self, id: SymbolId, name: &str, value: Value) -> usize {
        if let Some(&slot) = self.id_to_slot.get(&id) {
            self.values[slot] = value;
            slot
        } else {
            let slot = if self.maintain_strings {
                self.insert_named(name, value)
            } else {
                let slot = self.values.len();
                self.values.push(value);
                slot
            };
            self.id_to_slot.insert(id, slot);
            slot
        }
    }

    fn get(&self, slot: usize) -> Option<&Value> {
        self.values.get(slot)
    }

    fn get_mut(&mut self, slot: usize) -> Option<&mut Value> {
        self.values.get_mut(slot)
    }
}

#[derive(Clone)]
struct LoopStepPlan<'a> {
    target: ScopeRef,
    expr: &'a Expr,
}

#[derive(Clone, Debug)]
struct FunctionDef {
    /// Metadata describing how each形参应绑定到运行期作用域。
    param_plan: Vec<ParamPlan>,
    // 函数体挂在 `Arc` 上，事件触发和递归调用时只需共享引用即可，避免重复拷贝
    // 大量语句向量。
    body: Arc<[Statement]>,
}

#[derive(Clone, Debug)]
struct ParamPlan {
    /// 原始形参名称，仅在调试模式下用于字符串映射。
    name: String,
    /// 已 intern 的符号 ID；若为 `None` 表示该符号未进入符号表。
    id: Option<SymbolId>,
    /// 传参方式决定按值 / 引用的绑定逻辑。
    kind: ParamKind,
}

#[derive(Clone, Debug)]
struct ReferenceTarget {
    name: String,
    id: Option<SymbolId>,
}

/// 数据上下文
pub struct MarketDataContext {
    //bars: VecDeque<Bar>,
    current_tick: Option<crate::Tick>,
    closes: Vec<f64>,
    opens: Vec<f64>,
    highs: Vec<f64>,
    lows: Vec<f64>,
    volumes: Vec<f64>,
}

impl MarketDataContext {
    pub fn new(max_bars: usize) -> Self {
        Self {
            //bars: VecDeque::with_capacity(max_bars),
            current_tick: None,
            closes: Vec::with_capacity(max_bars),
            opens: Vec::with_capacity(max_bars),
            highs: Vec::with_capacity(max_bars),
            lows: Vec::with_capacity(max_bars),
            volumes: Vec::with_capacity(max_bars),
        }
    }

    pub fn add_bar(&mut self, bar: crate::Bar, max_bars: usize) {
        // 轻量环形缓存：`VecDeque` 前后 push/pop 能保持固定窗口。
        /*
        if self.bars.len() >= max_bars {
            if let Some(removed) = self.bars.pop_front() {
                if !self.closes.is_empty() {
                    self.closes.remove(0);
                }
                drop(removed);
            }
        }*/
        if (self.closes.len() >= max_bars) {
            self.closes.remove(0);
            self.opens.remove(0);
            self.highs.remove(0);
            self.lows.remove(0);
            self.volumes.remove(0);
        }
        self.closes.push(bar.close);
        self.opens.push(bar.open);
        self.highs.push(bar.high);
        self.lows.push(bar.low);
        self.volumes.push(bar.volume);
        //self.bars.push_back(bar);
    }

    pub fn set_tick(&mut self, tick: crate::Tick) {
        self.current_tick = Some(tick);
    }

    pub fn get_bars(&self, indidx: IndicatorIdx) -> &Vec<f64> {
        match indidx {
            IndicatorIdx::Close => &self.closes,
            IndicatorIdx::Open => &self.opens,
            IndicatorIdx::High => &self.highs,
            IndicatorIdx::Low => &self.lows,
            IndicatorIdx::Volume => &self.volumes,
            _ => panic!("不支持的指标索引: {}", indidx),
        }
    }

    pub fn get_current_tick(&self) -> Option<&crate::Tick> {
        self.current_tick.as_ref()
    }

    pub fn closes(&self) -> &[f64] {
        &self.closes
    }
}

impl Interpreter {
    // ------------------------------------------------------------------
    // 构造与配置
    // ------------------------------------------------------------------
    /// 创建一个新的解释器
    pub fn new(
        market_data_context: MarketDataContext,
        max_bars: usize,
        maintain_string_bindings: bool,
        trading_executor: Box<dyn TradingExecutor>,
    ) -> Self {
        let mut global_frame = ScopeFrame::new(maintain_string_bindings);
        Interpreter::register_builtin_functions(&mut global_frame);

        let mut interpreter = Self {
            frames: vec![global_frame],
            functions: HashMap::new(),
            references: vec![HashMap::new()],
            bindings: vec![HashMap::new()],
            references_by_id: vec![HashMap::new()],
            bindings_by_id: vec![HashMap::new()],
            builtins_by_id: HashMap::new(),
            functions_by_id: HashMap::new(),
            market_data_context,
            trading_executor,
            max_bars,
            symbol_table: None,
            symbol_lookup: HashMap::new(),
            maintain_string_bindings,
        };

        if interpreter.maintain_string_bindings {
            if let Some(name_map) = interpreter.frames[0].name_to_slot.as_ref() {
                for (name, &slot) in name_map {
                    interpreter.bindings[0].insert(
                        name.clone(),
                        ScopeRef {
                            scope_index: 0,
                            slot,
                        },
                    );
                }
            }
        }

        interpreter
    }

    // 注册内置函数
    fn register_builtin_functions(frame: &mut ScopeFrame) {
        // 注册一些常用的内置函数
        for (name, builtin) in BUILTIN_REGISTRY {
            frame.insert_named(name, Value::Builtin(*builtin));
        }
    }

    fn push_scope(&mut self) {
        // “作用域堆栈”惯用法：每进一个函数/块就追加一层 HashMap。
        self.frames
            .push(ScopeFrame::new(self.maintain_string_bindings));
        self.references.push(HashMap::new());
        self.bindings.push(HashMap::new());
        self.references_by_id.push(HashMap::new());
        self.bindings_by_id.push(HashMap::new());
    }

    fn pop_scope(&mut self) {
        // 与 `push_scope` 成对使用，类似 RAII 手法，避免泄漏局部绑定。
        debug_assert!(self.frames.len() > 1, "attempted to pop global scope");
        if self.frames.len() > 1 {
            self.frames.pop();
            self.references.pop();
            self.bindings.pop();
            self.references_by_id.pop();
            self.bindings_by_id.pop();
        }
    }

    // ------------------------------------------------------------------
    // 解析与初始化
    // ------------------------------------------------------------------

    fn find_reference(&self, name: &str) -> Option<&ScopeRef> {
        for refs in self.references.iter().rev() {
            if let Some(target) = refs.get(name) {
                return Some(target);
            }
        }
        None
    }

    fn find_reference_owned(&self, name: &str) -> Option<ScopeRef> {
        self.find_reference(name).cloned()
    }

    fn find_variable_scope(&self, name: &str) -> Option<usize> {
        if !self.maintain_string_bindings {
            return None;
        }
        for (index, cache) in self.bindings.iter().enumerate().rev() {
            if cache.contains_key(name) {
                return Some(index);
            }
        }
        None
    }

    fn resolve_binding_by_id(&self, id: SymbolId) -> Option<ScopeRef> {
        for refs in self.references_by_id.iter().rev() {
            if let Some(target) = refs.get(&id) {
                return Some(target.clone());
            }
        }
        for cache in self.bindings_by_id.iter().rev() {
            if let Some(target) = cache.get(&id) {
                return Some(target.clone());
            }
        }
        None
    }

    fn resolve_binding(&self, name: &str) -> Option<ScopeRef> {
        if let Some(reference) = self.find_reference_owned(name) {
            Some(reference)
        } else {
            self.find_variable_scope(name)
                .and_then(|scope_index| self.bindings[scope_index].get(name).cloned())
                .or_else(|| {
                    self.symbol_lookup
                        .get(name)
                        .and_then(|id| self.resolve_binding_by_id(*id))
                })
        }
    }

    fn get_variable_value(&self, name: &str) -> Option<&Value> {
        if let Some(target) = self.find_reference(name) {
            return self.read_scope_ref(target);
        }
        self.resolve_binding(name)
            .and_then(|scope_ref| self.read_scope_ref(&scope_ref))
    }

    fn get_variable_value_mut(&mut self, target: &ScopeRef) -> Option<&mut Value> {
        self.frames
            .get_mut(target.scope_index)
            .and_then(|frame| frame.get_mut(target.slot))
    }

    fn read_scope_ref(&self, target: &ScopeRef) -> Option<&Value> {
        self.frames
            .get(target.scope_index)
            .and_then(|frame| frame.get(target.slot))
    }

    fn write_scope_ref(&mut self, target: ScopeRef, value: Value) {
        if let Some(frame) = self.frames.get_mut(target.scope_index) {
            if let Some(slot) = frame.get_mut(target.slot) {
                *slot = value;
            }
        }
    }

    fn compile_loop_step<'a>(
        &self,
        var_name: &str,
        step_expr: &'a Expr,
        target: &ScopeRef,
    ) -> Option<LoopStepPlan<'a>> {
        match step_expr {
            Expr::AssignIntrinsic {
                target: step_var,
                value,
            } if step_var == var_name => Some(LoopStepPlan {
                target: target.clone(),
                expr: value.as_ref(),
            }),
            Expr::AssignIntrinsicId {
                target: step_id,
                value,
            } if self
                .symbol_name_ref(*step_id)
                .map(|n| n == var_name)
                .unwrap_or(false) =>
            {
                Some(LoopStepPlan {
                    target: target.clone(),
                    expr: value.as_ref(),
                })
            }
            Expr::Call { name, args } if name == "_assign" && args.len() == 2 => {
                if let Expr::StringLiteral(step_var) = &args[0] {
                    if step_var == var_name {
                        return Some(LoopStepPlan {
                            target: target.clone(),
                            expr: &args[1],
                        });
                    }
                }
                None
            }
            _ => None,
        }
    }

    fn execute_loop_step(&mut self, plan: &LoopStepPlan) -> Result<(), CompileError> {
        let value = self.evaluate_expression(plan.expr)?;
        self.write_scope_ref(plan.target.clone(), value);
        Ok(())
    }

    fn compile_loop_step_id<'a>(
        &self,
        var_id: SymbolId,
        step_expr: &'a Expr,
        target: &ScopeRef,
    ) -> Option<LoopStepPlan<'a>> {
        match step_expr {
            Expr::AssignIntrinsicId {
                target: step_id,
                value,
            } if *step_id == var_id => Some(LoopStepPlan {
                target: target.clone(),
                expr: value.as_ref(),
            }),
            Expr::AssignIntrinsic {
                target: step_name,
                value,
            } => {
                if let Some(step_id) = self.symbol_id_for(step_name) {
                    if step_id == var_id {
                        return Some(LoopStepPlan {
                            target: target.clone(),
                            expr: value.as_ref(),
                        });
                    }
                }
                None
            }
            Expr::Call { name, args } if name == "_assign" && args.len() == 2 => {
                if let Expr::StringLiteral(step_var) = &args[0] {
                    if let Some(step_id) = self.symbol_id_for(step_var) {
                        if step_id == var_id {
                            return Some(LoopStepPlan {
                                target: target.clone(),
                                expr: &args[1],
                            });
                        }
                    }
                }
                None
            }
            Expr::CallId { name, args } if args.len() == 2 => {
                if self
                    .symbol_name_ref(*name)
                    .map(|s| s == "_assign")
                    .unwrap_or(false)
                {
                    if let Expr::StringLiteral(step_var) = &args[0] {
                        if let Some(step_id) = self.symbol_id_for(step_var) {
                            if step_id == var_id {
                                return Some(LoopStepPlan {
                                    target: target.clone(),
                                    expr: &args[1],
                                });
                            }
                        }
                    }
                }
                None
            }
            _ => None,
        }
    }

    fn set_reference_param(&mut self, param: &ParamPlan, target: ScopeRef) {
        if self.maintain_string_bindings || param.id.is_none() {
            if let Some(scope) = self.references.last_mut() {
                scope.insert(param.name.clone(), target.clone());
            }
        }
        if let Some(id) = param.id {
            if let Some(scope) = self.references_by_id.last_mut() {
                scope.insert(id, target);
            }
        }
    }

    fn declare_variable(&mut self, name: &str, value: Value) {
        let scope_index = self.frames.len() - 1;
        if let Some(frame) = self.frames.last_mut() {
            if let Some(id) = self.symbol_lookup.get(name).copied() {
                let slot = frame.insert_with_id(id, name, value);
                if let Some(cache) = self.bindings_by_id.last_mut() {
                    cache.insert(id, ScopeRef { scope_index, slot });
                }
                if self.maintain_string_bindings {
                    if let Some(cache) = self.bindings.last_mut() {
                        cache.insert(name.to_string(), ScopeRef { scope_index, slot });
                    }
                }
            } else {
                let slot = frame.insert_named(name, value);
                if self.maintain_string_bindings {
                    if let Some(cache) = self.bindings.last_mut() {
                        cache.insert(name.to_string(), ScopeRef { scope_index, slot });
                    }
                }
            }
        }
    }

    fn declare_variable_by_id(&mut self, id: SymbolId, value: Value) {
        let scope_index = self.frames.len() - 1;
        let name_owned = if self.maintain_string_bindings {
            self.symbol_name_ref(id).map(|s| s.to_string())
        } else {
            None
        };
        if let Some(frame) = self.frames.last_mut() {
            let slot = frame.insert_with_id(id, name_owned.as_deref().unwrap_or(""), value);
            if let Some(cache) = self.bindings_by_id.last_mut() {
                cache.insert(id, ScopeRef { scope_index, slot });
            }
            if self.maintain_string_bindings {
                if let Some(name) = name_owned {
                    if let Some(cache) = self.bindings.last_mut() {
                        cache.insert(name.to_string(), ScopeRef { scope_index, slot });
                    }
                }
            }
        }
    }

    fn get_variable_value_by_id(&self, id: SymbolId) -> Option<&Value> {
        // 先查引用别名
        for refs in self.references_by_id.iter().rev() {
            if let Some(target) = refs.get(&id) {
                return self.read_scope_ref(target);
            }
        }
        // 再查绑定
        for (_idx, cache) in self.bindings_by_id.iter().enumerate().rev() {
            if let Some(target) = cache.get(&id) {
                return self.read_scope_ref(target);
            }
        }
        None
    }

    fn assign_variable_by_id(&mut self, id: SymbolId, value: &Value) -> Result<(), CompileError> {
        // 先定位目标，再进行一次可变写入，避免可变/不可变借用冲突
        let mut found: Option<ScopeRef> = None;
        for refs in self.references_by_id.iter().rev() {
            if let Some(target) = refs.get(&id) {
                found = Some(target.clone());
                break;
            }
        }
        if found.is_none() {
            for cache in self.bindings_by_id.iter().rev() {
                if let Some(target) = cache.get(&id) {
                    found = Some(target.clone());
                    break;
                }
            }
        }
        if let Some(target) = found {
            return self.assign_scope_ref(target, value);
        }
        Err(error::runtime_error("AssignId target not bound"))
    }

    fn symbol_id_for(&self, name: &str) -> Option<SymbolId> {
        self.symbol_lookup.get(name).copied()
    }

    fn symbol_name_ref<'a>(&'a self, id: SymbolId) -> Option<&'a str> {
        self.symbol_table.as_ref().map(|table| table.get(id))
    }

    fn symbol_name(&self, id: SymbolId) -> String {
        if let Some(name) = self.symbol_name_ref(id) {
            name.to_string()
        } else {
            format!("<symbol:{}>", id.0)
        }
    }

    fn evaluate_call_arguments(
        &mut self,
        args: &[Expr],
    ) -> Result<SmallVec<[Value; 4]>, CompileError> {
        let mut values: SmallVec<[Value; 4]> = SmallVec::with_capacity(args.len());
        for arg in args {
            values.push(self.evaluate_expression(arg)?);
        }
        Ok(values)
    }

    fn call_by_symbol_id(
        &mut self,
        id: SymbolId,
        arg_exprs: &[Expr],
    ) -> Result<Value, CompileError> {
        let arg_values = self.evaluate_call_arguments(arg_exprs)?;

        if let Some(builtin) = self.builtins_by_id.get(&id).copied() {
            return self.call_builtin(builtin, &arg_values);
        }

        if let Some(function) = self.functions_by_id.get(&id).cloned() {
            let name_owned = self
                .symbol_name_ref(id)
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("<user-function:{}>", id.0));
            return self.call_user_defined_function(&name_owned, &function, arg_exprs, &arg_values);
        }

        let name = self
            .symbol_name_ref(id)
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("<symbol:{}>", id.0));
        Err(error::runtime_error(&format!("未定义的函数: {}", name)))
    }

    fn assign_scope_ref(&mut self, target: ScopeRef, value: &Value) -> Result<(), CompileError> {
        if matches!(self.read_scope_ref(&target), Some(Value::Series(_))) {
            match value {
                Value::Series(new_series) => {
                    if let Some(Value::Series(existing)) = self.get_variable_value_mut(&target) {
                        *existing = new_series.clone();
                    }
                }
                other => {
                    let number = match other {
                        Value::Number(n) => *n,
                        _ => self.to_number(other)?,
                    };
                    if let Some(Value::Series(existing)) = self.get_variable_value_mut(&target) {
                        existing.push(number);
                    }
                }
            }
            return Ok(());
        }

        if let Some(slot) = self.get_variable_value_mut(&target) {
            // Hot path: update scalars/strings in place so we avoid cloning the entire
            // `Value` enum for simple assignments (e.g. number rebinds inside tight loops).
            match value {
                Value::Number(src) => {
                    if let Value::Number(dst) = slot {
                        *dst = *src;
                        return Ok(());
                    }
                }
                Value::Boolean(src) => {
                    if let Value::Boolean(dst) = slot {
                        *dst = *src;
                        return Ok(());
                    }
                }
                Value::String(src) => {
                    if let Value::String(dst) = slot {
                        *dst = src.clone();
                        return Ok(());
                    }
                }
                Value::Array(src) => {
                    if let Value::Array(dst) = slot {
                        *dst = src.clone();
                        return Ok(());
                    }
                }
                Value::Builtin(src) => {
                    if let Value::Builtin(dst) = slot {
                        *dst = *src;
                        return Ok(());
                    }
                }
                Value::Series(_) => {}
            }
            *slot = value.clone();
            return Ok(());
        }

        self.write_scope_ref(target, value.clone());
        Ok(())
    }

    fn assign_variable(&mut self, name: &str, value: &Value) -> Result<(), CompileError> {
        if let Some(target) = self.resolve_binding(name) {
            return self.assign_scope_ref(target, value);
        }

        // 若变量从未定义，则视作在当前作用域中新建。
        self.declare_variable(name, value.clone());
        Ok(())
    }

    fn remove_current_scope_variable(&mut self, name: &str) {
        if let Some(frame) = self.frames.last_mut() {
            if let Some(slot_names) = frame.slot_names.as_mut() {
                if slot_names.last().map(|n| n == name).unwrap_or(false) {
                    let slot = slot_names.len() - 1;
                    slot_names.pop();
                    frame.values.pop();
                    if let Some(map) = frame.name_to_slot.as_mut() {
                        map.remove(name);
                    }
                    if let Some(id) =
                        frame
                            .id_to_slot
                            .iter()
                            .find_map(|(id, &s)| if s == slot { Some(*id) } else { None })
                    {
                        frame.id_to_slot.remove(&id);
                        if let Some(cache) = self.bindings_by_id.last_mut() {
                            cache.remove(&id);
                        }
                    }
                }
            }
        }
        if self.maintain_string_bindings {
            if let Some(cache) = self.bindings.last_mut() {
                cache.remove(name);
            }
        }
    }

    fn remove_current_scope_variable_by_id(&mut self, id: SymbolId) {
        if let Some(frame) = self.frames.last_mut() {
            if let Some(&slot) = frame.id_to_slot.get(&id) {
                if frame.values.len() == slot + 1 {
                    frame.id_to_slot.remove(&id);
                    if let Some(cache) = self.bindings_by_id.last_mut() {
                        cache.remove(&id);
                    }
                    frame.values.pop();
                    if let Some(slot_names) = frame.slot_names.as_mut() {
                        if let Some(name) = slot_names.pop() {
                            if let Some(map) = frame.name_to_slot.as_mut() {
                                map.remove(&name);
                            }
                            if self.maintain_string_bindings {
                                if let Some(cache) = self.bindings.last_mut() {
                                    cache.remove(&name);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    fn extract_reference_target(
        &self,
        expr: &Expr,
        expected: &str,
    ) -> Result<ReferenceTarget, CompileError> {
        match expr {
            Expr::Variable(name) => Ok(ReferenceTarget {
                name: name.clone(),
                id: self.symbol_id_for(name),
            }),
            Expr::VariableId(id) => Ok(ReferenceTarget {
                name: self.symbol_name(*id),
                id: Some(*id),
            }),
            _ => Err(error::runtime_error(&format!(
                "{} 参数必须是变量引用",
                expected
            ))),
        }
    }

    // ------------------------------------------------------------------
    // 公共执行入口
    // ------------------------------------------------------------------

    /// 执行整个脚本
    pub fn execute(&mut self, script: &Script) -> Result<(), CompileError> {
        let mut lowered = Script {
            symbols: script.symbols.clone(),
            statements: script.statements.clone(),
        };
        lowered.lower_ids();

        for stmt in &lowered.statements {
            let _ = self.execute_statement(stmt)?;
        }
        Ok(())
    }

    /// 解析脚本，提取函数定义和全局变量
    pub fn parse_script(&mut self, script: &Script) -> Result<(), CompileError> {
        let mut lowered = Script {
            symbols: script.symbols.clone(),
            statements: script.statements.clone(),
        };
        lowered.lower_ids();
        self.ingest_lowered_script(&lowered)
    }

    /// 解析已经完成降级的脚本（所有热点节点均使用 SymbolId）
    pub fn parse_lowered_script(&mut self, script: &Script) -> Result<(), CompileError> {
        self.ingest_lowered_script(script)
    }

    fn ingest_lowered_script(&mut self, script: &Script) -> Result<(), CompileError> {
        let table = Arc::new(script.symbols.clone());
        self.symbol_table = Some(table.clone());
        self.symbol_lookup.clear();
        for (id, name) in table.iter() {
            self.symbol_lookup.insert(name.to_string(), id);
        }

        // Build builtin id table
        self.builtins_by_id.clear();
        for (name, b) in BUILTIN_REGISTRY {
            if let Some(id) = self.symbol_lookup.get(*name) {
                self.builtins_by_id.insert(*id, *b);
            }
        }

        // 同步全局作用域中的符号 → 槽位映射（主要用于内置函数）
        if let Some(bindings_by_id) = self.bindings_by_id.get_mut(0) {
            bindings_by_id.clear();
            if let Some(frame0) = self.frames.get_mut(0) {
                frame0.id_to_slot.clear();
                if let Some(name_map) = frame0.name_to_slot.as_ref() {
                    let entries: Vec<(String, usize)> = name_map
                        .iter()
                        .map(|(name, &slot)| (name.clone(), slot))
                        .collect();
                    for (name, slot) in entries {
                        if let Some(id) = self.symbol_lookup.get(&name) {
                            bindings_by_id.insert(
                                *id,
                                ScopeRef {
                                    scope_index: 0,
                                    slot,
                                },
                            );
                            frame0.id_to_slot.insert(*id, slot);
                        }
                    }
                }
            }
        }

        self.functions.clear();
        self.functions_by_id.clear();

        for stmt in &script.statements {
            match stmt {
                Statement::FunctionDef { name, params, body } => {
                    self.functions.insert(
                        name.clone(),
                        FunctionDef {
                            param_plan: params
                                .iter()
                                .map(|param| ParamPlan {
                                    name: param.name.clone(),
                                    id: param.id,
                                    kind: param.kind.clone(),
                                })
                                .collect(),
                            body: Arc::from(body.clone()),
                        },
                    );
                    if let Some(id) = self.symbol_lookup.get(name) {
                        self.functions_by_id.insert(
                            *id,
                            FunctionDef {
                                param_plan: params
                                    .iter()
                                    .map(|param| ParamPlan {
                                        name: param.name.clone(),
                                        id: param.id,
                                        kind: param.kind.clone(),
                                    })
                                    .collect(),
                                body: Arc::from(body.clone()),
                            },
                        );
                    }
                }
                Statement::VarDecl { name, value } => {
                    let evaluated = if let Some(expr) = value {
                        self.evaluate_expression(expr)?
                    } else {
                        Value::Number(0.0)
                    };
                    self.declare_variable(name, evaluated);
                }
                Statement::VarDeclId { name, value } => {
                    let evaluated = if let Some(expr) = value {
                        self.evaluate_expression(expr)?
                    } else {
                        Value::Number(0.0)
                    };
                    self.declare_variable_by_id(*name, evaluated);
                }
                Statement::Assign { name, value } => {
                    let evaluated = self.evaluate_expression(value)?;
                    self.assign_variable(name, &evaluated)?;
                }
                Statement::Series { name } => {
                    self.declare_variable(name, Value::Series(SeriesData::new()));
                }
                Statement::SeriesId { name } => {
                    self.declare_variable_by_id(*name, Value::Series(SeriesData::new()));
                }
                Statement::ArrayDecl { name, size } => {
                    self.declare_variable(name, Value::Array(vec![0.0; *size]));
                }
                Statement::ArrayDeclId { name, size } => {
                    self.declare_variable_by_id(*name, Value::Array(vec![0.0; *size]));
                }
                _ => {
                    // 忽略其他类型的语句，因为我们只解析函数定义和全局变量
                    // ——真正的执行发生在事件阶段。
                }
            }
        }
        Ok(())
    }

    /// 初始化策略
    pub fn initialize(&mut self) -> Result<(), CompileError> {
        // 执行OnInit函数（如果存在）
        if let Some(on_init_func) = self.functions.get("OnInit") {
            // `body` 现在挂在 `Arc` 上，clone 只增加引用计数，避免频繁复制大块语句。
            let body = on_init_func.body.clone();
            for stmt in body.iter() {
                if let Some(_) = self.execute_statement(stmt)? {
                    break;
                }
            }
        }
        Ok(())
    }

    /// 处理Tick事件
    pub fn on_tick(&mut self, tick: crate::Tick) -> Result<(), CompileError> {
        // 设置当前Tick
        self.market_data_context.set_tick(tick);

        // 执行OnTick函数（如果存在）
        if let Some(on_tick_func) = self.functions.get("OnTick") {
            let body = on_tick_func.body.clone();
            for stmt in body.iter() {
                if let Some(_) = self.execute_statement(stmt)? {
                    break;
                }
            }
        }
        Ok(())
    }

    /// 处理Bar事件
    pub fn on_bar(&mut self, bar: crate::Bar) -> Result<(), CompileError> {
        // 添加Bar数据到数据上下文
        self.market_data_context.add_bar(bar, self.max_bars);

        // 执行OnBar函数（如果存在）
        if let Some(on_bar_func) = self.functions.get("OnBar") {
            let body = on_bar_func.body.clone();
            for stmt in body.iter() {
                if let Some(_) = self.execute_statement(stmt)? {
                    break;
                }
            }
        }
        Ok(())
    }

    /// 执行语句，返回可选的早退值
    fn execute_statement(&mut self, stmt: &Statement) -> Result<Option<Value>, CompileError> {
        match stmt {
            Statement::If {
                condition,
                then_block,
                else_block,
            } => {
                let cond_value = self.evaluate_expression(condition)?;
                let cond_bool = self.to_boolean(&cond_value)?;

                if cond_bool {
                    for s in then_block {
                        if let Some(ret) = self.execute_statement(s)? {
                            return Ok(Some(ret));
                        }
                    }
                } else if let Some(else_block) = else_block {
                    for s in else_block {
                        if let Some(ret) = self.execute_statement(s)? {
                            return Ok(Some(ret));
                        }
                    }
                }
                Ok(None)
            }
            Statement::For {
                start,
                end,
                step,
                body,
                var,
            } => {
                let mut target_ref = self.resolve_binding(var);
                let original_var_value = target_ref
                    .as_ref()
                    .and_then(|scope_ref| self.read_scope_ref(scope_ref).cloned());
                let created_here = target_ref.is_none();

                let start_value = self.evaluate_expression(start)?;
                let start_num = self.to_number(&start_value)?;
                if let Some(scope_ref) = target_ref.clone() {
                    self.write_scope_ref(scope_ref, Value::Number(start_num));
                } else {
                    self.declare_variable(var, Value::Number(start_num));
                    target_ref = self.resolve_binding(var);
                }

                let mut step_plan = None;
                if let Some(step_expr) = step {
                    if let Some(ref scope_ref) = target_ref {
                        step_plan = self.compile_loop_step(var, step_expr, scope_ref);
                    }
                }

                let mut early_return = None;
                loop {
                    let condition_value = self.evaluate_expression(end)?;
                    if !self.to_boolean(&condition_value)? {
                        break;
                    }

                    for s in body {
                        if let Some(ret) = self.execute_statement(s)? {
                            early_return = Some(ret);
                            break;
                        }
                    }

                    if early_return.is_some() {
                        break;
                    }

                    if let Some(plan) = step_plan.as_ref() {
                        self.execute_loop_step(plan)?;
                    } else if let Some(step_expr) = step {
                        // `_assign` 语义在语法阶段被注入：该调用负责执行自增/自减等
                        // 操作并返回新值。我们仅需求值即可，逻辑由 `_assign` 完成。
                        self.evaluate_expression(step_expr)?;
                    } else if let Some(scope_ref) = target_ref.as_ref() {
                        let current_value = match self.read_scope_ref(scope_ref) {
                            Some(Value::Number(n)) => *n,
                            Some(_) => {
                                return Err(error::runtime_error(&format!(
                                    "循环变量 {} 必须是数值类型",
                                    var
                                )));
                            }
                            None => break,
                        };
                        self.write_scope_ref(scope_ref.clone(), Value::Number(current_value + 1.0));
                    }
                }

                if created_here {
                    self.remove_current_scope_variable(var);
                } else if let Some(scope_ref) = target_ref {
                    if let Some(value) = original_var_value {
                        self.write_scope_ref(scope_ref, value);
                    }
                }

                Ok(early_return)
            }
            Statement::ForId {
                start,
                end,
                step,
                body,
                var,
            } => {
                let mut target_ref = self.resolve_binding_by_id(*var);
                let original_var_value = target_ref
                    .as_ref()
                    .and_then(|scope_ref| self.read_scope_ref(scope_ref).cloned());
                let created_here = target_ref.is_none();

                let start_value = self.evaluate_expression(start)?;
                let start_num = self.to_number(&start_value)?;
                if let Some(scope_ref) = target_ref.clone() {
                    self.write_scope_ref(scope_ref, Value::Number(start_num));
                } else {
                    self.declare_variable_by_id(*var, Value::Number(start_num));
                    target_ref = self.resolve_binding_by_id(*var);
                }

                let mut step_plan = None;
                if let Some(step_expr) = step {
                    if let Some(ref scope_ref) = target_ref {
                        step_plan = self.compile_loop_step_id(*var, step_expr, scope_ref);
                    }
                }

                let mut early_return = None;
                loop {
                    let condition_value = self.evaluate_expression(end)?;
                    if !self.to_boolean(&condition_value)? {
                        break;
                    }

                    for s in body {
                        if let Some(ret) = self.execute_statement(s)? {
                            early_return = Some(ret);
                            break;
                        }
                    }

                    if early_return.is_some() {
                        break;
                    }

                    if let Some(plan) = step_plan.as_ref() {
                        self.execute_loop_step(plan)?;
                    } else if let Some(step_expr) = step {
                        self.evaluate_expression(step_expr)?;
                    } else if let Some(scope_ref) = target_ref.as_ref() {
                        let current_value = match self.read_scope_ref(scope_ref) {
                            Some(Value::Number(n)) => *n,
                            Some(_) => {
                                let name = self.symbol_name_ref(*var).unwrap_or("<loop-var>");
                                return Err(error::runtime_error(&format!(
                                    "循环变量 {} 必须是数值类型",
                                    name
                                )));
                            }
                            None => break,
                        };
                        self.write_scope_ref(scope_ref.clone(), Value::Number(current_value + 1.0));
                    }
                }

                if created_here {
                    self.remove_current_scope_variable_by_id(*var);
                } else if let Some(scope_ref) = target_ref {
                    if let Some(value) = original_var_value {
                        self.write_scope_ref(scope_ref, value);
                    }
                }

                Ok(early_return)
            }
            Statement::AssignId { name, value } => {
                let val = self.evaluate_expression(value)?;
                // 优先 ID 赋值，失败再回退到字符串
                if let Some(_) = self.symbol_table {
                    if self.assign_variable_by_id(*name, &val).is_ok() {
                        return Ok(None);
                    }
                }
                if let Some(table) = &self.symbol_table {
                    let var_name = table.get(*name).to_string();
                    self.assign_variable(&var_name, &val)?;
                    return Ok(None);
                }
                Err(error::runtime_error(
                    "Symbol table not available for AssignId",
                ))
            }
            Statement::FunctionDef { .. } => Ok(None),
            Statement::ExprStmt(expr) => {
                self.evaluate_expression(expr)?;
                Ok(None)
            }
            Statement::VarDecl { name, value } => {
                let val = if let Some(expr) = value {
                    self.evaluate_expression(expr)?
                } else {
                    Value::Number(0.0)
                };
                self.declare_variable(name, val);
                Ok(None)
            }
            Statement::VarDeclId { name, value } => {
                let val = if let Some(expr) = value {
                    self.evaluate_expression(expr)?
                } else {
                    Value::Number(0.0)
                };
                self.declare_variable_by_id(*name, val);
                Ok(None)
            }
            Statement::ArrayDecl { name, size } => {
                self.declare_variable(name, Value::Array(vec![0.0; *size]));
                Ok(None)
            }
            Statement::ArrayDeclId { name, size } => {
                self.declare_variable_by_id(*name, Value::Array(vec![0.0; *size]));
                Ok(None)
            }
            Statement::ArrayAssign { name, index, value } => {
                let target = self
                    .resolve_binding(name)
                    .ok_or_else(|| error::runtime_error(&format!("数组 {} 未定义", name)))?;
                let idx_value = self.evaluate_expression(index)?;
                let idx = self.to_number(&idx_value)?;
                if idx < 0.0 {
                    return Err(error::runtime_error("数组索引必须为非负整数"));
                }
                let idx_usize = idx as usize;
                if (idx - idx_usize as f64).abs() > f64::EPSILON {
                    return Err(error::runtime_error("数组索引必须为整数"));
                }

                let value_expr = self.evaluate_expression(value)?;
                let val = self.to_number(&value_expr)?;

                match self
                    .get_variable_value_mut(&target)
                    .ok_or_else(|| error::runtime_error(&format!("数组 {} 不可写", name)))?
                {
                    Value::Array(arr) => {
                        if idx_usize >= arr.len() {
                            return Err(error::runtime_error(&format!(
                                "数组 {} 下标 {} 越界",
                                name, idx_usize
                            )));
                        }
                        arr[idx_usize] = val;
                        Ok(None)
                    }
                    _ => Err(error::runtime_error(&format!("变量 {} 不是数组", name))),
                }
            }
            Statement::Assign { name, value } => {
                let val = self.evaluate_expression(value)?;
                self.assign_variable(name, &val)?;
                Ok(None)
            }
            Statement::TradeCommand { cmd, params } => {
                let mut param_values = Vec::new();
                for param in params {
                    param_values.push(self.evaluate_expression(param)?);
                }

                let price = if param_values.is_empty() {
                    self.get_current_price()?
                } else {
                    self.to_number(&param_values[0])?
                };
                let volume = if param_values.len() < 2 {
                    1.0
                } else {
                    self.to_number(&param_values[1])?
                };

                let order_cmd: crate::OrderCmd = match cmd.as_str() {
                    "Buy" => crate::OrderCmd::Buy,
                    "Sell" => crate::OrderCmd::Sell,
                    "BuyCover" => crate::OrderCmd::BuyCover,
                    "SellCover" => crate::OrderCmd::SellCover,
                    "ExitLong" => crate::OrderCmd::ExitLong,
                    "ExitShort" => crate::OrderCmd::ExitShort,
                    _ => return Err(error::runtime_error(&format!("未知的交易指令: {}", cmd))),
                };

                self.trading_executor
                    .execute_order(order_cmd, price, volume);
                Ok(None)
            }
            Statement::Return(expr) => {
                let value = if let Some(expr) = expr {
                    self.evaluate_expression(expr)?
                } else {
                    Value::Number(0.0)
                };
                Ok(Some(value))
            }
            Statement::Series { name } => {
                self.declare_variable(name, Value::Series(SeriesData::new()));
                Ok(None)
            }
            Statement::SeriesId { name } => {
                self.declare_variable_by_id(*name, Value::Series(SeriesData::new()));
                Ok(None)
            }
        }
    }

    /// 计算表达式的值
    fn evaluate_expression(&mut self, expr: &Expr) -> Result<Value, CompileError> {
        match expr {
            Expr::Number(n) => Ok(Value::Number(*n)),
            Expr::StringLiteral(s) => Ok(Value::String(s.clone())),
            Expr::Boolean(b) => Ok(Value::Boolean(*b)),
            Expr::VariableId(id) => {
                if let Some(val) = self.get_variable_value_by_id(*id) {
                    return Ok(val.clone());
                }
                // 回退：通过名字查找
                if let Some(table) = &self.symbol_table {
                    let name = table.get(*id);
                    if let Some(value) = self.get_variable_value(name) {
                        return Ok(value.clone());
                    }
                    Err(error::runtime_error(&format!("未定义的变量: {}", name)))
                } else {
                    Err(error::runtime_error(
                        "Symbol table not available for VariableId",
                    ))
                }
            }
            Expr::Variable(name) => {
                if name == "true" {
                    Ok(Value::Boolean(true))
                } else if name == "false" {
                    Ok(Value::Boolean(false))
                } else if let Some(value) = self.get_variable_value(name) {
                    Ok(value.clone())
                } else {
                    Err(error::runtime_error(&format!("未定义的变量: {}", name)))
                }
            }
            Expr::BinaryOp { left, right, op } => match op {
                Op::LogicalAnd => {
                    // 手动实现短路逻辑，仿照绝大多数语言的 `&&` 行为。
                    let left_val = self.evaluate_expression(left)?;
                    let left_bool = self.to_boolean(&left_val)?;
                    if !left_bool {
                        Ok(Value::Boolean(false))
                    } else {
                        let right_val = self.evaluate_expression(right)?;
                        Ok(Value::Boolean(self.to_boolean(&right_val)?))
                    }
                }
                Op::LogicalOr => {
                    // 与 `&&` 对称：左侧为真时直接返回，避免多余副作用。
                    let left_val = self.evaluate_expression(left)?;
                    let left_bool = self.to_boolean(&left_val)?;
                    if left_bool {
                        Ok(Value::Boolean(true))
                    } else {
                        let right_val = self.evaluate_expression(right)?;
                        Ok(Value::Boolean(self.to_boolean(&right_val)?))
                    }
                }
                _ => {
                    let left_val = self.evaluate_expression(left)?;
                    let right_val = self.evaluate_expression(right)?;
                    self.evaluate_binary_op(&left_val, &right_val, op)
                }
            },
            Expr::UnaryOp { op, operand } => {
                let value = self.evaluate_expression(operand)?;
                match op {
                    Op::Not => Ok(Value::Boolean(!self.to_boolean(&value)?)),
                    Op::Negate => Ok(Value::Number(-self.to_number(&value)?)),
                    _ => Err(error::runtime_error("不支持的一元操作符")),
                }
            }
            Expr::CallId { name, args } => self.call_by_symbol_id(*name, args),
            Expr::IndexAccess { target, index } => self.handle_index_access(target, index.as_ref()),
            Expr::MethodCall {
                target,
                method,
                args,
            } => self.handle_method_call(target, method, args),
            Expr::PropertyAccess { target, property } => {
                self.handle_property_access(target, property)
            }
            Expr::AssignIntrinsic { target, value } => {
                let evaluated = self.evaluate_expression(value)?;
                self.assign_variable(target, &evaluated)?;
                Ok(evaluated)
            }
            Expr::AssignIntrinsicId { target, value } => {
                let evaluated = self.evaluate_expression(value)?;
                self.assign_variable_by_id(*target, &evaluated)?;
                Ok(evaluated)
            }
            Expr::Call { name, args } => {
                // 解析器预先把若干语法糖翻译成以 `_` 开头的内部函数调用。
                // 在这里优先拦截它们，走专门的运行期实现。
                match name.as_str() {
                    "_index_access" => {
                        if args.len() == 2 {
                            if let Expr::StringLiteral(target_name) = &args[0] {
                                return self.handle_index_access(target_name, &args[1]);
                            }
                        }
                        return Err(error::runtime_error("_index_access 参数不合法"));
                    }
                    "_method_call" => {
                        if args.len() >= 2 {
                            if let Expr::StringLiteral(target_name) = &args[0] {
                                if let Expr::StringLiteral(method_name) = &args[1] {
                                    return self.handle_method_call(
                                        target_name,
                                        method_name,
                                        &args[2..],
                                    );
                                }
                            }
                        }
                        return Err(error::runtime_error("_method_call 参数不合法"));
                    }
                    "_property_access" => {
                        if args.len() == 2 {
                            if let Expr::StringLiteral(target_name) = &args[0] {
                                if let Expr::StringLiteral(property_name) = &args[1] {
                                    return self.handle_property_access(target_name, property_name);
                                }
                            }
                        }
                        return Err(error::runtime_error("_property_access 参数不合法"));
                    }
                    "_assign" => {
                        return self.handle_assign(args);
                    }
                    _ => {}
                }

                if let Some(id) = self.symbol_id_for(name) {
                    return self.call_by_symbol_id(id, args);
                }

                // Legacy fallback：保留字符串路径以兼容未编号的符号
                let arg_values = self.evaluate_call_arguments(args)?;

                // 检查是否是内置函数
                if let Some(builtin) = self.get_variable_value(name).and_then(|val| {
                    if let Value::Builtin(b) = val {
                        Some(*b)
                    } else {
                        None
                    }
                }) {
                    return self.call_builtin(builtin, &arg_values);
                }

                // 然后再获取函数体
                if let Some(function) = self.functions.get(name).cloned() {
                    // `FunctionDef` 实现了 `Clone`，只需 bump `Arc` 引用计数即可复用函数体。
                    return self.call_user_defined_function(name, &function, args, &arg_values);
                }

                Err(error::runtime_error(&format!("未定义的函数: {}", name)))
            }
            Expr::Indicator(indidx) => {
                // 获取指标值
                self.get_indicator_value(indidx.to_string().as_str(), *indidx)
            },
            Expr::Data(data_symbol) => {
                // 将BarDataType转换为对应的IndicatorIdx
                let indidx = match data_symbol.data_type {
                    crate::ast::BarDataType::Close => IndicatorIdx::Close,
                    crate::ast::BarDataType::Open => IndicatorIdx::Open,
                    crate::ast::BarDataType::High => IndicatorIdx::High,
                    crate::ast::BarDataType::Low => IndicatorIdx::Low,
                    crate::ast::BarDataType::Volume => IndicatorIdx::Volume,
                };
                
                // 获取指定索引的指标值
                let name = indidx.as_str();
                self.get_indicator_value_at(name, indidx, data_symbol.data_idx)
            }
        }
    }

    /// 计算二元操作的值
    fn evaluate_binary_op(
        &self,
        left: &Value,
        right: &Value,
        op: &Op,
    ) -> Result<Value, CompileError> {
        match op {
            // 算术运算符
            Op::Add => match (left, right) {
                // 同时支持数值相加与字符串拼接，贴近脚本语言惯例。
                (Value::Number(l), Value::Number(r)) => Ok(Value::Number(l + r)),
                (Value::String(l), Value::String(r)) => Ok(Value::String(l.to_string() + r)),
                _ => Err(error::runtime_error("无法执行加法操作")),
            },
            Op::Subtract => match (left, right) {
                (Value::Number(l), Value::Number(r)) => Ok(Value::Number(l - r)),
                _ => Err(error::runtime_error("无法执行减法操作")),
            },
            Op::Multiply => match (left, right) {
                (Value::Number(l), Value::Number(r)) => Ok(Value::Number(l * r)),
                _ => Err(error::runtime_error("无法执行乘法操作")),
            },
            Op::Divide => match (left, right) {
                (Value::Number(l), Value::Number(r)) => {
                    if *r == 0.0 {
                        Err(error::runtime_error("除零错误"))
                    } else {
                        Ok(Value::Number(l / r))
                    }
                }
                _ => Err(error::runtime_error("无法执行除法操作")),
            },
            // 比较运算符
            Op::Equals => Ok(Value::Boolean(left == right)),
            Op::NotEquals => Ok(Value::Boolean(left != right)),
            Op::LessThan => match (left, right) {
                (Value::Number(l), Value::Number(r)) => Ok(Value::Boolean(l < r)),
                _ => Err(error::runtime_error("无法执行小于比较")),
            },
            Op::GreaterThan => match (left, right) {
                (Value::Number(l), Value::Number(r)) => Ok(Value::Boolean(l > r)),
                _ => Err(error::runtime_error("无法执行大于比较")),
            },
            Op::LessThanOrEqual => match (left, right) {
                (Value::Number(l), Value::Number(r)) => Ok(Value::Boolean(l <= r)),
                _ => Err(error::runtime_error("无法执行小于等于比较")),
            },
            Op::GreaterThanOrEqual => match (left, right) {
                (Value::Number(l), Value::Number(r)) => Ok(Value::Boolean(l >= r)),
                _ => Err(error::runtime_error("无法执行大于等于比较")),
            },
            Op::LogicalAnd => Ok(Value::Boolean(
                self.to_boolean(left)? && self.to_boolean(right)?,
            )),
            Op::LogicalOr => Ok(Value::Boolean(
                self.to_boolean(left)? || self.to_boolean(right)?,
            )),
            Op::Not => match (left, right) {
                (Value::Boolean(l), Value::Boolean(r)) => Ok(Value::Boolean(!(l == r))),
                _ => Err(error::runtime_error("无法执行不等于比较")),
            },
            Op::Negate => Err(error::runtime_error("一元负号不应作为二元操作")),
        }
    }

    /// 调用内置函数
    fn call_builtin(
        &mut self,
        builtin: BuiltinFunction,
        args: &[Value],
    ) -> Result<Value, CompileError> {
        use BuiltinFunction::*;
        match builtin {
            Print => {
                for arg in args {
                    match arg {
                        Value::Number(n) => print!("{}", n),
                        Value::String(s) => print!("{}", s),
                        Value::Boolean(b) => print!("{}", b),
                        Value::Series(_) => print!("[Series]"),
                        Value::Array(_) => print!("[Array]"),
                        Value::Builtin(_) => print!("[Function]"),
                    }
                }
                println!();
                Ok(Value::Number(0.0))
            }
            Length => {
                if args.is_empty() {
                    return Err(error::runtime_error("length函数需要1个参数"));
                }

                match &args[0] {
                    Value::Series(series) => Ok(Value::Number(series.len() as f64)),
                    Value::String(s) => Ok(Value::Number(s.len() as f64)),
                    Value::Array(arr) => Ok(Value::Number(arr.len() as f64)),
                    _ => Err(error::runtime_error(
                        "length函数的参数必须是序列、字符串或数组",
                    )),
                }
            }
            Ma => {
                let period = if args.is_empty() {
                    20
                } else {
                    expect_positive_integer(self.to_number(&args[0])?, "MA 周期")?
                };
                let closes = self.market_data_context.closes();
                Ok(Value::Number(moving_average(closes, period)))
            }
            Ema => {
                let period = if args.is_empty() {
                    20
                } else {
                    expect_positive_integer(self.to_number(&args[0])?, "EMA 周期")?
                };
                let closes = self.market_data_context.closes();
                Ok(Value::Number(exponential_moving_average(closes, period)))
            }
            Rsi => {
                let period = if args.is_empty() {
                    14
                } else {
                    expect_positive_integer(self.to_number(&args[0])?, "RSI 周期")?
                };
                let closes = self.market_data_context.closes();
                Ok(Value::Number(relative_strength_index(closes, period)))
            }
            Atr => {
                let period = if args.is_empty() {
                    14
                } else {
                    expect_positive_integer(self.to_number(&args[0])?, "ATR 周期")?
                };
                Ok(Value::Number(average_true_range(
                    self.market_data_context.get_bars(IndicatorIdx::Close),
                    self.market_data_context.get_bars(IndicatorIdx::Open),
                    self.market_data_context.get_bars(IndicatorIdx::High),
                    self.market_data_context.get_bars(IndicatorIdx::Low),
                    period,
                )))
            }
            Macd => {
                let (fast, slow, signal) = match args.len() {
                    0 => (12, 26, 9),
                    1 => (
                        expect_positive_integer(self.to_number(&args[0])?, "MACD 快速周期")?,
                        26,
                        9,
                    ),
                    2 => (
                        expect_positive_integer(self.to_number(&args[0])?, "MACD 快速周期")?,
                        expect_positive_integer(self.to_number(&args[1])?, "MACD 慢速周期")?,
                        9,
                    ),
                    _ => (
                        expect_positive_integer(self.to_number(&args[0])?, "MACD 快速周期")?,
                        expect_positive_integer(self.to_number(&args[1])?, "MACD 慢速周期")?,
                        expect_positive_integer(self.to_number(&args[2])?, "MACD 信号周期")?,
                    ),
                };

                let closes = self.market_data_context.closes();
                Ok(Value::Number(macd_value(closes, fast, slow, signal)))
            }
            Buy | Sell | BuyCover | SellCover | ExitLong | ExitShort => {
                let price = if args.is_empty() {
                    self.get_current_price()?
                } else {
                    self.to_number(&args[0])?
                };
                let volume = if args.len() < 2 {
                    1.0
                } else {
                    self.to_number(&args[1])?
                };

                let cmd: crate::OrderCmd = match builtin {
                    Buy => crate::OrderCmd::Buy,
                    Sell => crate::OrderCmd::Sell,
                    BuyCover => crate::OrderCmd::BuyCover,
                    SellCover => crate::OrderCmd::SellCover,
                    ExitLong => crate::OrderCmd::ExitLong,
                    ExitShort => crate::OrderCmd::ExitShort,
                    _ => unreachable!(),
                };

                self.trading_executor.execute_order(cmd, price, volume);
                Ok(Value::Number(1.0))
            }
            Plot => {
                if args.is_empty() {
                    return Err(error::runtime_error("Plot函数至少需要一个参数"));
                }
                for arg in args {
                    match arg {
                        Value::Number(n) => print!("{} ", n),
                        Value::String(s) => print!("{} ", s),
                        Value::Boolean(b) => print!("{} ", b),
                        Value::Series(_) => print!("[Series] "),
                        Value::Array(_) => print!("[Array] "),
                        Value::Builtin(_) => print!("[Function] "),
                    }
                }
                println!();
                Ok(Value::Number(0.0))
            }
            Abs => {
                if args.len() != 1 {
                    return Err(error::runtime_error("Abs函数需要1个参数"));
                }
                Ok(Value::Number(self.to_number(&args[0])?.abs()))
            }
            Max => {
                if args.len() != 2 {
                    return Err(error::runtime_error("Max函数需要2个参数"));
                }
                Ok(Value::Number(
                    self.to_number(&args[0])?.max(self.to_number(&args[1])?),
                ))
            }
            Min => {
                if args.len() != 2 {
                    return Err(error::runtime_error("Min函数需要2个参数"));
                }
                Ok(Value::Number(
                    self.to_number(&args[0])?.min(self.to_number(&args[1])?),
                ))
            }
            Sqrt => {
                if args.len() != 1 {
                    return Err(error::runtime_error("Sqrt函数需要1个参数"));
                }
                Ok(Value::Number(self.to_number(&args[0])?.sqrt()))
            }
            Log => {
                if args.len() != 1 {
                    return Err(error::runtime_error("Log函数需要1个参数"));
                }
                Ok(Value::Number(self.to_number(&args[0])?.ln()))
            }
            Exp => {
                if args.len() != 1 {
                    return Err(error::runtime_error("Exp函数需要1个参数"));
                }
                Ok(Value::Number(self.to_number(&args[0])?.exp()))
            }
            Sin => {
                if args.len() != 1 {
                    return Err(error::runtime_error("Sin函数需要1个参数"));
                }
                Ok(Value::Number(self.to_number(&args[0])?.sin()))
            }
            Cos => {
                if args.len() != 1 {
                    return Err(error::runtime_error("Cos函数需要1个参数"));
                }
                Ok(Value::Number(self.to_number(&args[0])?.cos()))
            }
            Tan => {
                if args.len() != 1 {
                    return Err(error::runtime_error("Tan函数需要1个参数"));
                }
                Ok(Value::Number(self.to_number(&args[0])?.tan()))
            }
        }
    }

    /// 调用用户定义的函数
    fn call_user_defined_function(
        &mut self,
        name: &str,
        function: &FunctionDef,
        arg_exprs: &[Expr],
        args: &[Value],
    ) -> Result<Value, CompileError> {
        if args.len() != function.param_plan.len() {
            return Err(error::runtime_error(&format!(
                "函数 {} 参数个数不匹配，期望 {} 个，实际 {} 个",
                name,
                function.param_plan.len(),
                args.len()
            )));
        }

        self.push_scope();

        // 内联闭包充当 try-finally：确保 `pop_scope` 在后面执行。
        let result = (|| -> Result<Value, CompileError> {
            for ((plan, expr), arg_value) in function
                .param_plan
                .iter()
                .zip(arg_exprs.iter())
                .zip(args.iter())
            {
                let param_id = plan
                    .id
                    .or_else(|| self.symbol_lookup.get(&plan.name).copied());
                match plan.kind {
                    ParamKind::VarByValue => {
                        if let Some(id) = param_id {
                            self.declare_variable_by_id(id, arg_value.clone());
                        } else {
                            self.declare_variable(&plan.name, arg_value.clone());
                        }
                    }
                    ParamKind::VarByRef => {
                        let target = self.extract_reference_target(expr, "var")?;
                        let resolved = if let Some(id) = target.id {
                            self.resolve_binding_by_id(id)
                        } else {
                            self.resolve_binding(&target.name)
                        }
                        .ok_or_else(|| {
                            error::runtime_error(&format!(
                                "变量 {} 未定义，无法按引用传递",
                                target.name
                            ))
                        })?;
                        if self.read_scope_ref(&resolved).is_none() {
                            return Err(error::runtime_error(&format!(
                                "变量 {} 未定义，无法按引用传递",
                                target.name
                            )));
                        }
                        self.set_reference_param(plan, resolved);
                    }
                    ParamKind::SeriesByRef => {
                        let target = self.extract_reference_target(expr, "series")?;
                        let resolved = if let Some(id) = target.id {
                            self.resolve_binding_by_id(id)
                        } else {
                            self.resolve_binding(&target.name)
                        }
                        .ok_or_else(|| {
                            error::runtime_error(&format!(
                                "变量 {} 未定义，无法按引用传递",
                                target.name
                            ))
                        })?;
                        match self.read_scope_ref(&resolved) {
                            Some(Value::Series(_)) => self.set_reference_param(plan, resolved),
                            _ => {
                                return Err(error::runtime_error(&format!(
                                    "参数 {} 需要 series 类型",
                                    target.name
                                )));
                            }
                        }
                    }
                }
            }

            let mut return_value = None;
            for stmt in function.body.iter() {
                if let Some(value) = self.execute_statement(stmt)? {
                    return_value = Some(value);
                    break;
                }
            }

            Ok(return_value.unwrap_or(Value::Number(0.0)))
        })();

        self.pop_scope();
        result
    }

    /// 获取指标值
    fn get_indicator_value(&self, name: &str, indidx: IndicatorIdx) -> Result<Value, CompileError> {
        self.get_indicator_value_at(name, indidx, 0)
    }

    fn get_indicator_value_at(
        &self,
        name: &str,
        indidx: IndicatorIdx,
        index: usize,
    ) -> Result<Value, CompileError> {
        if let Some(v) = self
            .market_data_context
            .get_bars(indidx)
            .iter()
            .rev()
            .nth(index)
        {
            match name {
                "Open" => Ok(Value::Number(*v)),
                "High" => Ok(Value::Number(*v)),
                "Low" => Ok(Value::Number(*v)),
                "Close" => Ok(Value::Number(*v)),
                "Volume" => Ok(Value::Number(*v)),
                _ => Err(error::runtime_error(&format!("未知的指标: {}", name))),
            }
        } else if index == 0 {
            Err(error::runtime_error("没有可用的Bar数据"))
        } else {
            Err(error::runtime_error(&format!(
                "历史K线数据不足，无法获取 {}[{}]",
                name, index
            )))
        }
    }

    /// 获取当前价格
    fn get_current_price(&self) -> Result<f64, CompileError> {
        // 优先获取Tick价格
        if let Some(tick) = self.market_data_context.get_current_tick() {
            Ok(tick.price)
        } else if let Some(closev) = self
            .market_data_context
            .get_bars(IndicatorIdx::Close)
            .last()
        {
            // 如果没有Tick数据，使用最新的Bar收盘价
            Ok(*closev)
        } else {
            Err(error::runtime_error("没有可用的价格数据"))
        }
    }

    /// 将值转换为数字
    fn to_number(&self, value: &Value) -> Result<f64, CompileError> {
        match value {
            Value::Number(n) => Ok(*n),
            Value::String(s) => s
                .parse()
                .map_err(|_| error::runtime_error("无法转换为数字")),
            Value::Boolean(b) => Ok(if *b { 1.0 } else { 0.0 }),
            _ => Err(error::runtime_error("无法转换为数字")),
        }
    }

    /// 将值转换为布尔值
    fn to_boolean(&self, value: &Value) -> Result<bool, CompileError> {
        match value {
            Value::Boolean(b) => Ok(*b),
            Value::Number(n) => Ok(*n != 0.0),
            Value::String(s) => Ok(!s.is_empty()),
            Value::Series(series) => Ok(!series.is_empty()),
            Value::Array(arr) => Ok(!arr.is_empty()),
            _ => Err(error::runtime_error("无法转换为布尔值")),
        }
    }

    fn handle_index_access(
        &mut self,
        target_name: &str,
        index_expr: &Expr,
    ) -> Result<Value, CompileError> {
        let index_value = self.evaluate_expression(index_expr)?;
        let index_num = self.to_number(&index_value)?;

        if index_num < 0.0 {
            return Err(error::runtime_error("索引必须为非负整数"));
        }

        let index_usize = index_num as usize;
        if (index_num - index_usize as f64).abs() > f64::EPSILON {
            return Err(error::runtime_error("索引必须为整数"));
        }

        if let Some(value) = self.get_variable_value(target_name) {
            match value {
                Value::Series(series) => {
                    if series.is_empty() {
                        return Err(error::runtime_error(&format!("序列 {} 为空", target_name)));
                    }
                    if index_usize >= series.len() {
                        return Err(error::runtime_error(&format!(
                            "序列 {} 没有索引 {} 对应的数据",
                            target_name, index_usize
                        )));
                    }
                    let data = &series.data;
                    let pos = data.len() - 1 - index_usize;
                    Ok(Value::Number(data[pos]))
                }
                Value::Array(array) => {
                    if index_usize >= array.len() {
                        return Err(error::runtime_error(&format!(
                            "数组 {} 没有索引 {} 对应的数据",
                            target_name, index_usize
                        )));
                    }
                    Ok(Value::Number(array[index_usize]))
                }
                _ => Err(error::runtime_error(&format!(
                    "变量 {} 不支持索引访问",
                    target_name
                ))),
            }
        } else {
            self.get_indicator_value_at(
                target_name,
                IndicatorIdx::from_str(target_name).unwrap(),
                index_usize,
            )
        }
    }

    fn handle_method_call(
        &mut self,
        target_name: &str,
        method_name: &str,
        args: &[Expr],
    ) -> Result<Value, CompileError> {
        let mut evaluated_args = Vec::new();
        for expr in args {
            evaluated_args.push(self.evaluate_expression(expr)?);
        }

        let target_value = self
            .get_variable_value(target_name)
            .cloned()
            .ok_or_else(|| error::runtime_error(&format!("未找到对象 {}", target_name)))?;

        let mut call_args = Vec::with_capacity(1 + evaluated_args.len());
        call_args.push(target_value);
        call_args.extend(evaluated_args);

        let builtin = self
            .get_variable_value(method_name)
            .and_then(|value| match value {
                Value::Builtin(b) => Some(*b),
                _ => None,
            });

        if let Some(builtin) = builtin {
            return self.call_builtin(builtin, &call_args);
        }

        Err(error::runtime_error(&format!(
            "未实现的方法: {}",
            method_name
        )))
    }

    fn handle_property_access(
        &mut self,
        target_name: &str,
        property_name: &str,
    ) -> Result<Value, CompileError> {
        self.handle_method_call(target_name, property_name, &[])
    }

    fn handle_assign(&mut self, args: &[Expr]) -> Result<Value, CompileError> {
        if args.len() != 2 {
            return Err(error::runtime_error("_assign 需要两个参数"));
        }

        // `_assign` 作为 for 循环步进等语法糖的统一出口，第一参数永远是变量名。
        let target_name = match &args[0] {
            Expr::StringLiteral(name) => name.clone(),
            _ => return Err(error::runtime_error("_assign 的第一个参数必须是字符串")),
        };

        if self.resolve_binding(&target_name).is_none() {
            return Err(error::runtime_error(&format!(
                "变量 {} 未定义，无法赋值",
                target_name
            )));
        }

        let value = self.evaluate_expression(&args[1])?;
        self.assign_variable(&target_name, &value)?;
        Ok(value)
    }
}

fn expect_positive_integer(value: f64, name: &str) -> Result<usize, error::CompileError> {
    if value <= 0.0 {
        return Err(error::runtime_error(&format!("{} 必须大于 0", name)));
    }
    let rounded = value.round();
    if (value - rounded).abs() > f64::EPSILON {
        return Err(error::runtime_error(&format!("{} 必须是整数", name)));
    }
    Ok(rounded as usize)
}

fn moving_average(closes: &[f64], period: usize) -> f64 {
    if period == 0 || closes.len() < period {
        return 0.0;
    }
    let start = closes.len() - period;
    let sum: f64 = closes[start..].iter().sum();
    sum / period as f64
}

fn exponential_moving_average(closes: &[f64], period: usize) -> f64 {
    if closes.is_empty() || period == 0 {
        return 0.0;
    }
    let alpha = 2.0 / (period as f64 + 1.0);
    let mut ema = closes[0];
    for &price in closes.iter().skip(1) {
        ema = alpha * price + (1.0 - alpha) * ema;
    }
    ema
}

fn relative_strength_index(closes: &[f64], period: usize) -> f64 {
    if period == 0 || closes.len() <= period {
        return 0.0;
    }

    let start = closes.len() - period - 1;
    let mut gains = 0.0;
    let mut losses = 0.0;
    for window in closes[start..].windows(2) {
        let diff = window[1] - window[0];
        if diff > 0.0 {
            gains += diff;
        } else {
            losses -= diff;
        }
    }

    let avg_gain = gains / period as f64;
    let avg_loss = losses / period as f64;
    if avg_loss == 0.0 {
        return 100.0;
    }
    let rs = avg_gain / avg_loss;
    100.0 - (100.0 / (1.0 + rs))
}

fn average_true_range(
    open: &Vec<f64>,
    close: &Vec<f64>,
    high: &Vec<f64>,
    low: &Vec<f64>,
    period: usize,
) -> f64 {
    if period == 0 || close.len() <= period {
        return 0.0;
    }
    let start = close.len() - period;
    let mut prev_close = close[start - 1];
    let mut sum = 0.0;
    for i in start..close.len() {
        let tr1 = high[i] - low[i];
        let tr2 = (high[i] - prev_close).abs();
        let tr3 = (low[i] - prev_close).abs();
        let tr = tr1.max(tr2).max(tr3);
        sum += tr;
        prev_close = close[i];
    }
    sum / period as f64
}

fn macd_value(closes: &[f64], fast: usize, slow: usize, signal: usize) -> f64 {
    if fast == 0 || slow == 0 || signal == 0 || closes.is_empty() {
        return 0.0;
    }
    let mut ema_fast = closes[0];
    let mut ema_slow = closes[0];
    let alpha_fast = 2.0 / (fast as f64 + 1.0);
    let alpha_slow = 2.0 / (slow as f64 + 1.0);
    let mut difs = Vec::with_capacity(closes.len());
    for &price in closes {
        ema_fast = alpha_fast * price + (1.0 - alpha_fast) * ema_fast;
        ema_slow = alpha_slow * price + (1.0 - alpha_slow) * ema_slow;
        difs.push(ema_fast - ema_slow);
    }
    if difs.is_empty() {
        return 0.0;
    }
    let mut signal_line = difs[0];
    let alpha_signal = 2.0 / (signal as f64 + 1.0);
    for &dif in difs.iter().skip(1) {
        signal_line = alpha_signal * dif + (1.0 - alpha_signal) * signal_line;
    }
    difs.last().copied().unwrap_or(0.0) - signal_line
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{FunctionParam, Op, ParamKind};
    use crate::semantic;
    use crate::simpile_impl::SimpleTradingExecutor;

    fn prepare_interpreter(statements: Vec<Statement>) -> (Interpreter, Script) {
        let script = Script::new(statements);
        semantic::analyze(&script).expect("语义分析失败");

        let market_data_context = MarketDataContext::new(16);
        let trading_executor = Box::new(SimpleTradingExecutor::new());
        let mut interpreter = Interpreter::new(market_data_context, 16, true, trading_executor);
        interpreter
            .parse_script(&script)
            .expect("解释器解析脚本失败");

        (interpreter, script)
    }

    fn bar(close: f64) -> crate::Bar {
        crate::Bar {
            time: "2024-01-01 00:00:00".into(),
            open: close,
            high: close,
            low: close,
            close,
            volume: 100.0,
        }
    }

    fn tick(price: f64) -> crate::Tick {
        crate::Tick {
            time: "2024-01-01 00:00:00".into(),
            price,
            volume: 1.0,
        }
    }

    fn bar_hlc(open: f64, high: f64, low: f64, close: f64) -> crate::Bar {
        crate::Bar {
            time: "2024-01-01 00:00:00".into(),
            open,
            high,
            low,
            close,
            volume: 100.0,
        }
    }

    fn num(value: f64) -> Expr {
        Expr::Number(value)
    }

    fn var(name: &str) -> Expr {
        Expr::Variable(name.into())
    }

    fn indicator(name: &str) -> Expr {
        Expr::Indicator(name.into())
    }

    fn call(name: &str, args: Vec<Expr>) -> Expr {
        Expr::Call {
            name: name.into(),
            args,
        }
    }

    fn index_access(target: &str, index: Expr) -> Expr {
        Expr::IndexAccess {
            target: target.into(),
            index: Box::new(index),
        }
    }

    fn method_call_expr(target: &str, method: &str, args: Vec<Expr>) -> Expr {
        Expr::MethodCall {
            target: target.into(),
            method: method.into(),
            args,
        }
    }

    fn property_access_expr(target: &str, property: &str) -> Expr {
        Expr::PropertyAccess {
            target: target.into(),
            property: property.into(),
        }
    }

    fn assign_intrinsic(target: &str, expr: Expr) -> Expr {
        Expr::AssignIntrinsic {
            target: target.into(),
            value: Box::new(expr),
        }
    }

    fn array_decl(name: &str, size: usize) -> Statement {
        Statement::ArrayDecl {
            name: name.into(),
            size,
        }
    }

    fn decl(name: &str, expr: Expr) -> Statement {
        Statement::VarDecl {
            name: name.into(),
            value: Some(expr),
        }
    }

    fn assign(name: &str, expr: Expr) -> Statement {
        Statement::Assign {
            name: name.into(),
            value: expr,
        }
    }

    fn read<'a>(interpreter: &'a Interpreter, name: &str) -> Option<&'a Value> {
        interpreter.get_variable_value(name)
    }

    fn assert_number(interpreter: &Interpreter, name: &str, expected: f64) {
        match read(interpreter, name) {
            Some(Value::Number(n)) => {
                assert!(
                    (n - expected).abs() < f64::EPSILON,
                    "变量 {} 期望值 {} 实际为 {}",
                    name,
                    expected,
                    n
                );
            }
            other => panic!("变量 {} 期望为数值 {:?}", name, other),
        }
    }

    fn assert_absent(interpreter: &Interpreter, name: &str) {
        assert!(
            read(interpreter, name).is_none(),
            "变量 {} 预期不存在",
            name
        );
    }

    fn fn_param_var(name: &str) -> FunctionParam {
        FunctionParam {
            name: name.to_string(),
            kind: ParamKind::VarByValue,
            id: None,
        }
    }

    fn fn_param_var_ref(name: &str) -> FunctionParam {
        FunctionParam {
            name: name.to_string(),
            kind: ParamKind::VarByRef,
            id: None,
        }
    }

    fn fn_param_series(name: &str) -> FunctionParam {
        FunctionParam {
            name: name.to_string(),
            kind: ParamKind::SeriesByRef,
            id: None,
        }
    }

    fn add(lhs: Expr, rhs: Expr) -> Expr {
        Expr::BinaryOp {
            op: Op::Add,
            left: Box::new(lhs),
            right: Box::new(rhs),
        }
    }

    fn greater(lhs: Expr, rhs: Expr) -> Expr {
        Expr::BinaryOp {
            op: Op::GreaterThan,
            left: Box::new(lhs),
            right: Box::new(rhs),
        }
    }

    fn greater_or_equal(lhs: Expr, rhs: Expr) -> Expr {
        Expr::BinaryOp {
            op: Op::GreaterThanOrEqual,
            left: Box::new(lhs),
            right: Box::new(rhs),
        }
    }

    #[test]
    fn executes_event_flow_and_series_operations() {
        let (mut interpreter, _) = prepare_interpreter(vec![
            decl("counter", num(1.0)),
            decl("len", num(0.0)),
            Statement::Series {
                name: "history".into(),
            },
            Statement::FunctionDef {
                name: "OnInit".into(),
                params: vec![],
                body: vec![assign("counter", add(var("counter"), num(1.0)))],
            },
            Statement::FunctionDef {
                name: "OnBar".into(),
                params: vec![],
                body: vec![
                    assign("counter", add(var("counter"), indicator("Close"))),
                    assign("history", indicator("Close")),
                    assign("len", call("length", vec![var("history")])),
                ],
            },
            Statement::FunctionDef {
                name: "OnTick".into(),
                params: vec![],
                body: vec![Statement::Assign {
                    name: "counter".into(),
                    value: add(var("counter"), num(2.0)),
                }],
            },
        ]);

        interpreter.initialize().expect("OnInit 执行失败");
        interpreter
            .on_bar(bar(10.0))
            .expect("第一次 OnBar 执行失败");
        interpreter
            .on_bar(bar(20.0))
            .expect("第二次 OnBar 执行失败");
        interpreter.on_tick(tick(7.0)).expect("OnTick 执行失败");

        assert_number(&interpreter, "counter", 34.0);
        assert_number(&interpreter, "len", 2.0);

        match read(&interpreter, "history") {
            Some(Value::Series(series)) => {
                assert_eq!(series.as_slice(), &[10.0, 20.0]);
            }
            other => panic!("期望 history 为序列, 实际为 {:?}", other),
        }
    }

    #[test]
    fn user_defined_function_return_value_persists() {
        let (interpreter, _) = prepare_interpreter(vec![
            Statement::FunctionDef {
                name: "ProvideValue".into(),
                params: vec![],
                body: vec![Statement::Return(Some(num(42.0)))],
            },
            decl("result", call("ProvideValue", vec![])),
        ]);

        assert_eq!(read(&interpreter, "result"), Some(&Value::Number(42.0)));
    }

    #[test]
    fn local_var_declaration_does_not_clobber_global() {
        let (interpreter, _) = prepare_interpreter(vec![
            decl("g", num(1.0)),
            Statement::FunctionDef {
                name: "Foo".into(),
                params: vec![],
                body: vec![
                    decl("g", num(2.0)),
                    assign("g", num(3.0)),
                    Statement::Return(Some(var("g"))),
                ],
            },
            decl("result", call("Foo", vec![])),
        ]);

        assert_number(&interpreter, "g", 1.0);
        assert_number(&interpreter, "result", 3.0);
    }

    #[test]
    fn user_function_parameters_bind_and_cleanup() {
        let (interpreter, _) = prepare_interpreter(vec![
            decl("sum", num(1.0)),
            Statement::FunctionDef {
                name: "Add".into(),
                params: vec![fn_param_var("x")],
                body: vec![
                    assign("sum", add(var("sum"), var("x"))),
                    Statement::Return(Some(var("sum"))),
                ],
            },
            decl("result", call("Add", vec![num(4.0)])),
        ]);

        assert_number(&interpreter, "sum", 5.0);
        assert_number(&interpreter, "result", 5.0);
        assert_absent(&interpreter, "x");
    }

    #[test]
    fn conditional_branches_update_state() {
        let (mut interpreter, _) = prepare_interpreter(vec![
            decl("direction", num(0.0)),
            Statement::FunctionDef {
                name: "OnBar".into(),
                params: vec![],
                body: vec![Statement::If {
                    condition: greater(indicator("Close"), num(50.0)),
                    then_block: vec![assign("direction", num(1.0))],
                    else_block: Some(vec![assign("direction", num(-1.0))]),
                }],
            },
        ]);

        interpreter.on_bar(bar(80.0)).expect("OnBar 高价执行失败");
        assert_number(&interpreter, "direction", 1.0);

        interpreter.on_bar(bar(40.0)).expect("OnBar 低价执行失败");
        assert_number(&interpreter, "direction", -1.0);
    }

    #[test]
    fn trade_commands_return_success_flag() {
        let (mut interpreter, _) = prepare_interpreter(vec![
            decl("tradeResult", num(0.0)),
            Statement::FunctionDef {
                name: "OnBar".into(),
                params: vec![],
                body: vec![assign(
                    "tradeResult",
                    call("Buy", vec![num(101.0), num(3.0)]),
                )],
            },
        ]);

        interpreter.on_bar(bar(90.0)).expect("OnBar 执行失败");
        assert_number(&interpreter, "tradeResult", 1.0);
    }

    #[test]
    fn indicator_without_data_reports_runtime_error() {
        let (mut interpreter, _) = prepare_interpreter(vec![
            decl("lastClose", num(0.0)),
            Statement::FunctionDef {
                name: "OnInit".into(),
                params: vec![],
                body: vec![assign("lastClose", indicator("Close"))],
            },
        ]);

        let err = interpreter.initialize().expect_err("预期OnInit失败但成功");
        assert!(err.message.contains("没有可用的Bar数据"));
    }

    #[test]
    fn index_and_method_access_work() {
        let (mut interpreter, _) = prepare_interpreter(vec![
            Statement::Series {
                name: "history".into(),
            },
            decl("history_len", num(0.0)),
            decl("latest", num(0.0)),
            decl("previous", num(0.0)),
            decl("prev_close", num(0.0)),
            Statement::FunctionDef {
                name: "OnBar".into(),
                params: vec![],
                body: vec![
                    assign("history", indicator("Close")),
                    assign(
                        "history_len",
                        method_call_expr("history", "length", Vec::new()),
                    ),
                    assign("latest", index_access("history", num(0.0))),
                    Statement::If {
                        condition: greater_or_equal(var("history_len"), num(2.0)),
                        then_block: vec![
                            assign("previous", index_access("history", num(1.0))),
                            assign("prev_close", index_access("Close", num(1.0))),
                        ],
                        else_block: None,
                    },
                ],
            },
        ]);

        interpreter
            .on_bar(bar(10.0))
            .expect("第一次 OnBar 执行失败");

        assert_number(&interpreter, "history_len", 1.0);
        assert_number(&interpreter, "latest", 10.0);
        assert_number(&interpreter, "previous", 0.0);

        interpreter
            .on_bar(bar(20.0))
            .expect("第二次 OnBar 执行失败");

        assert_number(&interpreter, "history_len", 2.0);
        assert_number(&interpreter, "latest", 20.0);
        assert_number(&interpreter, "previous", 10.0);
        assert_number(&interpreter, "prev_close", 10.0);

        match read(&interpreter, "history") {
            Some(Value::Series(series)) => {
                assert_eq!(series.as_slice(), &[10.0, 20.0]);
            }
            other => panic!("期望 history 为序列, 实际为 {:?}", other),
        }
    }

    #[test]
    fn assign_helper_in_for_loop_updates_variable() {
        let (mut interpreter, _) = prepare_interpreter(vec![
            decl("sum", num(0.0)),
            Statement::FunctionDef {
                name: "OnBar".into(),
                params: vec![],
                body: vec![Statement::For {
                    var: "i".into(),
                    start: num(0.0),
                    end: Expr::BinaryOp {
                        op: Op::LessThan,
                        left: Box::new(var("i")),
                        right: Box::new(num(3.0)),
                    },
                    step: Some(assign_intrinsic("i", add(var("i"), num(1.0)))),
                    body: vec![assign("sum", add(var("sum"), indicator("Close")))],
                }],
            },
        ]);

        interpreter.on_bar(bar(5.0)).expect("OnBar 执行失败");
        assert_number(&interpreter, "sum", 15.0);
        assert_absent(&interpreter, "i");
    }

    #[test]
    fn var_parameter_is_passed_by_value() {
        let (mut interpreter, _) = prepare_interpreter(vec![
            decl("x", num(1.0)),
            Statement::FunctionDef {
                name: "Update".into(),
                params: vec![fn_param_var("a")],
                body: vec![assign("a", num(5.0)), Statement::Return(Some(var("a")))],
            },
        ]);

        let result = interpreter
            .evaluate_expression(&call("Update", vec![var("x")]))
            .expect("函数调用失败");
        assert_number(&interpreter, "x", 1.0);
        assert_eq!(result, Value::Number(5.0));
    }

    #[test]
    fn var_reference_parameter_mutates_caller() {
        let (mut interpreter, _) = prepare_interpreter(vec![
            decl("x", num(1.0)),
            Statement::FunctionDef {
                name: "Update".into(),
                params: vec![fn_param_var_ref("a")],
                body: vec![assign("a", num(5.0)), Statement::Return(Some(var("a")))],
            },
        ]);

        let result = interpreter
            .evaluate_expression(&call("Update", vec![var("x")]))
            .expect("函数调用失败");
        assert_number(&interpreter, "x", 5.0);
        assert_eq!(result, Value::Number(5.0));
    }

    #[test]
    fn series_parameter_is_passed_by_reference() {
        let (mut interpreter, _) = prepare_interpreter(vec![
            Statement::Series {
                name: "history".into(),
            },
            Statement::FunctionDef {
                name: "Push".into(),
                params: vec![fn_param_series("data")],
                body: vec![assign("data", num(2.0))],
            },
        ]);

        interpreter
            .execute_statement(&assign("history", num(1.0)))
            .expect("初始化 history 失败");
        interpreter
            .evaluate_expression(&call("Push", vec![var("history")]))
            .expect("函数调用失败");
        match read(&interpreter, "history") {
            Some(Value::Series(series)) => {
                assert_eq!(series.len(), 2);
                assert_eq!(series.as_slice(), &[1.0, 2.0]);
            }
            other => panic!("预期 history 为更新后的序列，实际: {:?}", other),
        }
    }

    #[test]
    fn array_declaration_and_assignment() {
        let (mut interpreter, _) = prepare_interpreter(vec![
            array_decl("values", 5),
            Statement::FunctionDef {
                name: "OnBar".into(),
                params: vec![],
                body: vec![Statement::ArrayAssign {
                    name: "values".into(),
                    index: num(2.0),
                    value: num(4.5),
                }],
            },
        ]);

        interpreter.on_bar(bar(1.0)).expect("OnBar 执行失败");

        match read(&interpreter, "values") {
            Some(Value::Array(array)) => {
                assert_eq!(array.len(), 5);
                assert_eq!(array[2], 4.5);
            }
            other => panic!("期望 values 为数组, 实际为 {:?}", other),
        }
    }

    #[test]
    fn builtin_ma_and_rsi_work() {
        let (mut interpreter, _) = prepare_interpreter(Vec::new());
        interpreter.on_bar(bar(1.0)).unwrap();
        interpreter.on_bar(bar(2.0)).unwrap();
        interpreter.on_bar(bar(3.0)).unwrap();
        interpreter.on_bar(bar(4.0)).unwrap();
        interpreter.on_bar(bar(5.0)).unwrap();

        let ma = interpreter
            .evaluate_expression(&call("MA", vec![num(3.0)]))
            .unwrap();
        match ma {
            Value::Number(v) => assert!((v - 4.0).abs() < 1e-6),
            other => panic!("MA 返回异常: {:?}", other),
        }

        let rsi = interpreter
            .evaluate_expression(&call("RSI", vec![num(2.0)]))
            .unwrap();
        match rsi {
            Value::Number(v) => assert!(v >= 0.0 && v <= 100.0),
            other => panic!("RSI 返回异常: {:?}", other),
        }
    }

    #[test]
    fn builtin_atr_and_macd_work() {
        let (mut interpreter, _) = prepare_interpreter(Vec::new());
        interpreter.on_bar(bar_hlc(10.0, 12.0, 9.0, 11.0)).unwrap();
        interpreter.on_bar(bar_hlc(11.0, 13.0, 10.0, 12.0)).unwrap();
        interpreter.on_bar(bar_hlc(12.0, 14.0, 11.0, 13.0)).unwrap();
        interpreter.on_bar(bar_hlc(13.0, 15.0, 12.0, 14.0)).unwrap();

        let atr = interpreter
            .evaluate_expression(&call("ATR", vec![num(3.0)]))
            .unwrap();
        match atr {
            Value::Number(v) => assert!(v >= 0.0),
            other => panic!("ATR 返回异常: {:?}", other),
        }

        let macd = interpreter
            .evaluate_expression(&call("MACD", Vec::new()))
            .unwrap();
        match macd {
            Value::Number(_) => {}
            other => panic!("MACD 返回异常: {:?}", other),
        }
    }
}
