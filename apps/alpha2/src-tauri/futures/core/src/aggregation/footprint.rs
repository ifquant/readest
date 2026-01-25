//! Footprint 聚合器（按价格桶统计买卖量）
//!
//! 配置建议：
//! - 若希望按时间触发，设置 `spec.window_ms = Some(1000)`（每 1 秒输出）。
//! - 若希望按成交量触发，设置 `spec.min_total_volume = Some(10_000)`（累计 1 万手输出）。
//! - 两者皆设时，任一条件满足即输出；均未设时按每 tick 输出（保持兼容）。
//!
//! 后续建议：
//! - 输出频率：支持定时/定笔数输出快照，避免每 tick 输出造成过载。
//! - 分桶合并：对稀疏小桶进行合并或降采样，进一步提升性能与可读性。
//! - 会话复位：提供会话边界的清理/归零选项，便于分段分析。
//!
use super::TickDerived;
use futures_interfaces::market_data::{DerivedMarketData, FootprintSpec};
use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::derived::{FootprintRow, FootprintBar};
use std::collections::BTreeMap;
use ordered_float::OrderedFloat;

pub struct FootprintAgg {
    pub spec: FootprintSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    last_price: Option<f64>,
    rows: BTreeMap<OrderedFloat<f64>, (u64, u64)>, // price -> (bid_volume, ask_volume)
    last_emit_ts_ms: Option<u64>,
    acc_volume_since_emit: u64,
}

impl FootprintAgg {
    pub fn new(spec: FootprintSpec) -> Self {
        Self { spec, start_ts_ms: None, instrument: None, last_price: None, rows: BTreeMap::new(), last_emit_ts_ms: None, acc_volume_since_emit: 0 }
    }
    fn bucket_price(&self, price: f64) -> OrderedFloat<f64> {
        // 数值稳定：price_step 不得为 0，向下取整到分桶边界
        let step = self.spec.price_step.max(super::EPS);
        OrderedFloat((price / step).floor() * step)
    }
    fn trim_rows(&mut self, pivot: OrderedFloat<f64>) {
        // 内存保护：限制分桶数量，优先保留靠近当前价格的桶，裁剪远端。
        while self.rows.len() > super::MAX_BUCKETS_FOOTPRINT {
            // BTreeMap 有序：首尾为最远端，按与 pivot 的距离裁剪
            let first_key = self.rows.keys().next().copied();
            let last_key = self.rows.keys().next_back().copied();
            if let (Some(f), Some(l)) = (first_key, last_key) {
                let df = (f.0 - pivot.0).abs();
                let dl = (l.0 - pivot.0).abs();
                if df >= dl { self.rows.remove(&f); } else { self.rows.remove(&l); }
            } else { break; }
        }
    }
}

impl TickDerived for FootprintAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.last_price = Some(tick.price);
            if self.last_emit_ts_ms.is_none() { self.last_emit_ts_ms = Some(tick.ts_ms); }
        }
        let bucket = self.bucket_price(tick.price);
        let is_ask = match self.last_price { Some(lp) => tick.price >= lp, None => true };
        let entry = self.rows.entry(bucket).or_insert((0u64, 0u64));
        if is_ask { entry.1 = entry.1.saturating_add(tick.volume); } else { entry.0 = entry.0.saturating_add(tick.volume); }
        self.last_price = Some(tick.price);
        // 分桶裁剪
        self.trim_rows(bucket);
        // 输出频率控制：时间窗口与最小体量阈值（任一满足触发），否则保持每 tick 兼容行为
        self.acc_volume_since_emit = self.acc_volume_since_emit.saturating_add(tick.volume);
        let mut should_emit = false;
        if let Some(window) = self.spec.window_ms {
            let last = self.last_emit_ts_ms.unwrap_or(tick.ts_ms);
            if tick.ts_ms.saturating_sub(last) >= window { should_emit = true; }
        }
        if !should_emit {
            if let Some(min_vol) = self.spec.min_total_volume {
                if self.acc_volume_since_emit >= min_vol { should_emit = true; }
            }
        }
        if self.spec.window_ms.is_none() && self.spec.min_total_volume.is_none() {
            // 未配置窗口或阈值时，保持原行为：每 tick 输出
            should_emit = true;
        }
        if should_emit {
            let mut rows_vec: Vec<FootprintRow> = Vec::with_capacity(self.rows.len());
            for (p, (bid_v, ask_v)) in self.rows.iter() {
                rows_vec.push(FootprintRow { price: p.0, bid_volume: *bid_v, ask_volume: *ask_v });
            }
            let bar = FootprintBar {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                rows: rows_vec,
            };
            out.push(DerivedMarketData::Footprint(bar));
            self.last_emit_ts_ms = Some(tick.ts_ms);
            self.acc_volume_since_emit = 0;
        }
    }

    fn reset(&mut self) {
        self.start_ts_ms = None;
        self.instrument = None;
        self.last_price = None;
        self.rows.clear();
        self.last_emit_ts_ms = None;
        self.acc_volume_since_emit = 0;
    }
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()