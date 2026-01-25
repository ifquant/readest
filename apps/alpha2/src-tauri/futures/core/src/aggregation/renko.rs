use super::TickDerived;
use super::common::{TriggerCondition, RenkoTrigger};
use futures_interfaces::market_data::{DerivedMarketData, RenkoSpec};
use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::derived::{RenkoBrick, RenkoDirection};

pub struct RenkoBrickAgg {
    pub spec: RenkoSpec,
    base_close: Option<f64>,
    pending_start_ts: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    up_streak: u64,
    down_streak: u64,
    last_dir: Option<RenkoDirection>,
    // 触发器：价格相对基准 close 超过砖块大小时触发
    trigger: RenkoTrigger,
}

impl RenkoBrickAgg {
    pub fn new(spec: RenkoSpec) -> Self {
        let trigger = RenkoTrigger { brick_size: spec.brick_size, base_close: None, current_price: 0.0 };
        Self { spec, base_close: None, pending_start_ts: None, instrument: None, up_streak: 0, down_streak: 0, last_dir: None, trigger }
    }
    pub fn up_streak(&self) -> u64 { self.up_streak }
    pub fn down_streak(&self) -> u64 { self.down_streak }
    pub fn last_direction(&self) -> Option<RenkoDirection> { self.last_dir }
    fn update_streak(&mut self, dir: RenkoDirection) {
        match (self.last_dir, dir) {
            (Some(RenkoDirection::Up), RenkoDirection::Up) => { self.up_streak += 1; self.down_streak = 0; }
            (Some(RenkoDirection::Down), RenkoDirection::Down) => { self.down_streak += 1; self.up_streak = 0; }
            (_, RenkoDirection::Up) => { self.up_streak = 1; self.down_streak = 0; }
            (_, RenkoDirection::Down) => { self.down_streak = 1; self.up_streak = 0; }
        }
        self.last_dir = Some(dir);
    }
}

impl TickDerived for RenkoBrickAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        let brick_size = self.spec.brick_size;
        if self.base_close.is_none() {
            self.base_close = Some(tick.price);
            self.trigger.base_close = Some(tick.price);
            self.pending_start_ts = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            return;
        }
        let mut cur_base = self.base_close.unwrap();
        let start_ts = self.pending_start_ts.unwrap_or(tick.ts_ms);
        let instr = self.instrument.clone().unwrap_or(tick.instrument.clone());
        // 更新触发器当前价格
        self.trigger.current_price = tick.price;
        // 使用触发器判定是否达到至少一个砖块的跨越
        let crossed = self.trigger.should_emit(tick);
        if crossed && tick.price > cur_base {
            let steps = ((tick.price - cur_base) / brick_size).floor() as i64;
            for _ in 0..steps {
                let brick = RenkoBrick { instrument: instr.clone(), brick_size, direction: RenkoDirection::Up, open: cur_base, close: cur_base + brick_size, start_ts_ms: start_ts, end_ts_ms: tick.ts_ms };
                out.push(DerivedMarketData::RenkoBrick(brick));
                cur_base += brick_size;
                self.update_streak(RenkoDirection::Up);
            }
            if steps > 0 { self.base_close = Some(cur_base); }
            self.trigger.base_close = Some(cur_base);
        } else if crossed && tick.price < cur_base {
            let steps = ((cur_base - tick.price) / brick_size).floor() as i64;
            for _ in 0..steps {
                let brick = RenkoBrick { instrument: instr.clone(), brick_size, direction: RenkoDirection::Down, open: cur_base, close: cur_base - brick_size, start_ts_ms: start_ts, end_ts_ms: tick.ts_ms };
                out.push(DerivedMarketData::RenkoBrick(brick));
                cur_base -= brick_size;
                self.update_streak(RenkoDirection::Down);
            }
            if steps > 0 { self.base_close = Some(cur_base); }
            self.trigger.base_close = Some(cur_base);
        }
        self.pending_start_ts = Some(tick.ts_ms);
    }
    fn reset(&mut self) {
        self.base_close = None;
        self.pending_start_ts = None;
        self.instrument = None;
        self.up_streak = 0;
        self.down_streak = 0;
        self.last_dir = None;
    }
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()