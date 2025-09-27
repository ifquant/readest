use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum InterfacesError {
    #[error("unsupported operation: {0}")]
    Unsupported(String),
    #[error("invalid argument: {0}")]
    InvalidArg(String),
}

// ---- 通用类型 ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstrumentId(pub String);

// 将市场数据相关类型迁移到独立模块
pub mod market_data;
pub use market_data::*;

// 策略接口（独立模块）
pub mod strategy;
pub use strategy::*;

// 执行器接口与默认上下文
pub mod executor;
pub use executor::*;

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

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum Side {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum OrderType {
    Market,
    Limit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order {
    pub instrument: InstrumentId,
    pub side: Side,
    pub qty: u64,
    pub order_type: OrderType,
    pub price: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderId(pub String);

// ---- 接口定义 ----

/// 行情接口：订阅/退订等
pub trait MarketDataProvider {
    fn subscribe(&mut self, instrument: &InstrumentId) -> Result<(), InterfacesError>;
    fn unsubscribe(&mut self, instrument: &InstrumentId) -> Result<(), InterfacesError>;
}

/// 交易接口：下单/撤单等
pub trait TradeGateway {
    fn place_order(&mut self, order: Order) -> Result<OrderId, InterfacesError>;
    fn cancel_order(&mut self, order_id: &OrderId) -> Result<(), InterfacesError>;
}

// 旧版简单策略接口已迁移到 strategy.rs 的更完备定义