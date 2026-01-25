//! Delta 聚合器（买卖差值）
//!
//! 概述：
//! - 通过简单归因（如 uptick/downtick）累积买量与卖量，`delta = buy - sell`。
//! - 支持时间窗口输出与绝对 delta 阈值触发；在空窗口跨越时可 gap fill 补齐快照。
//!
//! 设计提示（来自旧版注释，总结保留）：
//! - 成交方向归因可进一步提升准确性（替换为更稳健的微结构判定）。
//! - 触发策略：时间/阈值/复合条件的权衡与可配置化。
//! - 平滑与降噪：可考虑引入 EMA/阈值滤波等以降低高频噪声影响。
//!
use super::TickDerived;
use futures_interfaces::market_data::{DerivedMarketData, DeltaSpec};
use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::derived::DeltaBar;

pub struct DeltaAgg {
    pub spec: DeltaSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    open: Option<f64>,
    close: Option<f64>,
    last_price: Option<f64>,
    buy_volume: u64,
    sell_volume: u64,
}

impl DeltaAgg {
    pub fn new(spec: DeltaSpec) -> Self {
        Self { spec, start_ts_ms: None, instrument: None, open: None, close: None, last_price: None, buy_volume: 0, sell_volume: 0 }
    }
}

impl TickDerived for DeltaAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        // 初始化窗口与方向参考价
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.open = Some(tick.price);
            self.close = Some(tick.price);
            self.last_price = Some(tick.price);
            self.buy_volume = 0;
            self.sell_volume = 0;
        }
        // 简单的买卖归因（可替换为更准确的成交方向判定）。
        let is_ask = match self.last_price { Some(lp) => tick.price >= lp, None => true };
        if is_ask { self.buy_volume = self.buy_volume.saturating_add(tick.volume); } else { self.sell_volume = self.sell_volume.saturating_add(tick.volume); }
        self.close = Some(tick.price);
        self.last_price = Some(tick.price);

        let delta = (self.buy_volume as i64) - (self.sell_volume as i64);
        // 时间窗口触发：当 tick 穿越窗口边界时输出；支持在无成交的多窗口跨越下补齐“空快照”。
        let (win_ms, start_ts) = match (self.spec.window_ms, self.start_ts_ms) { (Some(w), Some(s)) => (Some(w), Some(s)), _ => (None, None) };
        let should_emit_by_window = match (win_ms, start_ts) { (Some(w), Some(s)) => tick.ts_ms >= s + w, _ => false };
        let should_emit_by_delta = match self.spec.min_abs_delta { Some(min) => delta.abs() >= min, None => false };

        if should_emit_by_window {
            let s = start_ts.unwrap_or(tick.ts_ms);
            let w = win_ms.unwrap();
            let crosses = ((tick.ts_ms.saturating_sub(s)) / w) as usize; // 跨越的窗口数
            // 若本窗口内没有任何成交（delta==0）且启用补齐，则补齐最多 gap_fill_max 条空快照，窗口边界对齐。
            if delta == 0 && self.spec.gap_fill_enabled && crosses >= 1 {
                let max_fill = self.spec.gap_fill_max.map(|v| v as usize).unwrap_or(usize::MAX);
                let fill_count = crosses.min(max_fill);
                let px = self.last_price.unwrap_or(tick.price);
                let instr = self.instrument.clone().unwrap_or(tick.instrument.clone());
                for i in 0..fill_count {
                    let st = s + (i as u64) * w;
                    let en = st + w;
                    let bar = DeltaBar { instrument: instr.clone(), start_ts_ms: st, end_ts_ms: en, delta: 0, open: px, close: px };
                    out.push(DerivedMarketData::DeltaBar(bar));
                }
                // 补齐后滚动到当前 tick 作为新窗口起点
                self.start_ts_ms = Some(tick.ts_ms);
                self.open = Some(tick.price);
                self.close = Some(tick.price);
                self.buy_volume = 0;
                self.sell_volume = 0;
            } else {
                // 正常输出当前窗口快照（将结束时间对齐到窗口边界）
                let s = self.start_ts_ms.unwrap_or(tick.ts_ms);
                let w = self.spec.window_ms.unwrap_or(0);
                let en = s + w;
                let bar = DeltaBar {
                    instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                    start_ts_ms: s,
                    end_ts_ms: en,
                    delta,
                    open: self.open.unwrap_or(tick.price),
                    close: self.close.unwrap_or(tick.price),
                };
                out.push(DerivedMarketData::DeltaBar(bar));
                // 重置窗口：将起点滚动到边界，清零买卖体量
                self.start_ts_ms = Some(en);
                self.open = Some(tick.price);
                self.close = Some(tick.price);
                self.buy_volume = 0;
                self.sell_volume = 0;
            }
        } else if should_emit_by_delta {
            // 仅阈值触发下的输出（不涉及多窗口补齐）
            let bar = DeltaBar {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                delta,
                open: self.open.unwrap_or(tick.price),
                close: self.close.unwrap_or(tick.price),
            };
            out.push(DerivedMarketData::DeltaBar(bar));
            self.start_ts_ms = Some(tick.ts_ms);
            self.open = Some(tick.price);
            self.close = Some(tick.price);
            self.buy_volume = 0;
            self.sell_volume = 0;
        }
    }

    fn reset(&mut self) {
        self.start_ts_ms = None;
        self.instrument = None;
        self.open = None;
        self.close = None;
        self.last_price = None;
        self.buy_volume = 0;
        self.sell_volume = 0;
    }
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner从spec 直接调用 new()