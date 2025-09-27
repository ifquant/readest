//! RangeBar 聚合器（基于价格区间突破）
//!
//! 概述：
//! - 从窗口 `open` 起，当价格相对开盘价突破 `range_size`（向上或向下）时生成一根 RangeBar。
//! - Bar 的 `close` 固定为 `open ± range_size`，`high/low` 为窗口期间经历的极值。
//!
//! 设计提示（来自旧版注释，总结保留）：
//! - 可选“严格步进”策略，避免在一次大跳动中跨越多个区间却只生成一根。
//! - 针对极端跳价（gap）的处理策略：是否补齐中间步进或直接对齐到目标区间。
//! - 会话/锚点重置：在特定时间或信号点重置 `open` 以适配盘中/隔夜场景。
//!
use super::TickDerived;
use futures_interfaces::InstrumentId;
use futures_interfaces::market_data::{DerivedMarketData, RangeSpec};
use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::derived::RangeBar;

pub struct RangeBarAgg {
    pub spec: RangeSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<InstrumentId>,
    open: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    close: Option<f64>,
    acc_volume: u64,
}

impl RangeBarAgg {
    pub fn new(spec: RangeSpec) -> Self {
        Self { spec, start_ts_ms: None, instrument: None, open: None, high: None, low: None, close: None, acc_volume: 0 }
    }
}

impl TickDerived for RangeBarAgg {
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
        }
        if let Some(h) = self.high { if tick.price > h { self.high = Some(tick.price); } }
        if let Some(l) = self.low { if tick.price < l { self.low = Some(tick.price); } }
        self.close = Some(tick.price);
        self.acc_volume += tick.volume;

        let open = self.open.unwrap_or(tick.price);
        let up_break = tick.price - open >= self.spec.range_size;
        let down_break = open - tick.price >= self.spec.range_size;
        if up_break || down_break {
            let close = if up_break { open + self.spec.range_size } else { open - self.spec.range_size };
            let bar = RangeBar {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                range_size: self.spec.range_size,
                open,
                high: self.high.unwrap_or(open.max(close)),
                low: self.low.unwrap_or(open.min(close)),
                close,
                volume: self.acc_volume,
            };
            out.push(DerivedMarketData::RangeBar(bar));
            self.start_ts_ms = Some(tick.ts_ms);
            self.open = Some(close);
            self.high = Some(close);
            self.low = Some(close);
            self.close = Some(close);
            self.acc_volume = 0;
        }
    }
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()