use super::TickDerived;
use futures_interfaces::market_data::{DerivedMarketData};
use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::derived::{PnfSettings, PnfMark, PnfBox, PnfColumn};

pub struct PnfAgg {
    pub spec: PnfSettings,
    instrument: Option<futures_interfaces::InstrumentId>,
    column_index: u32,
    current_mark: Option<PnfMark>,
    boxes: Vec<PnfBox>,
    start_ts_ms: Option<u64>,
}

impl PnfAgg {
    pub fn new(spec: PnfSettings) -> Self {
        Self { spec, instrument: None, column_index: 0, current_mark: None, boxes: Vec::new(), start_ts_ms: None }
    }

    fn last_top(&self) -> Option<f64> {
        self.boxes.last().map(|b| b.top)
    }
    fn last_bottom(&self) -> Option<f64> {
        self.boxes.last().map(|b| b.bottom)
    }

    fn start_new_column(&mut self, mark: PnfMark, start_ts: u64) {
        self.current_mark = Some(mark);
        self.boxes.clear();
        self.start_ts_ms = Some(start_ts);
        self.column_index = self.column_index.saturating_add(1);
    }
}

impl TickDerived for PnfAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.instrument.is_none() { self.instrument = Some(tick.instrument.clone()); }

        let box_size = self.spec.box_size.max(super::EPS);
        let reversal_boxes = self.spec.reversal_boxes.max(1) as i64;

        match self.current_mark {
            None => {
                // 尝试建立首列：若价格相对首个 tick 已向上/向下跨越一个 box
                // 我们使用最近一笔的价作为参考，跨越由本次 tick 自身判断
                // 向上首列：从价位向上构建至少一个格子
                // 实现：若上一格不存在，则以本次价格向下对齐到 box 边界，再判断是否能向上/向下生成格子
                let cur_grid = (tick.price / box_size).floor() * box_size;
                // 上涨一格的条件：价格相对对齐价达到 cur_grid + box_size
                if tick.price >= cur_grid + box_size {
                    self.start_new_column(PnfMark::X, tick.ts_ms);
                    let top = cur_grid + box_size;
                    let bottom = top - box_size;
                    self.boxes.push(PnfBox { top, bottom, mark: PnfMark::X });
                } else if tick.price <= cur_grid - box_size {
                    self.start_new_column(PnfMark::O, tick.ts_ms);
                    let top = cur_grid;
                    let bottom = cur_grid - box_size;
                    self.boxes.push(PnfBox { top, bottom, mark: PnfMark::O });
                }
            }
            Some(PnfMark::X) => {
                // 同方向累加 X 格子
                if let Some(mut last_top) = self.last_top() {
                    while tick.price >= last_top + box_size {
                        let top = last_top + box_size;
                        let bottom = top - box_size;
                        self.boxes.push(PnfBox { top, bottom, mark: PnfMark::X });
                        last_top = top;
                    }
                    // 反转判定：价格跌破极值 top 至少 reversal_boxes 个格子
                    if tick.price <= last_top - (reversal_boxes as f64) * box_size {
                        // 输出已完成的上行列
                        let col = PnfColumn {
                            instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                            index: self.column_index,
                            mark: PnfMark::X,
                            boxes: self.boxes.clone(),
                            start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                            end_ts_ms: tick.ts_ms,
                        };
                        out.push(DerivedMarketData::PointAndFigure(col));

                        // 开启下行列，并按当前价生成相应格子（包含反转所需的格子数）
                        self.start_new_column(PnfMark::O, tick.ts_ms);
                        let mut steps = ((last_top - tick.price) / box_size).floor() as i64;
                        if steps < reversal_boxes { steps = reversal_boxes; }
                        for i in 1..=steps {
                            let top = last_top - (i as f64) * box_size;
                            let bottom = top - box_size;
                            self.boxes.push(PnfBox { top, bottom, mark: PnfMark::O });
                        }
                    }
                } else {
                    // X 列但没有格子时，创建首格
                    let top = (tick.price / box_size).floor() * box_size;
                    let bottom = top - box_size;
                    self.boxes.push(PnfBox { top, bottom, mark: PnfMark::X });
                    self.start_ts_ms = Some(tick.ts_ms);
                }
            }
            Some(PnfMark::O) => {
                // 同方向累加 O 格子
                if let Some(mut last_bottom) = self.last_bottom() {
                    while tick.price <= last_bottom - box_size {
                        let bottom = last_bottom - box_size;
                        let top = bottom + box_size;
                        self.boxes.push(PnfBox { top, bottom, mark: PnfMark::O });
                        last_bottom = bottom;
                    }
                    // 反转判定：价格上涨超过极值 bottom 至少 reversal_boxes 个格子
                    if tick.price >= last_bottom + (reversal_boxes as f64) * box_size {
                        // 输出已完成的下行列
                        let col = PnfColumn {
                            instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                            index: self.column_index,
                            mark: PnfMark::O,
                            boxes: self.boxes.clone(),
                            start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                            end_ts_ms: tick.ts_ms,
                        };
                        out.push(DerivedMarketData::PointAndFigure(col));

                        // 开启上行列，并按当前价生成相应格子
                        self.start_new_column(PnfMark::X, tick.ts_ms);
                        let mut steps = ((tick.price - last_bottom) / box_size).floor() as i64;
                        if steps < reversal_boxes { steps = reversal_boxes; }
                        for i in 1..=steps {
                            let bottom = last_bottom + (i as f64 - 1.0) * box_size;
                            let top = bottom + box_size;
                            self.boxes.push(PnfBox { top, bottom, mark: PnfMark::X });
                        }
                    }
                } else {
                    // O 列但没有格子时，创建首格
                    let bottom = ((tick.price / box_size).floor() * box_size) - box_size;
                    let top = bottom + box_size;
                    self.boxes.push(PnfBox { top, bottom, mark: PnfMark::O });
                    self.start_ts_ms = Some(tick.ts_ms);
                }
            }
        }
    }

    fn reset(&mut self) {
        self.instrument = None;
        self.boxes.clear();
        self.current_mark = None;
        self.start_ts_ms = None;
        self.column_index = 0;
    }
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()