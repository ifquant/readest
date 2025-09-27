//! Imbalance 聚合器（买卖不平衡比）
//!
//! 概述：
//! - 通过简单归因（如 uptick/downtick）累积买卖量，计算不平衡比并在超过阈值且总量充足时输出。
//! - Bar 字段包含 `open/high/low/close` 与买卖量，便于与价差、波动协同分析。
//!
//! 设计提示（来自旧版注释，总结保留）：
//! - 成交方向归因提升：可替换为更准确的算法（例如基于订单簿的判定或更细粒度规则）。
//! - 自适应阈值：根据波动率/总量动态调整阈值，减少噪声与虚假触发。
//! - 窗口选择：固定/滚动窗口策略的选择与重置点的设定。
//!
use super::TickDerived;
use futures_interfaces::market_data::{DerivedMarketData, ImbalanceSpec};
use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::derived::ImbalanceBar;

pub struct ImbalanceAgg {
    pub spec: ImbalanceSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    open: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    close: Option<f64>,
    last_price: Option<f64>,
    buy_volume: u64,
    sell_volume: u64,
}

impl ImbalanceAgg {
    pub fn new(spec: ImbalanceSpec) -> Self {
        Self {
            spec,
            start_ts_ms: None,
            instrument: None,
            open: None,
            high: None,
            low: None,
            close: None,
            last_price: None,
            buy_volume: 0,
            sell_volume: 0,
        }
    }
}

impl TickDerived for ImbalanceAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        // 初次初始化：设置窗口起点与 OHLC
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.open = Some(tick.price);
            self.high = Some(tick.price);
            self.low = Some(tick.price);
            self.close = Some(tick.price);
            self.last_price = Some(tick.price);
            self.buy_volume = 0;
            self.sell_volume = 0;
        }
        // 基于 uptick/downtick 的简单买卖量归因。
        let is_ask = match self.last_price { Some(lp) => tick.price >= lp, None => true };
        if is_ask { self.buy_volume = self.buy_volume.saturating_add(tick.volume); } else { self.sell_volume = self.sell_volume.saturating_add(tick.volume); }

        // OHLC 更新
        if let Some(h) = self.high { if tick.price > h { self.high = Some(tick.price); } }
        if let Some(l) = self.low { if tick.price < l { self.low = Some(tick.price); } }
        self.close = Some(tick.price);
        self.last_price = Some(tick.price);

        let total = self.buy_volume + self.sell_volume;
        // 鲁棒性：体量过小则不输出，避免噪声影响。
        if total >= super::MIN_TOTAL_VOLUME_FOR_IMBALANCE {
            let imbalance_ratio = ((self.buy_volume as f64) - (self.sell_volume as f64)).abs() / (total as f64);
            if imbalance_ratio >= self.spec.threshold {
                let bar = ImbalanceBar {
                    instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                    start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                    end_ts_ms: tick.ts_ms,
                    threshold: self.spec.threshold,
                    buy_volume: self.buy_volume,
                    sell_volume: self.sell_volume,
                    open: self.open.unwrap_or(tick.price),
                    high: self.high.unwrap_or(tick.price),
                    low: self.low.unwrap_or(tick.price),
                    close: self.close.unwrap_or(tick.price),
                };
                out.push(DerivedMarketData::ImbalanceBar(bar));
                // 重置到新窗口：保持连续滚动而非对齐固定步长
                self.start_ts_ms = Some(tick.ts_ms);
                self.open = Some(tick.price);
                self.high = Some(tick.price);
                self.low = Some(tick.price);
                self.close = Some(tick.price);
                self.buy_volume = 0;
                self.sell_volume = 0;
            }
        }
    }

    fn reset(&mut self) {
        self.start_ts_ms = None;
        self.instrument = None;
        self.open = None;
        self.high = None;
        self.low = None;
        self.close = None;
        self.last_price = None;
        self.buy_volume = 0;
        self.sell_volume = 0;
    }
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()