use super::TickDerived;
use futures_interfaces::market_data::{DerivedMarketData, TimeframeSpec};
use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::derived::Bar;
use chrono::{NaiveDateTime, Utc, DateTime};

pub struct TimeframeBarAgg {
    pub spec: TimeframeSpec,
    current_start_ms: Option<u64>,
    current_end_ms: Option<u64>,
    open: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    close: Option<f64>,
    volume: f64,
    gap_fill_enabled: bool,
    gap_fill_max: Option<usize>,
    time_format_iso: bool,
}

impl TimeframeBarAgg {
    pub fn new(spec: TimeframeSpec) -> Self {
        Self {
            spec,
            current_start_ms: None,
            current_end_ms: None,
            open: None,
            high: None,
            low: None,
            close: None,
            volume: 0.0,
            gap_fill_enabled: false,
            gap_fill_max: None,
            time_format_iso: false,
        }
    }

    fn aligned_start(&self, ts: u64) -> u64 { (ts / self.spec.interval_ms) * self.spec.interval_ms }
    pub fn enable_gap_fill(&mut self, enabled: bool) { self.gap_fill_enabled = enabled; }
    pub fn set_gap_fill_max(&mut self, max: Option<usize>) { self.gap_fill_max = max; }
    pub fn set_time_format_iso(&mut self, enabled: bool) { self.time_format_iso = enabled; }

    fn time_label(&self, ts_ms: u64) -> String {
        if self.time_format_iso {
            if let Some(naive) = NaiveDateTime::from_timestamp_millis(ts_ms as i64) {
                let dt: DateTime<Utc> = DateTime::<Utc>::from_utc(naive, Utc);
                dt.to_rfc3339()
            } else { format!("{}", ts_ms) }
        } else { format!("{}", ts_ms) }
    }
}

impl TickDerived for TimeframeBarAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        let iv = self.spec.interval_ms;
        if self.current_start_ms.is_none() {
            let start = if self.spec.align_to_start { self.aligned_start(tick.ts_ms) } else { tick.ts_ms };
            self.current_start_ms = Some(start);
            self.current_end_ms = Some(start + iv);
            self.open = Some(tick.price);
            self.high = Some(tick.price);
            self.low = Some(tick.price);
            self.close = Some(tick.price);
            self.volume = tick.volume as f64;
            return;
        }
        let end = self.current_end_ms.unwrap();
        if tick.ts_ms < end {
            if let Some(h) = self.high { if tick.price > h { self.high = Some(tick.price); } }
            if let Some(l) = self.low { if tick.price < l { self.low = Some(tick.price); } }
            self.close = Some(tick.price);
            self.volume += tick.volume as f64;
            return;
        } else {
            let bar = Bar {
                time: self.time_label(end),
                open: self.open.unwrap_or(tick.price),
                high: self.high.unwrap_or(tick.price),
                low: self.low.unwrap_or(tick.price),
                close: self.close.unwrap_or(tick.price),
                volume: self.volume,
            };
            out.push(DerivedMarketData::Bar(bar));
            if self.gap_fill_enabled {
                let mut next_start = end;
                let last_close = self.close.unwrap_or(tick.price);
                let mut filled: usize = 0;
                while tick.ts_ms >= next_start + iv {
                    if let Some(max) = self.gap_fill_max { if filled >= max { break; } }
                    let next_end = next_start + iv;
                    let gap_bar = Bar { time: self.time_label(next_end), open: last_close, high: last_close, low: last_close, close: last_close, volume: 0.0 };
                    out.push(DerivedMarketData::Bar(gap_bar));
                    next_start = next_end;
                    filled += 1;
                }
                self.current_start_ms = Some(next_start);
                self.current_end_ms = Some(next_start + iv);
            } else {
                let new_start = if self.spec.align_to_start { self.aligned_start(tick.ts_ms) } else { end };
                self.current_start_ms = Some(new_start);
                self.current_end_ms = Some(new_start + iv);
            }
            self.open = Some(tick.price);
            self.high = Some(tick.price);
            self.low = Some(tick.price);
            self.close = Some(tick.price);
            self.volume = tick.volume as f64;
            return;
        }
    }
    fn reset(&mut self) {}
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()