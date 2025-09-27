use serde::{Deserialize, Serialize};
use crate::InstrumentId;

// K 线（时间聚合的蜡烛图）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bar {
    pub time: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

/// 等量线（按固定成交量聚合）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeBar {
    pub instrument: InstrumentId,
    pub start_ts_ms: u64,
    pub end_ts_ms: u64,
    pub target_volume: u64,
    pub actual_volume: u64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
}

/// 等笔数线（按固定 tick 数聚合）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TickBar {
    pub instrument: InstrumentId,
    pub start_ts_ms: u64,
    pub end_ts_ms: u64,
    pub ticks: u32,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: u64,
}

/// 区间线（价格振幅达到固定区间即可成线）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RangeBar {
    pub instrument: InstrumentId,
    pub start_ts_ms: u64,
    pub end_ts_ms: u64,
    pub range_size: f64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: u64,
}

/// Renko 砖（价格按固定砖高变动时生成）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenkoBrick {
    pub instrument: InstrumentId,
    pub brick_size: f64,
    pub direction: RenkoDirection,
    pub open: f64,
    pub close: f64,
    pub start_ts_ms: u64,
    pub end_ts_ms: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum RenkoDirection {
    Up,
    Down,
}

/// OX 点数图（Point & Figure）配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PnfSettings {
    pub box_size: f64,
    pub reversal_boxes: u32,
}

/// 点数图的一个格子（X 代表上涨，O 代表下跌）
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum PnfMark {
    X,
    O,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PnfBox {
    pub top: f64,
    pub bottom: f64,
    pub mark: PnfMark,
}

/// 点数图的一列（同方向的连续格子）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PnfColumn {
    pub instrument: InstrumentId,
    pub index: u32,
    pub mark: PnfMark,
    pub boxes: Vec<PnfBox>,
    pub start_ts_ms: u64,
    pub end_ts_ms: u64,
}

/// Heikin-Ashi 平滑蜡烛
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeikinAshiBar {
    pub instrument: InstrumentId,
    pub ts_ms: u64,
    pub ha_open: f64,
    pub ha_high: f64,
    pub ha_low: f64,
    pub ha_close: f64,
    pub orig_open: Option<f64>,
    pub orig_high: Option<f64>,
    pub orig_low: Option<f64>,
    pub orig_close: Option<f64>,
}

// ---- 微结构与成交分布 ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FootprintRow {
    pub price: f64,
    pub bid_volume: u64,
    pub ask_volume: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FootprintBar {
    pub instrument: InstrumentId,
    pub start_ts_ms: u64,
    pub end_ts_ms: u64,
    pub rows: Vec<FootprintRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeProfileRow {
    pub price: f64,
    pub volume: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeProfile {
    pub instrument: InstrumentId,
    pub start_ts_ms: u64,
    pub end_ts_ms: u64,
    pub rows: Vec<VolumeProfileRow>,
}

// 市场画像（TPO，简化为价格处的出现次数）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TpoRow {
    pub price: f64,
    pub tpo_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TpoProfile {
    pub instrument: InstrumentId,
    pub start_ts_ms: u64,
    pub end_ts_ms: u64,
    pub rows: Vec<TpoRow>,
}

// ---- 替代聚合：美元/不平衡/delta/VWAP ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DollarBar {
    pub instrument: InstrumentId,
    pub start_ts_ms: u64,
    pub end_ts_ms: u64,
    pub target_dollar: f64,
    pub actual_dollar: f64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImbalanceBar {
    pub instrument: InstrumentId,
    pub start_ts_ms: u64,
    pub end_ts_ms: u64,
    pub threshold: f64,
    pub buy_volume: u64,
    pub sell_volume: u64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeltaBar {
    pub instrument: InstrumentId,
    pub start_ts_ms: u64,
    pub end_ts_ms: u64,
    pub delta: i64,
    pub open: f64,
    pub close: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VwapBar {
    pub instrument: InstrumentId,
    pub start_ts_ms: u64,
    pub end_ts_ms: u64,
    pub vwap: f64,
    pub total_volume: u64,
    pub total_dollar: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidTick {
    pub instrument: InstrumentId,
    pub mid: f64,
    pub ts_ms: u64,
}

// ---- Kagi 与三线反转 ----

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum KagiDirection {
    Up,
    Down,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KagiSegment {
    pub instrument: InstrumentId,
    pub direction: KagiDirection,
    pub start_price: f64,
    pub end_price: f64,
    pub start_ts_ms: u64,
    pub end_ts_ms: u64,
    pub reversal_amount: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum TlbDirection {
    Up,
    Down,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreeLineBreakLine {
    pub instrument: InstrumentId,
    pub direction: TlbDirection,
    pub price: f64,
    pub ts_ms: u64,
}