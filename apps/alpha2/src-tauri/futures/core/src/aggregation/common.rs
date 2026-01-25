//! 聚合器通用辅助：OHLC 累加器与统一接口/封装

use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::DerivedMarketData;
use futures_interfaces::market_data::derived::{Bar, VolumeBar, TickBar, RangeBar, DollarBar};

/// 统一维护 open/high/low/close，可选择使用回退值读取
pub(crate) struct OhlcAcc {
    pub open: Option<f64>,
    pub high: Option<f64>,
    pub low: Option<f64>,
    pub close: Option<f64>,
}

impl OhlcAcc {
    pub(crate) fn new() -> Self {
        Self { open: None, high: None, low: None, close: None }
    }

    /// 用首个价格初始化 OHLC
    pub(crate) fn init_from_price(&mut self, price: f64) {
        self.open = Some(price);
        self.high = Some(price);
        self.low = Some(price);
        self.close = Some(price);
    }

    /// 更新高低价（不设置收盘）
    pub(crate) fn update_hl(&mut self, price: f64) {
        if let Some(h) = self.high { if price > h { self.high = Some(price); } }
        if let Some(l) = self.low { if price < l { self.low = Some(price); } }
    }

    /// 更新高低并设置收盘价
    pub(crate) fn update_hl_close(&mut self, price: f64) {
        self.update_hl(price);
        self.close = Some(price);
    }

    /// 读取 OHLC，若为 None 则使用提供的回退值
    pub(crate) fn values_or(&self, fallback: f64) -> (f64, f64, f64, f64) {
        (
            self.open.unwrap_or(fallback),
            self.high.unwrap_or(fallback),
            self.low.unwrap_or(fallback),
            self.close.unwrap_or(fallback),
        )
    }
}

// ---- 统一触发接口与输出封装 ----

// 跨聚合器统一的触发接口：根据当前 tick 判断是否达到输出条件
pub trait TriggerCondition {
    fn should_emit(&self, tick: &Tick) -> bool;
}

// 派生数据推送的统一封装
pub trait IntoDerived {
    fn into_derived(self) -> DerivedMarketData;
}

impl IntoDerived for Bar {
    fn into_derived(self) -> DerivedMarketData { DerivedMarketData::Bar(self) }
}
impl IntoDerived for VolumeBar {
    fn into_derived(self) -> DerivedMarketData { DerivedMarketData::VolumeBar(self) }
}
impl IntoDerived for TickBar {
    fn into_derived(self) -> DerivedMarketData { DerivedMarketData::TickBar(self) }
}
impl IntoDerived for RangeBar {
    fn into_derived(self) -> DerivedMarketData { DerivedMarketData::RangeBar(self) }
}
impl IntoDerived for DollarBar {
    fn into_derived(self) -> DerivedMarketData { DerivedMarketData::DollarBar(self) }
}

pub fn push_bar<B: IntoDerived>(out: &mut Vec<DerivedMarketData>, bar: B) {
    out.push(bar.into_derived());
}

// 时间窗对齐辅助：将时间戳对齐到窗口起点
pub fn align_to_window_start(ts_ms: u64, interval_ms: u64) -> u64 {
    (ts_ms / interval_ms) * interval_ms
}

// ---- 具体触发器实现：跨聚合器可复用的条件封装 ----

// 体量触发：累计体量达到目标
pub struct VolumeTrigger {
    pub target_volume: u64,
    pub acc_volume: u64,
}
impl TriggerCondition for VolumeTrigger {
    fn should_emit(&self, _tick: &Tick) -> bool { self.acc_volume >= self.target_volume }
}

// 逐笔触发：累计 tick 数达到目标
pub struct TickTrigger {
    pub target_ticks: u32,
    pub acc_ticks: u32,
}
impl TriggerCondition for TickTrigger {
    fn should_emit(&self, _tick: &Tick) -> bool { self.acc_ticks >= self.target_ticks }
}

// 金额触发：累计美元成交额达到目标
pub struct DollarTrigger {
    pub target_dollar: f64,
    pub acc_dollar: f64,
}
impl TriggerCondition for DollarTrigger {
    fn should_emit(&self, _tick: &Tick) -> bool { self.acc_dollar >= self.target_dollar }
}

// 价格区间触发：相对 open 的绝对变动达到区间大小
pub struct RangeTrigger {
    pub range_size: f64,
    pub open: Option<f64>,
    pub current_price: f64,
}
impl TriggerCondition for RangeTrigger {
    fn should_emit(&self, _tick: &Tick) -> bool {
        match self.open {
            Some(o) => (self.current_price - o).abs() >= self.range_size,
            None => false,
        }
    }
}

// 时间窗口触发：当当前时间戳穿越窗口结束时触发
pub struct WindowEndTrigger {
    pub end_ts_ms: Option<u64>,
    pub current_ts_ms: u64,
}
impl TriggerCondition for WindowEndTrigger {
    fn should_emit(&self, _tick: &Tick) -> bool { match self.end_ts_ms { Some(end) => self.current_ts_ms >= end, None => false } }
}

/// 始终触发：用于锚定型 VWAP 等“每 tick 输出”的场景
pub struct AlwaysTrigger;

impl TriggerCondition for AlwaysTrigger {
    fn should_emit(&self, _tick: &Tick) -> bool { true }
}

/// Renko 触发：价格相对基准 close 超过砖块大小时触发
pub struct RenkoTrigger {
    pub brick_size: f64,
    pub base_close: Option<f64>,
    pub current_price: f64,
}

impl TriggerCondition for RenkoTrigger {
    fn should_emit(&self, _tick: &Tick) -> bool {
        if let Some(base) = self.base_close { (self.current_price - base).abs() >= self.brick_size } else { false }
    }
}

/// 体积或时间窗口触发（二者取或）：用于 VolumeProfile 等按快照输出的聚合器
pub struct WindowOrVolumeTrigger {
    pub window_ms: Option<u64>,
    pub last_emit_ts_ms: Option<u64>,
    pub min_total_volume: Option<u64>,
    pub acc_since_emit: u64,
}

impl TriggerCondition for WindowOrVolumeTrigger {
    fn should_emit(&self, tick: &Tick) -> bool {
        let mut emit = false;
        if let Some(win) = self.window_ms {
            let last = self.last_emit_ts_ms.unwrap_or(tick.ts_ms);
            if tick.ts_ms.saturating_sub(last) >= win { emit = true; }
        }
        if !emit {
            if let Some(min_vol) = self.min_total_volume {
                if self.acc_since_emit >= min_vol { emit = true; }
            }
        }
        if self.window_ms.is_none() && self.min_total_volume.is_none() {
            emit = true;
        }
        emit
    }
}