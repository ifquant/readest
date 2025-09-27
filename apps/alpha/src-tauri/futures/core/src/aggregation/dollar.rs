//! DollarBar 聚合器（基于美元成交额阈值）
//!
//! 概述：
//! - 累积 `acc_dollar = Σ(price * volume)`，当达到 `target_dollar` 时输出一根 DollarBar。
//! - Bar 字段包括 `open/high/low/close/volume/actual_dollar` 等，窗口在输出后重新开始。
//!
//! 设计提示（来自旧版注释，总结保留）：
//! - 超额触发时的多 Bar 生成策略：一次超出多个阈值是否拆分多根，或对齐到下一窗口。
//! - 金额精度：可考虑更高精度的小数类型以减少累积误差。
//! - 频率控制/快照填充：在低成交期可进行速率限制或补齐快照以提升可读性。
//!
use super::TickDerived;
use futures_interfaces::InstrumentId;
use futures_interfaces::market_data::{DerivedMarketData, DollarSpec};
use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::derived::DollarBar;

pub struct DollarBarAgg {
    pub spec: DollarSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<InstrumentId>,
    open: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    close: Option<f64>,
    acc_volume: u64,
    acc_dollar: f64,
}

impl DollarBarAgg {
    pub fn new(spec: DollarSpec) -> Self {
        Self { spec, start_ts_ms: None, instrument: None, open: None, high: None, low: None, close: None, acc_volume: 0, acc_dollar: 0.0 }
    }
}

impl TickDerived for DollarBarAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.open = Some(tick.price);
            self.high = Some(tick.price);
            self.low = Some(tick.price);
            self.close = Some(tick.price);
            self.acc_volume = 0;
            self.acc_dollar = 0.0;
        }
        if let Some(h) = self.high { if tick.price > h { self.high = Some(tick.price); } }
        if let Some(l) = self.low { if tick.price < l { self.low = Some(tick.price); } }
        self.close = Some(tick.price);
        self.acc_volume += tick.volume;
        self.acc_dollar += tick.price * (tick.volume as f64);

        if self.acc_dollar >= self.spec.target_dollar {
            let bar = DollarBar {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                target_dollar: self.spec.target_dollar,
                actual_dollar: self.acc_dollar,
                open: self.open.unwrap_or(tick.price),
                high: self.high.unwrap_or(tick.price),
                low: self.low.unwrap_or(tick.price),
                close: self.close.unwrap_or(tick.price),
                volume: self.acc_volume,
            };
            out.push(DerivedMarketData::DollarBar(bar));
            self.start_ts_ms = Some(tick.ts_ms);
            self.open = Some(tick.price);
            self.high = Some(tick.price);
            self.low = Some(tick.price);
            self.close = Some(tick.price);
            self.acc_volume = 0;
            self.acc_dollar = 0.0;
        }
    }
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()