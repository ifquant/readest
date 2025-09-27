use crate::{
    InterfacesError, InstrumentId,
    market_data::MarketData,
    market_data::RawMarketData,
    market_data::DerivedMarketData,
    strategy::{Strategy, StrategyContext, StrategySignal, StrategyEvent, OrderUpdate},
    MarketDataProvider, TradeGateway, Order, OrderId, Side,
};

/// 执行器接口：连接行情、交易与策略，实现下单与回报路由
pub trait StrategyExecutor {
    fn register_strategy(&mut self, strategy: Box<dyn Strategy>) -> Result<(), InterfacesError>;
    fn on_market_data(&mut self, data: MarketData) -> Result<(), InterfacesError>;
    fn on_order_update(&mut self, update: OrderUpdate) -> Result<(), InterfacesError>;
    fn on_timer(&mut self, ts_ms: u64) -> Result<(), InterfacesError>;
}

/// 默认策略上下文实现：由执行器在回调时构造
pub struct DefaultStrategyContext<'a> {
    pub now_ms: u64,
    pub md: &'a mut dyn MarketDataProvider,
    pub gw: &'a mut dyn TradeGateway,
    pub signals: Vec<StrategySignal>,
}

impl<'a> StrategyContext for DefaultStrategyContext<'a> {
    fn now_ms(&self) -> u64 { self.now_ms }

    fn place_order(&mut self, order: Order) -> Result<OrderId, InterfacesError> {
        self.gw.place_order(order)
    }

    fn cancel_order(&mut self, order_id: &OrderId) -> Result<(), InterfacesError> {
        self.gw.cancel_order(order_id)
    }

    fn subscribe(&mut self, instrument: &InstrumentId) -> Result<(), InterfacesError> {
        self.md.subscribe(instrument)
    }

    fn unsubscribe(&mut self, instrument: &InstrumentId) -> Result<(), InterfacesError> {
        self.md.unsubscribe(instrument)
    }

    fn emit_signal(&mut self, signal: StrategySignal) {
        self.signals.push(signal);
    }
}

/// 简单执行器示例：单策略，外部提供行情/交易引用
pub struct SimpleExecutor<'a> {
    pub strategy: Box<dyn Strategy>,
    pub md: &'a mut dyn MarketDataProvider,
    pub gw: &'a mut dyn TradeGateway,
    pub now_ms: u64,
}

impl<'a> SimpleExecutor<'a> {
    pub fn new(
        strategy: Box<dyn Strategy>,
        md: &'a mut dyn MarketDataProvider,
        gw: &'a mut dyn TradeGateway,
        now_ms: u64,
    ) -> Self {
        Self { strategy, md, gw, now_ms }
    }
}

impl<'a> StrategyExecutor for SimpleExecutor<'a> {
    fn register_strategy(&mut self, strategy: Box<dyn Strategy>) -> Result<(), InterfacesError> {
        self.strategy = strategy;
        Ok(())
    }

    fn on_market_data(&mut self, data: MarketData) -> Result<(), InterfacesError> {
        match data {
            MarketData::Raw(d) => {
                let now_ms = self.now_ms;
                let md = &mut *self.md;
                let gw = &mut *self.gw;
                let mut ctx = DefaultStrategyContext { now_ms, md, gw, signals: Vec::new() };
                self.strategy.on_raw(&mut ctx, d)?;
            }
            MarketData::Derived(d) => {
                let now_ms = self.now_ms;
                let md = &mut *self.md;
                let gw = &mut *self.gw;
                let mut ctx = DefaultStrategyContext { now_ms, md, gw, signals: Vec::new() };
                self.strategy.on_derived(&mut ctx, d)?;
            }
        }
        Ok(())
    }

    fn on_order_update(&mut self, update: OrderUpdate) -> Result<(), InterfacesError> {
        let md = &mut *self.md;
        let gw = &mut *self.gw;
        let mut ctx = DefaultStrategyContext { now_ms: update.ts_ms, md, gw, signals: Vec::new() };
        self.strategy.on_event(&mut ctx, StrategyEvent::OrderUpdate(update))
    }

    fn on_timer(&mut self, ts_ms: u64) -> Result<(), InterfacesError> {
        self.now_ms = ts_ms;
        let md = &mut *self.md;
        let gw = &mut *self.gw;
        let mut ctx = DefaultStrategyContext { now_ms: ts_ms, md, gw, signals: Vec::new() };
        self.strategy.on_event(&mut ctx, StrategyEvent::Timer(ts_ms))
    }
}