//! VolumeProfile 聚合器（按价格桶统计总成交量）
//!
//! 配置建议：
//! - 设置 `spec.window_ms = Some(1000)` 以时间窗口触发；或设置 `spec.min_total_volume = Some(10_000)` 以体量阈值触发。
//! - 两者取或逻辑，满足其一即输出；均未设时每 tick 输出。
//!
//! 后续建议：
//! - 窗口化：支持时间窗口或会话分段的体积分布；在窗口切换时输出快照。
//! - 合并策略：相邻小桶合并、尾部裁剪策略可配置（保留关键结构）。
//! - 输出频率控制：定时或阈值触发快照，避免刷新过频。
//!
use super::TickDerived;
use futures_interfaces::market_data::{DerivedMarketData, VolumeProfileSpec};
use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::derived::{VolumeProfileRow, VolumeProfile};
use std::collections::BTreeMap;
use ordered_float::OrderedFloat;

pub struct VolumeProfileAgg {
    pub spec: VolumeProfileSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    rows: BTreeMap<OrderedFloat<f64>, u64>, // price -> volume
    last_emit_ts_ms: Option<u64>,
    acc_volume_since_emit: u64,
}

impl VolumeProfileAgg {
    pub fn new(spec: VolumeProfileSpec) -> Self {
        Self { spec, start_ts_ms: None, instrument: None, rows: BTreeMap::new(), last_emit_ts_ms: None, acc_volume_since_emit: 0 }
    }
    fn bucket_price(&self, price: f64) -> OrderedFloat<f64> {
        let step = self.spec.price_step.max(super::EPS);
        OrderedFloat((price / step).floor() * step)
    }
    fn trim_rows(&mut self, pivot: OrderedFloat<f64>) {
        while self.rows.len() > super::MAX_BUCKETS_VOLUME_PROFILE {
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

impl TickDerived for VolumeProfileAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            if self.last_emit_ts_ms.is_none() { self.last_emit_ts_ms = Some(tick.ts_ms); }
        }
        let bucket = self.bucket_price(tick.price);
        let entry = self.rows.entry(bucket).or_insert(0u64);
        *entry = entry.saturating_add(tick.volume);
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
            should_emit = true;
        }
        if should_emit {
            let mut rows_vec: Vec<VolumeProfileRow> = Vec::with_capacity(self.rows.len());
            for (p, v) in self.rows.iter() {
                rows_vec.push(VolumeProfileRow { price: p.0, volume: *v });
            }
            let profile = VolumeProfile {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                rows: rows_vec,
            };
            out.push(DerivedMarketData::VolumeProfile(profile));
            self.last_emit_ts_ms = Some(tick.ts_ms);
            self.acc_volume_since_emit = 0;
        }
    }

    fn reset(&mut self) {
        self.start_ts_ms = None;
        self.instrument = None;
        self.rows.clear();
        self.last_emit_ts_ms = None;
        self.acc_volume_since_emit = 0;
    }
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()