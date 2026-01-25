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
use super::common::{OhlcAcc, push_bar, TriggerCondition, RangeTrigger};

pub struct RangeBarAgg {
    pub spec: RangeSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<InstrumentId>,
    ohlc: OhlcAcc,
    acc_volume: u64,
    // 触发器：价格相对 open 的变动达到区间大小时输出
    trigger: RangeTrigger,
}

impl RangeBarAgg {
    pub fn new(spec: RangeSpec) -> Self {
        let range_size = spec.range_size;
        Self { spec, start_ts_ms: None, instrument: None, ohlc: OhlcAcc::new(), acc_volume: 0, trigger: RangeTrigger { range_size, open: None, current_price: 0.0 } }
    }
}

impl TickDerived for RangeBarAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.ohlc.init_from_price(tick.price);
            self.acc_volume = 0;
        }
        self.ohlc.update_hl_close(tick.price);
        self.acc_volume += tick.volume;

        let open = self.ohlc.open.unwrap_or(tick.price);
        // 更新触发器状态并判定是否触发输出
        self.trigger.open = self.ohlc.open;
        self.trigger.current_price = tick.price;
        if self.trigger.should_emit(tick) {
            let up_break = tick.price - open >= self.spec.range_size;
            let close = if up_break { open + self.spec.range_size } else { open - self.spec.range_size };
            let bar = RangeBar {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                range_size: self.spec.range_size,
                open,
                high: self.ohlc.high.unwrap_or(open.max(close)),
                low: self.ohlc.low.unwrap_or(open.min(close)),
                close,
                volume: self.acc_volume,
            };
            push_bar(out, bar);
            self.start_ts_ms = Some(tick.ts_ms);
            self.ohlc.init_from_price(close);
            self.acc_volume = 0;
            // 下一窗口以 new open 为基础
            self.trigger.open = Some(close);
            self.trigger.current_price = close;
        }
    }
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()