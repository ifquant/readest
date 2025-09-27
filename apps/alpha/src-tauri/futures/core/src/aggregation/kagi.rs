//! 后续建议：
//! - 粗细（yin/yang）规则：根据突破/回撤扩展粗线细线绘制语义，便于图形层表现。
//! - 会话/锚点：提供复位或锚定段起点的选项，支持分段绘制。
//! - 多步反转：在大跳跃下，按固定步长输出多个段以保持对齐一致。
//!
use super::TickDerived;
use futures_interfaces::market_data::{DerivedMarketData, KagiSpec};
use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::derived::{KagiSegment, KagiDirection};

pub struct KagiAgg {
    pub spec: KagiSpec,
    instrument: Option<futures_interfaces::InstrumentId>,
    start_ts_ms: Option<u64>,
    current_dir: Option<KagiDirection>,
    seg_start_price: Option<f64>,
    seg_extreme_price: Option<f64>,
}

impl KagiAgg {
    pub fn new(spec: KagiSpec) -> Self {
        Self { spec, instrument: None, start_ts_ms: None, current_dir: None, seg_start_price: None, seg_extreme_price: None }
    }
}

impl TickDerived for KagiAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.seg_start_price = Some(tick.price);
            self.seg_extreme_price = Some(tick.price);
            self.current_dir = None;
            return;
        }

        let rev = self.spec.reversal_amount.max(super::EPS);
        let start_price = self.seg_start_price.unwrap_or(tick.price);
        let extreme = self.seg_extreme_price.unwrap_or(tick.price);

        match self.current_dir {
            None => {
                if tick.price >= start_price + rev {
                    self.current_dir = Some(KagiDirection::Up);
                    self.seg_extreme_price = Some(tick.price.max(extreme));
                } else if tick.price <= start_price - rev {
                    self.current_dir = Some(KagiDirection::Down);
                    self.seg_extreme_price = Some(tick.price.min(extreme));
                }
            }
            Some(KagiDirection::Up) => {
                if tick.price >= extreme {
                    self.seg_extreme_price = Some(tick.price);
                } else if tick.price <= extreme - rev {
                    // 反转：输出上升段
                    let seg = KagiSegment {
                        instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                        direction: KagiDirection::Up,
                        start_price,
                        end_price: extreme,
                        start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                        end_ts_ms: tick.ts_ms,
                        reversal_amount: rev,
                    };
                    out.push(DerivedMarketData::Kagi(seg));
                    // 开启下降段
                    self.current_dir = Some(KagiDirection::Down);
                    self.seg_start_price = Some(extreme);
                    self.seg_extreme_price = Some(tick.price);
                    self.start_ts_ms = Some(tick.ts_ms);
                }
            }
            Some(KagiDirection::Down) => {
                if tick.price <= extreme {
                    self.seg_extreme_price = Some(tick.price);
                } else if tick.price >= extreme + rev {
                    // 反转：输出下降段
                    let seg = KagiSegment {
                        instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                        direction: KagiDirection::Down,
                        start_price,
                        end_price: extreme,
                        start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                        end_ts_ms: tick.ts_ms,
                        reversal_amount: rev,
                    };
                    out.push(DerivedMarketData::Kagi(seg));
                    // 开启上升段
                    self.current_dir = Some(KagiDirection::Up);
                    self.seg_start_price = Some(extreme);
                    self.seg_extreme_price = Some(tick.price);
                    self.start_ts_ms = Some(tick.ts_ms);
                }
            }
        }
    }

    fn reset(&mut self) {
        self.instrument = None;
        self.start_ts_ms = None;
        self.current_dir = None;
        self.seg_start_price = None;
        self.seg_extreme_price = None;
    }
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()