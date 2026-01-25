use serde::{Deserialize, Serialize};

pub mod raw;
pub mod derived;

pub use raw::*;
pub use derived::*;

/// 原始市场数据统一枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RawMarketData {
    Tick(Tick),
    Quote(Quote),
    Trade(Trade),
    OrderBook(OrderBook),
}

/// 程序加工后的派生数据统一枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DerivedMarketData {
    Bar(Bar),
    VolumeBar(VolumeBar),
    TickBar(TickBar),
    RangeBar(RangeBar),
    RenkoBrick(RenkoBrick),
    HeikinAshi(HeikinAshiBar),
    PointAndFigure(PnfColumn),
    Footprint(FootprintBar),
    DollarBar(DollarBar),
    ImbalanceBar(ImbalanceBar),
    DeltaBar(DeltaBar),
    VwapBar(VwapBar),
    VolumeProfile(VolumeProfile),
    TpoProfile(TpoProfile),
    Kagi(KagiSegment),
    ThreeLineBreak(ThreeLineBreakLine),
    MidTick(MidTick),
}

/// 顶层统一枚举，显式区分原始与派生
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MarketData {
    Raw(RawMarketData),
    Derived(DerivedMarketData),
}

// ---- 统一聚合规格（Spec）定义 ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeframeSpec {
    pub interval_ms: u64,
    pub align_to_start: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeSpec {
    pub target_volume: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TickBarSpec {
    pub ticks: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RangeSpec {
    pub range_size: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenkoSpec {
    pub brick_size: f64,
    pub use_wick: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DollarSpec {
    pub target_dollar: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImbalanceSpec {
    pub threshold: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeltaSpec {
    /// 使用建议：
    /// - 若需要在馈送间隙保持时间序列完整，建议：`window_ms = Some(1000)`, `gap_fill_enabled = true`, `gap_fill_max = Some(30)`。
    /// - 与 `min_abs_delta` 同时设置时，任一条件满足都会触发输出；补齐仅在“按窗口触发且该窗口无成交”时生效。
    /// - 为避免输出过载，请将 `gap_fill_max` 控制在 10–50；窗口较小（< 1s）时可适当降低。
    pub window_ms: Option<u64>,
    pub min_abs_delta: Option<i64>,
    /// 多窗口补齐：当一个 tick 跨越多个 `window_ms` 窗口边界时，是否补齐中间快照。
    /// 开启后，会为每个被跨越但没有成交的数据窗口输出一条“空快照”以保持时间序列连续性。
    /// 这些快照的 `delta` 为 0，`open/close` 使用最近价，`start/end` 对齐到窗口边界。
    /// 注意：补齐快照不分摊实际成交量，仅用于时间线完整性。
    pub gap_fill_enabled: bool,
    /// 多窗口补齐的最大数量上限。用于限制一次跨越过多窗口时的补齐条数，避免输出过载。
    /// `None` 表示不限制；建议设置为 10～50 之间的适中值。
    pub gap_fill_max: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VwapSpec {
    /// 使用建议：
    /// - `anchored = false` 时按时间窗口输出，可配合 `gap_fill_enabled` 在馈送间隙补齐空快照；推荐：`window_ms = Some(1000)`, `gap_fill_enabled = true`, `gap_fill_max = Some(30)`。
    /// - `anchored = true` 时每 tick 输出累计 VWAP，不进行补齐。
    /// - 空快照的 `vwap` 使用最近价，`total_volume = 0`, `total_dollar = 0.0`，用于维持时间线完整。
    pub window_ms: Option<u64>,
    pub anchored: bool,
    /// 多窗口补齐：仅在 `anchored = false`（按时间窗口输出）时生效。
    /// 当一个 tick 跨越多个 `window_ms` 窗口边界时，是否补齐中间快照。
    /// 开启后，会为每个被跨越但没有成交的数据窗口输出一条“空快照”，其 `total_volume=0`、`total_dollar=0`，
    /// `vwap` 使用最近价以表示“无成交下的持平快照”。
    pub gap_fill_enabled: bool,
    /// 多窗口补齐的最大数量上限。`None` 表示不限制；建议设置为 10～50。
    pub gap_fill_max: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FootprintSpec {
    pub price_step: f64,
    /// 控制输出频率的时间窗口（毫秒）。示例：`Some(1000)` 每 1 秒触发一次。
    pub window_ms: Option<u64>,
    /// 控制输出频率的最小总成交量阈值。示例：`Some(10_000)` 达到 1 万手后触发。
    /// 与 `window_ms` 同时设置时，任一条件满足即立刻输出；两者都未设置时按每 tick 输出。
    pub min_total_volume: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeProfileSpec {
    pub price_step: f64,
    /// 控制输出频率的时间窗口（毫秒）。示例：`Some(1000)` 每 1 秒触发一次。
    pub window_ms: Option<u64>,
    /// 控制输出频率的最小总成交量阈值。示例：`Some(10_000)` 达到 1 万手后触发。
    /// 与 `window_ms` 同时设置时，任一条件满足即立刻输出；两者都未设置时按每 tick 输出。
    pub min_total_volume: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TpoSpec {
    pub price_step: f64,
    /// 控制输出频率的时间窗口（毫秒）。示例：`Some(1000)` 每 1 秒触发一次。
    pub window_ms: Option<u64>,
    /// 控制输出频率的最小 TPO 计数阈值。示例：`Some(50)` 累计 50 个 TPO 后触发。
    /// 与 `window_ms` 同时设置时，任一条件满足即立刻输出；两者都未设置时按每 tick 输出。
    pub min_total_tpo: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KagiSpec {
    pub reversal_amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreeLineBreakSpec {
    pub lines: u32,
}

/// 统一的聚合规格枚举，实现管线配置的通用载体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MarketDataSpec {
    Timeframe(TimeframeSpec),
    Volume(VolumeSpec),
    TickCount(TickBarSpec),
    Range(RangeSpec),
    Renko(RenkoSpec),
    Dollar(DollarSpec),
    Imbalance(ImbalanceSpec),
    Delta(DeltaSpec),
    Vwap(VwapSpec),
    Footprint(FootprintSpec),
    VolumeProfile(VolumeProfileSpec),
    Tpo(TpoSpec),
    Pnf(PnfSettings),
    Kagi(KagiSpec),
    ThreeLineBreak(ThreeLineBreakSpec),
}