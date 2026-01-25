//! VWAP 聚合器（成交量加权平均价）
//!
//! 概述：
//! - Anchored 模式：自锚定点持续累积成交量与成交额，并在每个 tick 输出当前 VWAP。
//! - Window 模式：按时间窗口输出；支持在无成交跨越时的 gap fill，将 VWAP 置为最近价格快照。
//!
//! 设计提示（来自旧版注释，总结保留）：
//! - 非锚定窗口的 gap fill 规则可调：限制最大补齐数、是否在长时间无成交时保持静默。
//! - 归因与加权方式：可考虑更准确的买卖归因或基于盘口的权重以提升代表性。
//! - 锚定重置策略：在切换会话、达成策略条件时重置起点以贴合盘中场景。
//!
use super::TickDerived;
use super::common::{TriggerCondition, AlwaysTrigger, WindowEndTrigger};
use futures_interfaces::InstrumentId;
use futures_interfaces::market_data::{DerivedMarketData, VwapSpec};
use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::derived::VwapBar;

pub struct VwapAgg {
    pub spec: VwapSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<InstrumentId>,
    total_volume: u64,
    total_dollar: f64,
    last_price: Option<f64>,
    // 触发器：锚定模式每 tick 输出；窗口模式在窗口结束时输出
    anchored_trigger: Option<AlwaysTrigger>,
    window_trigger: Option<WindowEndTrigger>,
}

impl VwapAgg {
    pub fn new(spec: VwapSpec) -> Self {
        let anchored_trigger = if spec.anchored { Some(AlwaysTrigger) } else { None };
        let window_trigger = if !spec.anchored && spec.window_ms.is_some() { Some(WindowEndTrigger { end_ts_ms: None, current_ts_ms: 0 }) } else { None };
        Self { spec, start_ts_ms: None, instrument: None, total_volume: 0, total_dollar: 0.0, last_price: None, anchored_trigger, window_trigger }
    }
}

impl TickDerived for VwapAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.total_volume = 0;
            self.total_dollar = 0.0;
        }
        self.total_volume += tick.volume;
        self.total_dollar += tick.price * (tick.volume as f64);
        self.last_price = Some(tick.price);

        let start_ts = self.start_ts_ms.unwrap_or(tick.ts_ms);
        let instr = self.instrument.clone().unwrap_or(tick.instrument.clone());

        if self.spec.anchored {
            // 锚定模式：每 tick 输出累计 VWAP（若有成交）
            if let Some(tr) = &self.anchored_trigger {
                if tr.should_emit(tick) && self.total_volume > 0 {
                    let vwap = self.total_dollar / (self.total_volume as f64);
                    let bar = VwapBar { instrument: instr.clone(), start_ts_ms: start_ts, end_ts_ms: tick.ts_ms, vwap, total_volume: self.total_volume, total_dollar: self.total_dollar };
                    out.push(DerivedMarketData::VwapBar(bar));
                }
            }
        } else if let Some(win) = self.spec.window_ms {
            // 窗口模式：使用触发器判定窗口结束
            if let Some(tr) = &mut self.window_trigger {
                tr.end_ts_ms = Some(start_ts + win);
                tr.current_ts_ms = tick.ts_ms;
            }
            let crossed = if let Some(tr) = &self.window_trigger { tr.should_emit(tick) } else { false };
            if crossed {
                let crosses = ((tick.ts_ms.saturating_sub(start_ts)) / win) as usize;
                if self.total_volume == 0 && self.spec.gap_fill_enabled && crosses >= 1 {
                    let max_fill = self.spec.gap_fill_max.map(|v| v as usize).unwrap_or(usize::MAX);
                    let fill_count = crosses.min(max_fill);
                    let px = self.last_price.unwrap_or(tick.price);
                    for i in 0..fill_count {
                        let st = start_ts + (i as u64) * win;
                        let en = st + win;
                        let bar = VwapBar { instrument: instr.clone(), start_ts_ms: st, end_ts_ms: en, vwap: px, total_volume: 0, total_dollar: 0.0 };
                        out.push(DerivedMarketData::VwapBar(bar));
                    }
                    self.start_ts_ms = Some(tick.ts_ms);
                    self.total_volume = 0;
                    self.total_dollar = 0.0;
                } else {
                    if self.total_volume > 0 {
                        let en = start_ts + win;
                        let vwap = self.total_dollar / (self.total_volume as f64);
                        let bar = VwapBar { instrument: instr.clone(), start_ts_ms: start_ts, end_ts_ms: en, vwap, total_volume: self.total_volume, total_dollar: self.total_dollar };
                        out.push(DerivedMarketData::VwapBar(bar));
                    }
                    let en = start_ts + win;
                    self.start_ts_ms = Some(en);
                    self.total_volume = 0;
                    self.total_dollar = 0.0;
                }
            }
        }
    }
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()