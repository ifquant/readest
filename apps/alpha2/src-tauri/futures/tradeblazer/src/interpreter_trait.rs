//! 脚本解释器抽象接口

use crate::ast::{Expr, Script, Statement, SymbolTable}; 
use crate::error::CompileError; 
use std::sync::Arc;

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

    pub fn get(&self, index: usize) -> Option<f64> {
        self.data.get(index).cloned()
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

/// 交易执行器
pub trait TradingExecutor {
    fn execute_order(&mut self, cmd: OrderCmd, price: f64, volume: f64);
}

/// 市场数据上下文
pub trait MarketDataContext {
    /// 创建新的市场数据上下文
    fn new(max_bars: usize) -> Self;
    
    /// 添加K线数据
    fn add_bar(&mut self, bar: Bar, max_bars: usize);
    
    /// 设置当前Tick数据
    fn set_tick(&mut self, tick: Tick);
    
    /// 获取当前Tick数据
    fn get_current_tick(&self) -> Option<&Tick>;
    
    /// 获取特定指标的所有数据
    fn get_indicator_values(&self, name: &str) -> Option<&SeriesData>;
    
    /// 获取特定指标在特定位置的值
    fn get_indicator_value_at(&self, name: &str, index: usize) -> Option<f64>;
    
    /// 获取当前价格
    fn get_current_price(&self) -> Option<f64>;
    
    /// 获取K线数据
    fn get_bars(&self) -> &[Bar];
}

/// 脚本解释器抽象接口
pub trait ScriptInterpreter {
    /// 创建新的解释器实例
    fn new(
        market_data_context: impl MarketDataContext,
        max_bars: usize,
        maintain_string_bindings: bool,
    ) -> Self;
    
    /// 执行整个脚本
    fn execute(&mut self, script: &Script) -> Result<(), CompileError>;
    
    /// 解析脚本，提取函数定义和全局变量
    fn parse_script(&mut self, script: &Script) -> Result<(), CompileError>;
    
    /// 解析已经完成降级的脚本（所有热点节点均使用 SymbolId）
    fn parse_lowered_script(&mut self, script: &Script) -> Result<(), CompileError>;
    
    /// 初始化策略
    fn initialize(&mut self) -> Result<(), CompileError>;
    
    /// 处理Tick事件
    fn on_tick(&mut self, tick: Tick) -> Result<(), CompileError>;
    
    /// 处理Bar事件
    fn on_bar(&mut self, bar: Bar) -> Result<(), CompileError>;
    
    /// 设置符号表
    fn set_symbol_table(&mut self, symbol_table: Arc<SymbolTable>);
    
    /// 获取当前价格
    fn get_current_price(&self) -> Result<f64, CompileError>;
    
    /// 声明变量
    fn declare_variable(&mut self, name: &str, value: Value) -> Result<(), CompileError>;
    
    /// 赋值变量
    fn assign_variable(&mut self, name: &str, value: Value) -> Result<(), CompileError>;
    
    /// 获取变量值
    fn get_variable_value(&self, name: &str) -> Option<&Value>;
    
    /// 评估表达式
    fn evaluate_expression(&mut self, expr: &Expr) -> Result<Value, CompileError>;
    
    /// 执行语句
    fn execute_statement(&mut self, stmt: &Statement) -> Result<(), CompileError>;
    
    /// 获取指标值
    fn get_indicator_value(&self, name: &str) -> Result<f64, CompileError>;
    
    /// 获取特定位置的指标值
    fn get_indicator_value_at(&self, name: &str, index: usize) -> Result<f64, CompileError>;
    
    /// 执行内置函数
    fn call_builtin(&mut self, func: BuiltinFunction, args: &[Value]) -> Result<Value, CompileError>;
}