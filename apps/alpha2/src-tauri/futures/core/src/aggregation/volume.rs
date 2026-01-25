use super::TickDerived;
use futures_interfaces::market_data::{DerivedMarketData, VolumeSpec};
use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::derived::VolumeBar;
use super::common::{OhlcAcc, push_bar, TriggerCondition, VolumeTrigger};

pub struct VolumeBarAgg {
    pub spec: VolumeSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    ohlc: OhlcAcc,
    acc_volume: u64,
    // 触发器：体量达到目标时输出
    trigger: VolumeTrigger,
}

impl VolumeBarAgg {
    pub fn new(spec: VolumeSpec) -> Self {
        let target_volume = spec.target_volume;
        Self { spec, start_ts_ms: None, instrument: None, ohlc: OhlcAcc::new(), acc_volume: 0, trigger: VolumeTrigger { target_volume, acc_volume: 0 } }
    }
}

impl TickDerived for VolumeBarAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.ohlc.init_from_price(tick.price);
            self.acc_volume = 0;
        }
        self.ohlc.update_hl_close(tick.price);
        self.acc_volume += tick.volume;

        // 更新触发器状态并判定是否触发输出
        self.trigger.acc_volume = self.acc_volume;
        if self.trigger.should_emit(tick) {
            let (open, high, low, close) = self.ohlc.values_or(tick.price);
            let bar = VolumeBar { instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()), start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms), end_ts_ms: tick.ts_ms, target_volume: self.spec.target_volume, actual_volume: self.acc_volume, open, high, low, close };
            push_bar(out, bar);
            self.start_ts_ms = Some(tick.ts_ms);
            self.ohlc.init_from_price(tick.price);
            self.acc_volume = 0;
            self.trigger.acc_volume = 0;
        }
    }
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()