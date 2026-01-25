//! 后续建议：
//! - 动态 N：支持根据波动度动态调整 N（Lines），提升适应性。
//! - 等价价格处理：严格使用 `EPS` 并提供可配置边界策略，避免假突破。
//! - 去抖与限速：在剧烈波动中控制输出频率与去重，稳定可视化。
//!
use super::TickDerived;
use futures_interfaces::market_data::{DerivedMarketData, ThreeLineBreakSpec};
use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::derived::{ThreeLineBreakLine, TlbDirection};

pub struct ThreeLineBreakAgg {
    pub spec: ThreeLineBreakSpec,
    instrument: Option<futures_interfaces::InstrumentId>,
    lines: Vec<ThreeLineBreakLine>,
}

impl ThreeLineBreakAgg {
    pub fn new(spec: ThreeLineBreakSpec) -> Self { Self { spec, instrument: None, lines: Vec::new() } }
    fn max_min_last_n(&self) -> Option<(f64, f64)> {
        let n = self.spec.lines as usize;
        if self.lines.is_empty() { return None; }
        let mut max_p = f64::NEG_INFINITY;
        let mut min_p = f64::INFINITY;
        for line in self.lines.iter().rev().take(n) {
            if line.price > max_p { max_p = line.price; }
            if line.price < min_p { min_p = line.price; }
        }
        Some((max_p, min_p))
    }
}

impl TickDerived for ThreeLineBreakAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.instrument.is_none() { self.instrument = Some(tick.instrument.clone()); }
        if self.lines.is_empty() {
            let first = ThreeLineBreakLine { instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()), direction: TlbDirection::Up, price: tick.price, ts_ms: tick.ts_ms };
            self.lines.push(first.clone());
            out.push(DerivedMarketData::ThreeLineBreak(first));
            return;
        }
        if let Some((max_p, min_p)) = self.max_min_last_n() {
            if tick.price > max_p { // 向上突破：生成上行线
                let line = ThreeLineBreakLine { instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()), direction: TlbDirection::Up, price: tick.price, ts_ms: tick.ts_ms };
                self.lines.push(line.clone());
                out.push(DerivedMarketData::ThreeLineBreak(line));
            } else if tick.price < min_p { // 向下突破：生成下行线
                let line = ThreeLineBreakLine { instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()), direction: TlbDirection::Down, price: tick.price, ts_ms: tick.ts_ms };
                self.lines.push(line.clone());
                out.push(DerivedMarketData::ThreeLineBreak(line));
            }
        }
    }

    fn reset(&mut self) {
        self.instrument = None;
        self.lines.clear();
    }
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()