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
use super::common::{OhlcAcc, push_bar, TriggerCondition, DollarTrigger};

pub struct DollarBarAgg {
    pub spec: DollarSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<InstrumentId>,
    ohlc: OhlcAcc,
    acc_volume: u64,
    acc_dollar: f64,
    // 触发器：美元成交额达到目标时输出
    trigger: DollarTrigger,
}

impl DollarBarAgg {
    pub fn new(spec: DollarSpec) -> Self {
        let target_dollar = spec.target_dollar;
        Self { spec, start_ts_ms: None, instrument: None, ohlc: OhlcAcc::new(), acc_volume: 0, acc_dollar: 0.0, trigger: DollarTrigger { target_dollar, acc_dollar: 0.0 } }
    }
}

impl TickDerived for DollarBarAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.ohlc.init_from_price(tick.price);
            self.acc_volume = 0;
            self.acc_dollar = 0.0;
        }
        self.ohlc.update_hl_close(tick.price);
        self.acc_volume += tick.volume;
        self.acc_dollar += tick.price * (tick.volume as f64);

        // 更新触发器状态并判定是否触发输出
        self.trigger.acc_dollar = self.acc_dollar;
        if self.trigger.should_emit(tick) {
            let (open, high, low, close) = self.ohlc.values_or(tick.price);
            let bar = DollarBar {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                target_dollar: self.spec.target_dollar,
                actual_dollar: self.acc_dollar,
                open,
                high,
                low,
                close,
                volume: self.acc_volume,
            };
            push_bar(out, bar);
            self.start_ts_ms = Some(tick.ts_ms);
            self.ohlc.init_from_price(tick.price);
            self.acc_volume = 0;
            self.acc_dollar = 0.0;
            self.trigger.acc_dollar = 0.0;
        }
    }
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()