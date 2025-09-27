use serde::{Deserialize, Serialize};
use crate::{InstrumentId, Side};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tick {
    pub instrument: InstrumentId,
    pub price: f64,
    pub volume: u64,
    pub ts_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Quote {
    pub instrument: InstrumentId,
    pub bid_price: f64,
    pub bid_qty: u64,
    pub ask_price: f64,
    pub ask_qty: u64,
    pub ts_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trade {
    pub instrument: InstrumentId,
    pub price: f64,
    pub qty: u64,
    pub side: Side,
    pub ts_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepthEntry {
    pub price: f64,
    pub qty: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderBook {
    pub instrument: InstrumentId,
    pub ts_ms: u64,
    pub bids: Vec<DepthEntry>,
    pub asks: Vec<DepthEntry>,
}