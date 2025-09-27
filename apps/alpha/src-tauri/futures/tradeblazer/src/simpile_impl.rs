use crate::interpreter_trait::{OrderCmd, TradingExecutor};

/// 交易执行器
#[derive(Debug, Default)]
pub struct SimpleTradingExecutor {
    // 这里可以实现交易执行的逻辑
}

impl SimpleTradingExecutor {
    pub fn new() -> Self {
        Self::default()
    }
}

impl TradingExecutor for SimpleTradingExecutor {
    fn execute_order(&mut self, cmd: OrderCmd, price: f64, volume: f64) {
        // 实现交易执行逻辑
        println!("执行交易指令: {:?}, 价格: {}, 数量: {}", cmd, price, volume);
    }
}