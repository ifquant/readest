use serde::{Deserialize, Serialize};
use crate::{
    InstrumentId, Side, Order, OrderId, InterfacesError,
    RawMarketData, DerivedMarketData, MarketDataSpec,
};

/// 策略运行时上下文，由策略引擎实现并传递给策略
pub trait StrategyContext {
    fn now_ms(&self) -> u64;
    fn place_order(&mut self, order: Order) -> Result<OrderId, InterfacesError>;
    fn cancel_order(&mut self, order_id: &OrderId) -> Result<(), InterfacesError>;
    fn subscribe(&mut self, instrument: &InstrumentId) -> Result<(), InterfacesError>;
    fn unsubscribe(&mut self, instrument: &InstrumentId) -> Result<(), InterfacesError>;
    fn emit_signal(&mut self, signal: StrategySignal);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategySignal {
    pub instrument: InstrumentId,
    pub side: Side,
    pub reason: String,
    pub ts_ms: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum OrderStatus {
    New,
    PartiallyFilled,
    Filled,
    Cancelled,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderUpdate {
    pub order_id: OrderId,
    pub status: OrderStatus,
    pub filled_qty: u64,
    pub ts_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StrategyEvent {
    Timer(u64),
    OrderUpdate(OrderUpdate),
}

/// 交易策略抽象，显式区分原始与派生数据的处理入口
pub trait Strategy {
    /// 策略唯一标识
    fn id(&self) -> &str;

    /// 关注的合约列表（用于初始订阅）
    fn instruments(&self) -> &[InstrumentId];

    /// 需要的派生数据规格（策略引擎用此构建聚合管线）
    fn required_specs(&self) -> &[MarketDataSpec] { &[] }

    /// 初始化钩子
    fn init(&mut self, ctx: &mut dyn StrategyContext) -> Result<(), InterfacesError>;

    /// 原始数据回调（Tick/Quote/Trade/OrderBook）
    fn on_raw(&mut self, ctx: &mut dyn StrategyContext, data: RawMarketData) -> Result<(), InterfacesError>;

    /// 派生数据回调（各类 Bar/画像/结构化数据等）
    fn on_derived(&mut self, ctx: &mut dyn StrategyContext, data: DerivedMarketData) -> Result<(), InterfacesError>;

    /// 通用事件回调（定时器/订单状态更新）
    fn on_event(&mut self, ctx: &mut dyn StrategyContext, event: StrategyEvent) -> Result<(), InterfacesError>;
}