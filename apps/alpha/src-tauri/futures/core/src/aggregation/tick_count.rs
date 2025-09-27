use super::TickDerived;
use futures_interfaces::market_data::{DerivedMarketData, TickBarSpec};
use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::derived::TickBar;

pub struct TickCountAgg {
    pub spec: TickBarSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    open: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    close: Option<f64>,
    acc_ticks: u32,
    acc_volume: u64,
}

impl TickCountAgg {
    pub fn new(spec: TickBarSpec) -> Self {
        Self { spec, start_ts_ms: None, instrument: None, open: None, high: None, low: None, close: None, acc_ticks: 0, acc_volume: 0 }
    }
}

impl TickDerived for TickCountAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.open = Some(tick.price);
            self.high = Some(tick.price);
            self.low = Some(tick.price);
            self.close = Some(tick.price);
            self.acc_ticks = 0;
            self.acc_volume = 0;
        }
        if let Some(h) = self.high { if tick.price > h { self.high = Some(tick.price); } }
        if let Some(l) = self.low { if tick.price < l { self.low = Some(tick.price); } }
        self.close = Some(tick.price);
        self.acc_ticks += 1;
        self.acc_volume += tick.volume;

        if self.acc_ticks >= self.spec.ticks {
            let bar = TickBar { instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()), start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms), end_ts_ms: tick.ts_ms, ticks: self.spec.ticks, open: self.open.unwrap_or(tick.price), high: self.high.unwrap_or(tick.price), low: self.low.unwrap_or(tick.price), close: self.close.unwrap_or(tick.price), volume: self.acc_volume };
            out.push(DerivedMarketData::TickBar(bar));
            self.start_ts_ms = Some(tick.ts_ms);
            self.open = Some(tick.price);
            self.high = Some(tick.price);
            self.low = Some(tick.price);
            self.close = Some(tick.price);
            self.acc_ticks = 0;
            self.acc_volume = 0;
        }
    }
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()