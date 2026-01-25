use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::{
    DerivedMarketData, MarketDataSpec, TimeframeSpec, RenkoSpec,
};
use futures_interfaces::market_data::derived::{
    Bar, RenkoBrick, RenkoDirection, VolumeBar, TickBar, RangeBar, DollarBar, VwapBar,
    ImbalanceBar, DeltaBar, FootprintBar, VolumeProfile, TpoProfile, KagiSegment, ThreeLineBreakLine,
    FootprintRow, VolumeProfileRow, TpoRow, KagiDirection, TlbDirection,
};
use chrono::{NaiveDateTime, Utc, DateTime};

/// 从 Tick 驱动生成派生数据的通用聚合器
pub trait TickDerived {
    type Output;
    /// 处理一笔 Tick，将派生数据写入提供的缓冲区。多数情况下写入0或1个，必要时写入多个。
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>);
    /// 可选的重置方法
    fn reset(&mut self) {}
}
// 可选优化与扩展说明：
// 1) 缓冲类型可改为 SmallVec，例如 `smallvec::SmallVec<[Self::Output; 2]>`，
//    以减少小批量（0/1/2条）输出场景下的堆分配与拷贝；保持 API 不变，仅运行器与聚合器内部替换类型。
// 2) 也可改为“发射器接口”，避免 Vec：
//    `fn on_tick_emit(&mut self, tick: &Tick, emit: &mut dyn FnMut(Self::Output))`
//    优点是完全避免容器；缺点是泛型/借用更复杂，trait 对象与闭包调度成本可能上升，当前“写入缓冲”方案更折中。
// 3) 若单条输出占绝对主导，聚合器内部可短路早返回，写入 1 条后结束；多条场景仍按需 push，多样化兼容。

/// 派生数据回调接口（观察者）
pub trait DerivedCallback<T>: Send {
    fn on_derived(&mut self, data: &T);
}

/// 简单的回调分发中心
pub struct CallbackHub<T> {
    subscribers: Vec<Box<dyn DerivedCallback<T>>>,
}

impl<T> CallbackHub<T> {
    pub fn new() -> Self { Self { subscribers: Vec::new() } }
    pub fn subscribe(&mut self, cb: Box<dyn DerivedCallback<T>>) { self.subscribers.push(cb); }
    pub fn emit(&mut self, data: &T) {
        for s in self.subscribers.iter_mut() {
            s.on_derived(data);
        }
    }
    pub fn len(&self) -> usize { self.subscribers.len() }
    pub fn is_empty(&self) -> bool { self.subscribers.is_empty() }
}

/// 将聚合器与回调中心绑定的运行器：处理 Tick 并触发回调
pub struct TickAggregatorRunner<A>
where
    A: TickDerived,
{
    pub aggregator: A,
    pub callbacks: CallbackHub<A::Output>,
    // 复用的派生数据缓冲，避免每次 on_tick 分配新的 Vec；
    // 可选：切换为 SmallVec 提升 0/1/2 条输出的性能与内存局部性。
    buf: Vec<A::Output>,
}

impl<A> TickAggregatorRunner<A>
where
    A: TickDerived,
{
    pub fn new(aggregator: A) -> Self {
        Self { aggregator, callbacks: CallbackHub::new(), buf: Vec::with_capacity(2) }
    }

    pub fn on_tick(&mut self, tick: &Tick) {
        // 每 Tick 复用缓冲；聚合器负责 push 0/1/多条派生数据。
        self.buf.clear();
        self.aggregator.on_tick_into(tick, &mut self.buf);
        for out in self.buf.iter() {
            self.callbacks.emit(out);
        }
    }

    pub fn subscribe(&mut self, cb: Box<dyn DerivedCallback<A::Output>>) {
        self.callbacks.subscribe(cb);
    }

    pub fn reset(&mut self) { self.aggregator.reset(); }
}

/// 基于规格构建 Tick 聚合器的工厂抽象（例如 TimeframeSpec 等）
pub trait BuildTickAggregator {
    type Output;
    type Aggregator: TickDerived<Output = Self::Output>;
    fn build(&self) -> Self::Aggregator;
}

// ---- 示例聚合器骨架：TimeframeBarAgg 与 RenkoBrickAgg ----

pub struct TimeframeBarAgg {
    pub spec: TimeframeSpec,
    // 内部状态（当前窗口起始/结束、OHLC、成交量）
    current_start_ms: Option<u64>,
    current_end_ms: Option<u64>,
    open: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    close: Option<f64>,
    volume: f64,
    // 可选开关：缺口补齐与 ISO 时间格式
    gap_fill_enabled: bool,
    gap_fill_max: Option<usize>,
    time_format_iso: bool,
}
// 可选优化方向（TimeframeBarAgg）：
// - 缺口补齐：当到达的 Tick 跨过多个窗口，使用 `last_close` 生成空 Bar（open=high=low=close=last_close，volume=0），
//   保持时间轴连续性；可通过开关控制是否启用与最大补齐数量上限。
// - 时间格式：支持 ISO 8601 文本（需引入 `chrono`），并可配置 Bar 时间取窗口开始或结束；当前使用结束时间戳字符串。
// - 对齐策略：扩展 `align_to_start` 为更多对齐策略（例如按交易时段、时区）；当前实现为最简的毫秒整除对齐。
// - 性能：减少反复 `unwrap`，使用局部快照更新；必要时改用结构体内原始标量替代 Option 以降低分支。

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

    fn aligned_start(&self, ts: u64) -> u64 {
        (ts / self.spec.interval_ms) * self.spec.interval_ms
    }

    // 开关设置：缺口补齐
    pub fn enable_gap_fill(&mut self, enabled: bool) { self.gap_fill_enabled = enabled; }
    pub fn set_gap_fill_max(&mut self, max: Option<usize>) { self.gap_fill_max = max; }
    // 开关设置：ISO 时间格式
    pub fn set_time_format_iso(&mut self, enabled: bool) { self.time_format_iso = enabled; }

    fn time_label(&self, ts_ms: u64) -> String {
        if self.time_format_iso {
            if let Some(naive) = NaiveDateTime::from_timestamp_millis(ts_ms as i64) {
                let dt: DateTime<Utc> = DateTime::<Utc>::from_utc(naive, Utc);
                dt.to_rfc3339()
            } else {
                format!("{}", ts_ms)
            }
        } else {
            format!("{}", ts_ms)
        }
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
            // 累计窗口内数据
            if let Some(h) = self.high { if tick.price > h { self.high = Some(tick.price); } }
            if let Some(l) = self.low { if tick.price < l { self.low = Some(tick.price); } }
            self.close = Some(tick.price);
            self.volume += tick.volume as f64;
            return;
        } else {
            // 关闭窗口，输出 Bar
            let bar = Bar {
                time: self.time_label(end),
                open: self.open.unwrap_or(tick.price),
                high: self.high.unwrap_or(tick.price),
                low: self.low.unwrap_or(tick.price),
                close: self.close.unwrap_or(tick.price),
                volume: self.volume,
            };
            out.push(DerivedMarketData::Bar(bar));

            // 缺口补齐：当到达的 Tick 跨过多个窗口，使用 last_close 生成空 Bar
            if self.gap_fill_enabled {
                let mut next_start = end;
                let last_close = self.close.unwrap_or(tick.price);
                let mut filled: usize = 0;
                while tick.ts_ms >= next_start + iv {
                    if let Some(max) = self.gap_fill_max { if filled >= max { break; } }
                    let next_end = next_start + iv;
                    let gap_bar = Bar {
                        time: self.time_label(next_end),
                        open: last_close,
                        high: last_close,
                        low: last_close,
                        close: last_close,
                        volume: 0.0,
                    };
                    out.push(DerivedMarketData::Bar(gap_bar));
                    next_start = next_end;
                    filled += 1;
                }

                // 启动新窗口（包含当前 tick）
                self.current_start_ms = Some(next_start);
                self.current_end_ms = Some(next_start + iv);
            } else {
                // 启动新窗口（包含当前 tick）
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

impl BuildTickAggregator for TimeframeSpec {
    type Output = DerivedMarketData;
    type Aggregator = TimeframeBarAgg;
    fn build(&self) -> Self::Aggregator { TimeframeBarAgg::new(self.clone()) }
}

pub struct RenkoBrickAgg {
    pub spec: RenkoSpec,
    // 内部状态（最后砖收盘、窗口起始时间、instrument）
    base_close: Option<f64>,
    pending_start_ts: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    // 连续方向统计（持久）：
    up_streak: u64,
    down_streak: u64,
    last_dir: Option<RenkoDirection>,
}
// 可选优化方向（RenkoBrickAgg）：
// - 多砖生成：当 `|tick.price - base| / brick_size > 1` 时，按需生成多块砖；可受 `use_wick` 或独立开关控制。
// - Wick 处理：若 `spec.use_wick`，以极值驱动砖闭合（需要更丰富的原始数据，如高/低价；当前 Tick 仅有 `price`，
//   可通过内部状态在单 Tick 内模拟极值或结合外部 Trade/Quote 数据源）。
// - 连续方向统计：维护 `up_streak`/`down_streak` 并提供只读查询接口，便于策略检测趋势强度。
// - 产出限流：为每 Tick 可生成的砖块数量设定上限，避免极端跳空导致一次性过多输出。

impl RenkoBrickAgg {
    pub fn new(spec: RenkoSpec) -> Self {
        Self {
            spec,
            base_close: None,
            pending_start_ts: None,
            instrument: None,
            up_streak: 0,
            down_streak: 0,
            last_dir: None,
        }
    }

    // 只读查询接口：返回当前连续上涨/下跌计数与最后方向
    pub fn up_streak(&self) -> u64 { self.up_streak }
    pub fn down_streak(&self) -> u64 { self.down_streak }
    pub fn last_direction(&self) -> Option<RenkoDirection> { self.last_dir }

    fn update_streak(&mut self, dir: RenkoDirection) {
        match (self.last_dir, dir) {
            (Some(RenkoDirection::Up), RenkoDirection::Up) => {
                self.up_streak += 1;
                // 保持下跌计数不变或归零：此处选择归零更直观
                self.down_streak = 0;
            }
            (Some(RenkoDirection::Down), RenkoDirection::Down) => {
                self.down_streak += 1;
                self.up_streak = 0;
            }
            (_, RenkoDirection::Up) => {
                self.up_streak = 1;
                self.down_streak = 0;
            }
            (_, RenkoDirection::Down) => {
                self.down_streak = 1;
                self.up_streak = 0;
            }
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
            self.pending_start_ts = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            return;
        }

        let mut cur_base = self.base_close.unwrap();
        let start_ts = self.pending_start_ts.unwrap_or(tick.ts_ms);
        let instr = self.instrument.clone().unwrap_or(tick.instrument.clone());

        // 多砖生成（不依赖 wick 极值，按价格跨越砖高累计生成）
        if tick.price > cur_base {
            let steps = ((tick.price - cur_base) / brick_size).floor() as i64;
            for _ in 0..steps {
                let brick = RenkoBrick {
                    instrument: instr.clone(),
                    brick_size,
                    direction: RenkoDirection::Up,
                    open: cur_base,
                    close: cur_base + brick_size,
                    start_ts_ms: start_ts,
                    end_ts_ms: tick.ts_ms,
                };
                out.push(DerivedMarketData::RenkoBrick(brick));
                cur_base += brick_size;
                self.update_streak(RenkoDirection::Up);
            }
            if steps > 0 { self.base_close = Some(cur_base); }
        } else if tick.price < cur_base {
            let steps = ((cur_base - tick.price) / brick_size).floor() as i64;
            for _ in 0..steps {
                let brick = RenkoBrick {
                    instrument: instr.clone(),
                    brick_size,
                    direction: RenkoDirection::Down,
                    open: cur_base,
                    close: cur_base - brick_size,
                    start_ts_ms: start_ts,
                    end_ts_ms: tick.ts_ms,
                };
                out.push(DerivedMarketData::RenkoBrick(brick));
                cur_base -= brick_size;
                self.update_streak(RenkoDirection::Down);
            }
            if steps > 0 { self.base_close = Some(cur_base); }
        }

        // 更新挂起窗口起始时间为当前 tick，下一砖从本 tick 结束后重新计时
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

impl BuildTickAggregator for RenkoSpec {
    type Output = DerivedMarketData;
    type Aggregator = RenkoBrickAgg;
    fn build(&self) -> Self::Aggregator { RenkoBrickAgg::new(self.clone()) }
}

// ---- 其他 Spec 的简化聚合器实现：Volume、TickCount、Range、Dollar、VWAP ----
// 可选增强（后续）：
// 1) 对 Range/Dollar/Volume/TickCount 聚合补充“多根生成”的严格步进与对齐策略（类似 Renko 多砖），
//    保证在单个 tick 跨越多个区间/目标时，按固定步长逐根生成并更新窗口。
// 2) 对 VWAP 非 anchored 且存在窗口的场景可加入 gap 填充开关（跨过多个窗口时输出补齐快照），
//    以提升时间窗口下的可视化完整性（当前保持简单实现）。
// 3) 性能方面可选择 SmallVec 以减少小量输出时的堆分配，并微优化内部状态复位路径。

pub struct VolumeBarAgg {
    pub spec: futures_interfaces::market_data::VolumeSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    open: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    close: Option<f64>,
    acc_volume: u64,
}

// 后续建议：
// - 多根生成：当单个 tick 体量跨越多个目标时，按固定步长逐根输出；
//   新窗口 open 对齐到上一窗口 close（与 Renko 多砖一致）。
// - 批量导入：在离线/批量数据处理时支持一次性生成多根，提升性能。
// - 输出限速：支持时间窗口或限速器，避免每 tick 都输出导致 UI 过载。

impl VolumeBarAgg {
    pub fn new(spec: futures_interfaces::market_data::VolumeSpec) -> Self {
        Self { spec, start_ts_ms: None, instrument: None, open: None, high: None, low: None, close: None, acc_volume: 0 }
    }
}

impl TickDerived for VolumeBarAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.open = Some(tick.price);
            self.high = Some(tick.price);
            self.low = Some(tick.price);
            self.close = Some(tick.price);
            self.acc_volume = 0;
        }
        // 累计
        if let Some(h) = self.high { if tick.price > h { self.high = Some(tick.price); } }
        if let Some(l) = self.low { if tick.price < l { self.low = Some(tick.price); } }
        self.close = Some(tick.price);
        self.acc_volume += tick.volume;

        if self.acc_volume >= self.spec.target_volume {
            let bar = VolumeBar {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                target_volume: self.spec.target_volume,
                actual_volume: self.acc_volume,
                open: self.open.unwrap_or(tick.price),
                high: self.high.unwrap_or(tick.price),
                low: self.low.unwrap_or(tick.price),
                close: self.close.unwrap_or(tick.price),
            };
            out.push(DerivedMarketData::VolumeBar(bar));
            // 重置到新窗口
            self.start_ts_ms = Some(tick.ts_ms);
            self.open = Some(tick.price);
            self.high = Some(tick.price);
            self.low = Some(tick.price);
            self.close = Some(tick.price);
            self.acc_volume = 0;
        }
    }
}

impl BuildTickAggregator for futures_interfaces::market_data::VolumeSpec {
    type Output = DerivedMarketData;
    type Aggregator = VolumeBarAgg;
    fn build(&self) -> Self::Aggregator { VolumeBarAgg::new(self.clone()) }
}

pub struct TickCountAgg {
    pub spec: futures_interfaces::market_data::TickBarSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    open: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    close: Option<f64>,
    acc_ticks: u32,
    acc_volume: u64,
}

// 后续建议：
// - 多根生成：在离线/回放模式下按步进生成多根 tick bar；实时模式保持逐 tick。
// - 输出限速与去重：支持限速与去重，避免超频刷新导致 UI 卡顿。

impl TickCountAgg {
    pub fn new(spec: futures_interfaces::market_data::TickBarSpec) -> Self {
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
        // 累计
        if let Some(h) = self.high { if tick.price > h { self.high = Some(tick.price); } }
        if let Some(l) = self.low { if tick.price < l { self.low = Some(tick.price); } }
        self.close = Some(tick.price);
        self.acc_ticks += 1;
        self.acc_volume += tick.volume;

        if self.acc_ticks >= self.spec.ticks {
            let bar = TickBar {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                ticks: self.spec.ticks,
                open: self.open.unwrap_or(tick.price),
                high: self.high.unwrap_or(tick.price),
                low: self.low.unwrap_or(tick.price),
                close: self.close.unwrap_or(tick.price),
                volume: self.acc_volume,
            };
            out.push(DerivedMarketData::TickBar(bar));
            // 重置到新窗口
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

impl BuildTickAggregator for futures_interfaces::market_data::TickBarSpec {
    type Output = DerivedMarketData;
    type Aggregator = TickCountAgg;
    fn build(&self) -> Self::Aggregator { TickCountAgg::new(self.clone()) }
}

pub struct RangeBarAgg {
    pub spec: futures_interfaces::market_data::RangeSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    open: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    close: Option<f64>,
    acc_volume: u64,
}

// 后续建议：
// - 严格步进与对齐：当价格跨度超过 `range_size` 的多个单位时，按固定步进逐根生成；
//   新窗口 open 取上一窗口 close。
// - 极端跳跃：tick 间价格大跳时，考虑补齐中间快照，保证可视化连续性。
// - 会话/锚点：提供锚定起点或会话边界复位选项，控制窗口重置。

impl RangeBarAgg {
    pub fn new(spec: futures_interfaces::market_data::RangeSpec) -> Self {
        Self { spec, start_ts_ms: None, instrument: None, open: None, high: None, low: None, close: None, acc_volume: 0 }
    }
}

impl TickDerived for RangeBarAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.open = Some(tick.price);
            self.high = Some(tick.price);
            self.low = Some(tick.price);
            self.close = Some(tick.price);
            self.acc_volume = 0;
        }
        // 累计
        if let Some(h) = self.high { if tick.price > h { self.high = Some(tick.price); } }
        if let Some(l) = self.low { if tick.price < l { self.low = Some(tick.price); } }
        self.close = Some(tick.price);
        self.acc_volume += tick.volume;

        let open = self.open.unwrap_or(tick.price);
        let up_break = tick.price - open >= self.spec.range_size;
        let down_break = open - tick.price >= self.spec.range_size;
        if up_break || down_break {
            let close = if up_break { open + self.spec.range_size } else { open - self.spec.range_size };
            let bar = RangeBar {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                range_size: self.spec.range_size,
                open,
                high: self.high.unwrap_or(open.max(close)),
                low: self.low.unwrap_or(open.min(close)),
                close,
                volume: self.acc_volume,
            };
            out.push(DerivedMarketData::RangeBar(bar));
            // 重置到新窗口（以新 close 为下一窗口 open）
            self.start_ts_ms = Some(tick.ts_ms);
            self.open = Some(close);
            self.high = Some(close);
            self.low = Some(close);
            self.close = Some(close);
            self.acc_volume = 0;
        }
    }
}

impl BuildTickAggregator for futures_interfaces::market_data::RangeSpec {
    type Output = DerivedMarketData;
    type Aggregator = RangeBarAgg;
    fn build(&self) -> Self::Aggregator { RangeBarAgg::new(self.clone()) }
}

pub struct DollarBarAgg {
    pub spec: futures_interfaces::market_data::DollarSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    open: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    close: Option<f64>,
    acc_volume: u64,
    acc_dollar: f64,
}

// 后续建议：
// - 多根生成：当单 tick 金额跨越多个目标时逐根输出；新窗口对齐策略与 Volume/Range 保持一致。
// - 金额精度：金额累计改为更高精度（如 decimal/128 位），降低累积误差。
// - 限速与补齐：在跨越多个窗口时可选择补齐快照，提升图表完整性。

impl DollarBarAgg {
    pub fn new(spec: futures_interfaces::market_data::DollarSpec) -> Self {
        Self { spec, start_ts_ms: None, instrument: None, open: None, high: None, low: None, close: None, acc_volume: 0, acc_dollar: 0.0 }
    }
}

impl TickDerived for DollarBarAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.open = Some(tick.price);
            self.high = Some(tick.price);
            self.low = Some(tick.price);
            self.close = Some(tick.price);
            self.acc_volume = 0;
            self.acc_dollar = 0.0;
        }
        // 累计
        if let Some(h) = self.high { if tick.price > h { self.high = Some(tick.price); } }
        if let Some(l) = self.low { if tick.price < l { self.low = Some(tick.price); } }
        self.close = Some(tick.price);
        self.acc_volume += tick.volume;
        self.acc_dollar += tick.price * (tick.volume as f64);

        if self.acc_dollar >= self.spec.target_dollar {
            let bar = DollarBar {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                target_dollar: self.spec.target_dollar,
                actual_dollar: self.acc_dollar,
                open: self.open.unwrap_or(tick.price),
                high: self.high.unwrap_or(tick.price),
                low: self.low.unwrap_or(tick.price),
                close: self.close.unwrap_or(tick.price),
                volume: self.acc_volume,
            };
            out.push(DerivedMarketData::DollarBar(bar));
            // 重置到新窗口
            self.start_ts_ms = Some(tick.ts_ms);
            self.open = Some(tick.price);
            self.high = Some(tick.price);
            self.low = Some(tick.price);
            self.close = Some(tick.price);
            self.acc_volume = 0;
            self.acc_dollar = 0.0;
        }
    }
}

impl BuildTickAggregator for futures_interfaces::market_data::DollarSpec {
    type Output = DerivedMarketData;
    type Aggregator = DollarBarAgg;
    fn build(&self) -> Self::Aggregator { DollarBarAgg::new(self.clone()) }
}

/// VWAP 聚合器（支持跨窗口空快照补齐）
/// 使用建议：
/// - 连续时间序列：设置 `window_ms=Some(1000)`，`gap_fill_enabled=true`，`gap_fill_max=Some(30)`
/// - 锚定窗口：当 `anchored=true` 时不进行空窗补齐，保持与锚点对齐
/// - 空窗快照：总量为 0 时输出 `total_volume=0`、`total_dollar=0`，`vwap=last_price`
/// - 性能与安全：合理限制 `gap_fill_max` 以避免极端行情导致输出风暴
/// 补充说明：
/// - 时间标签与归属：非空的正常输出会将 `end_ts_ms` 对齐到窗口边界；跨边界发生的该笔 tick 累计量仍归属上一窗口。
///   若需该笔 tick 完全归属下一窗口，需要在跨边界时进行分流（先输出到边界，再在新窗口重计该 tick）。
/// - 多窗口且有成交量的补齐：当前仅对“无成交”的窗口进行 gap 补齐。若希望在跨越多个窗口且有成交量的场景下也补齐中间窗口，
///   可扩展此路径使其与 gap-fill 逻辑保持一致。
pub struct VwapAgg {
    pub spec: futures_interfaces::market_data::VwapSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    total_volume: u64,
    total_dollar: f64,
    last_price: Option<f64>,
}

// 后续建议：
// - 非锚定窗口的 gap 填充：当 tick 跨越多个 `window_ms` 时，支持补齐中间快照。
// - 权重与归因：引入成交方向加权或时间加权（TWAP/VWAP 混合），更贴近交易语义。
// - Anchored 重置：支持基于会话/自定义锚点的重置策略，便于分段统计。

impl VwapAgg {
    pub fn new(spec: futures_interfaces::market_data::VwapSpec) -> Self {
        Self { spec, start_ts_ms: None, instrument: None, total_volume: 0, total_dollar: 0.0, last_price: None }
    }
}

impl TickDerived for VwapAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.total_volume = 0;
            self.total_dollar = 0.0;
        }
        self.total_volume += tick.volume;
        self.total_dollar += tick.price * (tick.volume as f64);
        self.last_price = Some(tick.price);

        let start_ts = self.start_ts_ms.unwrap_or(tick.ts_ms);
        let instr = self.instrument.clone().unwrap_or(tick.instrument.clone());

        // anchored: true 时，每个 tick 都输出当前累计 VWAP 快照；否则按窗口时间输出
        if self.spec.anchored {
            if self.total_volume > 0 {
                let vwap = self.total_dollar / (self.total_volume as f64);
                let bar = VwapBar { instrument: instr.clone(), start_ts_ms: start_ts, end_ts_ms: tick.ts_ms, vwap, total_volume: self.total_volume, total_dollar: self.total_dollar };
                out.push(DerivedMarketData::VwapBar(bar));
            }
        } else if let Some(win) = self.spec.window_ms {
            if tick.ts_ms >= start_ts + win {
                let crosses = ((tick.ts_ms.saturating_sub(start_ts)) / win) as usize;
                if self.total_volume == 0 && self.spec.gap_fill_enabled && crosses >= 1 {
                    // 多窗口空快照补齐（仅非 anchored 时生效）
                    let max_fill = self.spec.gap_fill_max.map(|v| v as usize).unwrap_or(usize::MAX);
                    let fill_count = crosses.min(max_fill);
                    let px = self.last_price.unwrap_or(tick.price);
                    for i in 0..fill_count {
                        let st = start_ts + (i as u64) * win;
                        let en = st + win;
                        let bar = VwapBar { instrument: instr.clone(), start_ts_ms: st, end_ts_ms: en, vwap: px, total_volume: 0, total_dollar: 0.0 };
                        out.push(DerivedMarketData::VwapBar(bar));
                    }
                    // 补齐后滚动到当前 tick
                    self.start_ts_ms = Some(tick.ts_ms);
                    self.total_volume = 0;
                    self.total_dollar = 0.0;
                } else {
                    if self.total_volume > 0 {
                        let en = start_ts + win; // 将结束时间对齐到窗口边界
                        let vwap = self.total_dollar / (self.total_volume as f64);
                        let bar = VwapBar { instrument: instr.clone(), start_ts_ms: start_ts, end_ts_ms: en, vwap, total_volume: self.total_volume, total_dollar: self.total_dollar };
                        out.push(DerivedMarketData::VwapBar(bar));
                    }
                    // 滚动窗口到边界
                    let en = start_ts + win;
                    self.start_ts_ms = Some(en);
                    self.total_volume = 0;
                    self.total_dollar = 0.0;
                }
            }
        }
    }
}

impl BuildTickAggregator for futures_interfaces::market_data::VwapSpec {
    type Output = DerivedMarketData;
    type Aggregator = VwapAgg;
    fn build(&self) -> Self::Aggregator { VwapAgg::new(self.clone()) }
}

// ---- 进一步的派生类型聚合骨架：Imbalance、Delta、Footprint、VolumeProfile、TPO、Kagi、ThreeLineBreak ----

pub struct ImbalanceAgg {
    pub spec: futures_interfaces::market_data::ImbalanceSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    open: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    close: Option<f64>,
    last_price: Option<f64>,
    buy_volume: u64,
    sell_volume: u64,
}

// 后续建议：
// - 归因改进：接入成交明细（trade/quote）以替换 uptick/downtick 的买卖量归因。
// - 阈值自适应：基于总成交量或波动度动态调整不平衡阈值，提升稳定性。
// - 窗口选择：支持固定笔数/时间窗口触发与跨窗口补齐，兼顾实时与离线场景。

impl ImbalanceAgg {
    pub fn new(spec: futures_interfaces::market_data::ImbalanceSpec) -> Self {
        Self { spec, start_ts_ms: None, instrument: None, open: None, high: None, low: None, close: None, last_price: None, buy_volume: 0, sell_volume: 0 }
    }
}

impl TickDerived for ImbalanceAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        // 初次初始化：设置窗口起点与 OHLC
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.open = Some(tick.price);
            self.high = Some(tick.price);
            self.low = Some(tick.price);
            self.close = Some(tick.price);
            self.last_price = Some(tick.price);
            self.buy_volume = 0;
            self.sell_volume = 0;
        }
        // 基于 uptick/downtick 的简单买卖量归因（骨架）。
        // 注：若未来接入 Quote/Trade 的更丰富字段，可替换为更准确的归因（如基于成交方向）。
        let is_ask = match self.last_price { Some(lp) => tick.price >= lp, None => true };
        if is_ask { self.buy_volume = self.buy_volume.saturating_add(tick.volume); } else { self.sell_volume = self.sell_volume.saturating_add(tick.volume); }

        // OHLC 更新
        if let Some(h) = self.high { if tick.price > h { self.high = Some(tick.price); } }
        if let Some(l) = self.low { if tick.price < l { self.low = Some(tick.price); } }
        self.close = Some(tick.price);
        self.last_price = Some(tick.price);

        let total = self.buy_volume + self.sell_volume;
        // 鲁棒性：体量过小则不输出，避免噪声影响。
        if total >= MIN_TOTAL_VOLUME_FOR_IMBALANCE {
            let imbalance_ratio = ((self.buy_volume as f64) - (self.sell_volume as f64)).abs() / (total as f64);
            if imbalance_ratio >= self.spec.threshold {
                let bar = ImbalanceBar {
                    instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                    start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                    end_ts_ms: tick.ts_ms,
                    threshold: self.spec.threshold,
                    buy_volume: self.buy_volume,
                    sell_volume: self.sell_volume,
                    open: self.open.unwrap_or(tick.price),
                    high: self.high.unwrap_or(tick.price),
                    low: self.low.unwrap_or(tick.price),
                    close: self.close.unwrap_or(tick.price),
                };
                out.push(DerivedMarketData::ImbalanceBar(bar));
                // 重置到新窗口：保持连续滚动而非对齐固定步长
                self.start_ts_ms = Some(tick.ts_ms);
                self.open = Some(tick.price);
                self.high = Some(tick.price);
                self.low = Some(tick.price);
                self.close = Some(tick.price);
                self.buy_volume = 0;
                self.sell_volume = 0;
            }
        }
    }

    fn reset(&mut self) {
        self.start_ts_ms = None;
        self.instrument = None;
        self.open = None;
        self.high = None;
        self.low = None;
        self.close = None;
        self.last_price = None;
        self.buy_volume = 0;
        self.sell_volume = 0;
    }
}

impl BuildTickAggregator for futures_interfaces::market_data::ImbalanceSpec {
    type Output = DerivedMarketData;
    type Aggregator = ImbalanceAgg;
    fn build(&self) -> Self::Aggregator { ImbalanceAgg::new(self.clone()) }
}

/// Delta 聚合器（支持窗口触发 + 空窗补齐）
/// 使用建议：
/// - 需要完整时间线：`window_ms=Some(1000)`，`gap_fill_enabled=true`，`gap_fill_max=Some(30)`
/// - 触发策略：当设置 `min_abs_delta` 时，达到阈值或到达窗口边界即输出；空窗补齐仅在无成交时发生
/// - 快照形态：空窗补齐输出 `delta=0` 且 `open/close` 采用最近价格
/// 补充说明：
/// - 时间标签与归属：非空的正常输出会将 `end_ts_ms` 对齐到窗口边界；跨边界发生的该笔 tick 累计量仍归属上一窗口。
///   若需该笔 tick 完全归属下一窗口，需要在跨边界时进行分流（先输出到边界，再在新窗口重计该 tick）。
/// - 多窗口且有成交量的补齐：当前仅对“无成交”的窗口进行 gap 补齐。若希望在跨越多个窗口且有成交量的场景下也补齐中间窗口，
///   可扩展此路径使其与 gap-fill 逻辑保持一致。
pub struct DeltaAgg {
    pub spec: futures_interfaces::market_data::DeltaSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    open: Option<f64>,
    close: Option<f64>,
    last_price: Option<f64>,
    buy_volume: u64,
    sell_volume: u64,
}

// 后续建议：
// - 归因改进：同 Imbalance，引入更精细的成交方向归因以提升准确度。
// - 触发策略：并行的时间窗口与绝对 delta 阈值触发可配置优先级；支持跨越多窗口的补齐。
// - 平滑与抗噪：加入最小体量门槛、指数平滑或中值滤波，降低假触发。

impl DeltaAgg {
    pub fn new(spec: futures_interfaces::market_data::DeltaSpec) -> Self {
        Self { spec, start_ts_ms: None, instrument: None, open: None, close: None, last_price: None, buy_volume: 0, sell_volume: 0 }
    }
}

impl TickDerived for DeltaAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        // 初始化窗口与方向参考价
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.open = Some(tick.price);
            self.close = Some(tick.price);
            self.last_price = Some(tick.price);
            self.buy_volume = 0;
            self.sell_volume = 0;
        }
        // 简单的买卖归因（可替换为更准确的成交方向判定）。
        let is_ask = match self.last_price { Some(lp) => tick.price >= lp, None => true };
        if is_ask { self.buy_volume = self.buy_volume.saturating_add(tick.volume); } else { self.sell_volume = self.sell_volume.saturating_add(tick.volume); }
        self.close = Some(tick.price);
        self.last_price = Some(tick.price);

        let delta = (self.buy_volume as i64) - (self.sell_volume as i64);
        // 时间窗口触发：当 tick 穿越窗口边界时输出；支持在无成交的多窗口跨越下补齐“空快照”。
        let (win_ms, start_ts) = match (self.spec.window_ms, self.start_ts_ms) { (Some(w), Some(s)) => (Some(w), Some(s)), _ => (None, None) };
        let should_emit_by_window = match (win_ms, start_ts) { (Some(w), Some(s)) => tick.ts_ms >= s + w, _ => false };
        let should_emit_by_delta = match self.spec.min_abs_delta { Some(min) => delta.abs() >= min, None => false };

        if should_emit_by_window {
            let s = start_ts.unwrap_or(tick.ts_ms);
            let w = win_ms.unwrap();
            let crosses = ((tick.ts_ms.saturating_sub(s)) / w) as usize; // 跨越的窗口数
            // 若本窗口内没有任何成交（delta==0）且启用补齐，则补齐最多 gap_fill_max 条空快照，窗口边界对齐。
            if delta == 0 && self.spec.gap_fill_enabled && crosses >= 1 {
                let max_fill = self.spec.gap_fill_max.map(|v| v as usize).unwrap_or(usize::MAX);
                let fill_count = crosses.min(max_fill);
                let px = self.last_price.unwrap_or(tick.price);
                let instr = self.instrument.clone().unwrap_or(tick.instrument.clone());
                for i in 0..fill_count {
                    let st = s + (i as u64) * w;
                    let en = st + w;
                    let bar = DeltaBar { instrument: instr.clone(), start_ts_ms: st, end_ts_ms: en, delta: 0, open: px, close: px };
                    out.push(DerivedMarketData::DeltaBar(bar));
                }
                // 补齐后滚动到当前 tick 作为新窗口起点
                self.start_ts_ms = Some(tick.ts_ms);
                self.open = Some(tick.price);
                self.close = Some(tick.price);
                self.buy_volume = 0;
                self.sell_volume = 0;
            } else {
                // 正常输出当前窗口快照（将结束时间对齐到窗口边界）
                let s = self.start_ts_ms.unwrap_or(tick.ts_ms);
                let w = self.spec.window_ms.unwrap_or(0);
                let en = s + w;
                let bar = DeltaBar {
                    instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                    start_ts_ms: s,
                    end_ts_ms: en,
                    delta,
                    open: self.open.unwrap_or(tick.price),
                    close: self.close.unwrap_or(tick.price),
                };
                out.push(DerivedMarketData::DeltaBar(bar));
                // 重置窗口：将起点滚动到边界，清零买卖体量
                self.start_ts_ms = Some(en);
                self.open = Some(tick.price);
                self.close = Some(tick.price);
                self.buy_volume = 0;
                self.sell_volume = 0;
            }
        } else if should_emit_by_delta {
            // 仅阈值触发下的输出（不涉及多窗口补齐）
            let bar = DeltaBar {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                delta,
                open: self.open.unwrap_or(tick.price),
                close: self.close.unwrap_or(tick.price),
            };
            out.push(DerivedMarketData::DeltaBar(bar));
            self.start_ts_ms = Some(tick.ts_ms);
            self.open = Some(tick.price);
            self.close = Some(tick.price);
            self.buy_volume = 0;
            self.sell_volume = 0;
        }
    }

    fn reset(&mut self) {
        self.start_ts_ms = None;
        self.instrument = None;
        self.open = None;
        self.close = None;
        self.last_price = None;
        self.buy_volume = 0;
        self.sell_volume = 0;
    }
}

impl BuildTickAggregator for futures_interfaces::market_data::DeltaSpec {
    type Output = DerivedMarketData;
    type Aggregator = DeltaAgg;
    fn build(&self) -> Self::Aggregator { DeltaAgg::new(self.clone()) }
}

use std::collections::BTreeMap;
use ordered_float::OrderedFloat;

/// Footprint 聚合器（按价格桶统计买卖量）
/// 配置建议：
/// - 若希望按时间触发，设置 `spec.window_ms = Some(1000)`（每 1 秒输出）。
/// - 若希望按成交量触发，设置 `spec.min_total_volume = Some(10_000)`（累计 1 万手输出）。
/// - 两者皆设时，任一条件满足即输出；均未设时按每 tick 输出（保持兼容）。
pub struct FootprintAgg {
    pub spec: futures_interfaces::market_data::FootprintSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    last_price: Option<f64>,
    rows: BTreeMap<OrderedFloat<f64>, (u64, u64)>, // price -> (bid_volume, ask_volume)
    last_emit_ts_ms: Option<u64>,
    acc_volume_since_emit: u64,
}

// 后续建议：
// - 输出频率：支持定时/定笔数输出快照，避免每 tick 输出造成过载。
// - 分桶合并：对稀疏小桶进行合并或降采样，进一步提升性能与可读性。
// - 会话复位：提供会话边界的清理/归零选项，便于分段分析。

impl FootprintAgg {
    pub fn new(spec: futures_interfaces::market_data::FootprintSpec) -> Self {
        Self { spec, start_ts_ms: None, instrument: None, last_price: None, rows: BTreeMap::new(), last_emit_ts_ms: None, acc_volume_since_emit: 0 }
    }
    fn bucket_price(&self, price: f64) -> OrderedFloat<f64> {
        // 数值稳定：price_step 不得为 0，向下取整到分桶边界
        let step = self.spec.price_step.max(EPS);
        OrderedFloat((price / step).floor() * step)
    }
    fn trim_rows(&mut self, pivot: OrderedFloat<f64>) {
        // 内存保护：限制分桶数量，优先保留靠近当前价格的桶，裁剪远端。
        while self.rows.len() > MAX_BUCKETS_FOOTPRINT {
            // BTreeMap 有序：首尾为最远端，按与 pivot 的距离裁剪
            let first_key = self.rows.keys().next().copied();
            let last_key = self.rows.keys().next_back().copied();
            if let (Some(f), Some(l)) = (first_key, last_key) {
                let df = (f.0 - pivot.0).abs();
                let dl = (l.0 - pivot.0).abs();
                if df >= dl { self.rows.remove(&f); } else { self.rows.remove(&l); }
            } else { break; }
        }
    }
}

impl TickDerived for FootprintAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            self.last_price = Some(tick.price);
            if self.last_emit_ts_ms.is_none() { self.last_emit_ts_ms = Some(tick.ts_ms); }
        }
        let bucket = self.bucket_price(tick.price);
        let is_ask = match self.last_price { Some(lp) => tick.price >= lp, None => true };
        let entry = self.rows.entry(bucket).or_insert((0u64, 0u64));
        if is_ask { entry.1 = entry.1.saturating_add(tick.volume); } else { entry.0 = entry.0.saturating_add(tick.volume); }
        self.last_price = Some(tick.price);
        // 分桶裁剪
        self.trim_rows(bucket);
        // 输出频率控制：时间窗口与最小体量阈值（任一满足触发），否则保持每 tick 兼容行为
        self.acc_volume_since_emit = self.acc_volume_since_emit.saturating_add(tick.volume);
        let mut should_emit = false;
        if let Some(window) = self.spec.window_ms {
            let last = self.last_emit_ts_ms.unwrap_or(tick.ts_ms);
            if tick.ts_ms.saturating_sub(last) >= window { should_emit = true; }
        }
        if !should_emit {
            if let Some(min_vol) = self.spec.min_total_volume {
                if self.acc_volume_since_emit >= min_vol { should_emit = true; }
            }
        }
        if self.spec.window_ms.is_none() && self.spec.min_total_volume.is_none() {
            // 未配置窗口或阈值时，保持原行为：每 tick 输出
            should_emit = true;
        }
        if should_emit {
            let mut rows_vec: Vec<FootprintRow> = Vec::with_capacity(self.rows.len());
            for (p, (bid_v, ask_v)) in self.rows.iter() {
                rows_vec.push(FootprintRow { price: p.0, bid_volume: *bid_v, ask_volume: *ask_v });
            }
            let bar = FootprintBar {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                rows: rows_vec,
            };
            out.push(DerivedMarketData::Footprint(bar));
            self.last_emit_ts_ms = Some(tick.ts_ms);
            self.acc_volume_since_emit = 0;
        }
    }

    fn reset(&mut self) {
        self.start_ts_ms = None;
        self.instrument = None;
        self.last_price = None;
        self.rows.clear();
        self.last_emit_ts_ms = None;
        self.acc_volume_since_emit = 0;
    }
}

impl BuildTickAggregator for futures_interfaces::market_data::FootprintSpec {
    type Output = DerivedMarketData;
    type Aggregator = FootprintAgg;
    fn build(&self) -> Self::Aggregator { FootprintAgg::new(self.clone()) }
}

/// VolumeProfile 聚合器（按价格桶统计总成交量）
/// 配置建议：
/// - 设置 `spec.window_ms = Some(1000)` 以时间窗口触发；或设置 `spec.min_total_volume = Some(10_000)` 以体量阈值触发。
/// - 两者取或逻辑，满足其一即输出；均未设时每 tick 输出。
pub struct VolumeProfileAgg {
    pub spec: futures_interfaces::market_data::VolumeProfileSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    rows: BTreeMap<OrderedFloat<f64>, u64>, // price -> volume（使用 OrderedFloat 以满足 BTreeMap 的 Ord 约束）
    last_emit_ts_ms: Option<u64>,
    acc_volume_since_emit: u64,
}

// 后续建议：
// - 窗口化：支持时间窗口或会话分段的体积分布；在窗口切换时输出快照。
// - 合并策略：相邻小桶合并、尾部裁剪策略可配置（保留关键结构）。
// - 输出频率控制：定时或阈值触发快照，避免刷新过频。

impl VolumeProfileAgg {
    pub fn new(spec: futures_interfaces::market_data::VolumeProfileSpec) -> Self {
        Self { spec, start_ts_ms: None, instrument: None, rows: BTreeMap::new(), last_emit_ts_ms: None, acc_volume_since_emit: 0 }
    }
    fn bucket_price(&self, price: f64) -> OrderedFloat<f64> {
        let step = self.spec.price_step.max(EPS);
        OrderedFloat((price / step).floor() * step)
    }
    fn trim_rows(&mut self, pivot: OrderedFloat<f64>) {
        while self.rows.len() > MAX_BUCKETS_VOLUME_PROFILE {
            let first_key = self.rows.keys().next().copied();
            let last_key = self.rows.keys().next_back().copied();
            if let (Some(f), Some(l)) = (first_key, last_key) {
                let df = (f.0 - pivot.0).abs();
                let dl = (l.0 - pivot.0).abs();
                if df >= dl { self.rows.remove(&f); } else { self.rows.remove(&l); }
            } else { break; }
        }
    }
}

impl TickDerived for VolumeProfileAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            if self.last_emit_ts_ms.is_none() { self.last_emit_ts_ms = Some(tick.ts_ms); }
        }
        let bucket = self.bucket_price(tick.price);
        let entry = self.rows.entry(bucket).or_insert(0u64);
        *entry = entry.saturating_add(tick.volume);
        // 分桶裁剪
        self.trim_rows(bucket);
        // 输出频率控制：时间窗口与最小体量阈值（任一满足触发），否则保持每 tick 兼容行为
        self.acc_volume_since_emit = self.acc_volume_since_emit.saturating_add(tick.volume);
        let mut should_emit = false;
        if let Some(window) = self.spec.window_ms {
            let last = self.last_emit_ts_ms.unwrap_or(tick.ts_ms);
            if tick.ts_ms.saturating_sub(last) >= window { should_emit = true; }
        }
        if !should_emit {
            if let Some(min_vol) = self.spec.min_total_volume {
                if self.acc_volume_since_emit >= min_vol { should_emit = true; }
            }
        }
        if self.spec.window_ms.is_none() && self.spec.min_total_volume.is_none() {
            should_emit = true;
        }
        if should_emit {
            let mut rows_vec: Vec<VolumeProfileRow> = Vec::with_capacity(self.rows.len());
            for (p, v) in self.rows.iter() {
                rows_vec.push(VolumeProfileRow { price: p.0, volume: *v });
            }
            let profile = VolumeProfile {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                rows: rows_vec,
            };
            out.push(DerivedMarketData::VolumeProfile(profile));
            self.last_emit_ts_ms = Some(tick.ts_ms);
            self.acc_volume_since_emit = 0;
        }
    }

    fn reset(&mut self) {
        self.start_ts_ms = None;
        self.instrument = None;
        self.rows.clear();
        self.last_emit_ts_ms = None;
        self.acc_volume_since_emit = 0;
    }
}

impl BuildTickAggregator for futures_interfaces::market_data::VolumeProfileSpec {
    type Output = DerivedMarketData;
    type Aggregator = VolumeProfileAgg;
    fn build(&self) -> Self::Aggregator { VolumeProfileAgg::new(self.clone()) }
}

/// TPO 聚合器（按价格桶统计出现次数/时段）
/// 配置建议：
/// - 设置 `spec.window_ms = Some(1000)` 以时间窗口触发；或设置 `spec.min_total_tpo = Some(50)` 以 TPO 计数阈值触发。
/// - 两者取或逻辑，满足其一即输出；均未设时每 tick 输出。
pub struct TpoAgg {
    pub spec: futures_interfaces::market_data::TpoSpec,
    start_ts_ms: Option<u64>,
    instrument: Option<futures_interfaces::InstrumentId>,
    rows: BTreeMap<OrderedFloat<f64>, u32>, // price -> tpo_count（OrderedFloat 提供 Ord）
    last_emit_ts_ms: Option<u64>,
    acc_tpo_since_emit: u32,
}

// 后续建议：
// - 时间片控制：TPO 常按固定时间片统计，可将输出绑定到时间片切换点。
// - 字母标注：保留字母映射接口，为后续图形层标注使用（A/B/C...）。
// - 合并/裁剪：与 VolumeProfile 一致的分桶合并与内存裁剪策略。

impl TpoAgg {
    pub fn new(spec: futures_interfaces::market_data::TpoSpec) -> Self {
        Self { spec, start_ts_ms: None, instrument: None, rows: BTreeMap::new(), last_emit_ts_ms: None, acc_tpo_since_emit: 0 }
    }
    fn bucket_price(&self, price: f64) -> OrderedFloat<f64> {
        let step = self.spec.price_step.max(EPS);
        OrderedFloat((price / step).floor() * step)
    }
    fn trim_rows(&mut self, pivot: OrderedFloat<f64>) {
        while self.rows.len() > MAX_BUCKETS_TPO {
            let first_key = self.rows.keys().next().copied();
            let last_key = self.rows.keys().next_back().copied();
            if let (Some(f), Some(l)) = (first_key, last_key) {
                let df = (f.0 - pivot.0).abs();
                let dl = (l.0 - pivot.0).abs();
                if df >= dl { self.rows.remove(&f); } else { self.rows.remove(&l); }
            } else { break; }
        }
    }
}

impl TickDerived for TpoAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.start_ts_ms.is_none() {
            self.start_ts_ms = Some(tick.ts_ms);
            self.instrument = Some(tick.instrument.clone());
            if self.last_emit_ts_ms.is_none() { self.last_emit_ts_ms = Some(tick.ts_ms); }
        }
        let bucket = self.bucket_price(tick.price);
        let entry = self.rows.entry(bucket).or_insert(0u32);
        *entry = entry.saturating_add(1);
        self.trim_rows(bucket);
        // 输出频率控制：时间窗口与最小 TPO 计数阈值（任一满足触发），否则保持每 tick 兼容行为
        self.acc_tpo_since_emit = self.acc_tpo_since_emit.saturating_add(1);
        let mut should_emit = false;
        if let Some(window) = self.spec.window_ms {
            let last = self.last_emit_ts_ms.unwrap_or(tick.ts_ms);
            if tick.ts_ms.saturating_sub(last) >= window { should_emit = true; }
        }
        if !should_emit {
            if let Some(min_tpo) = self.spec.min_total_tpo {
                if self.acc_tpo_since_emit >= min_tpo { should_emit = true; }
            }
        }
        if self.spec.window_ms.is_none() && self.spec.min_total_tpo.is_none() {
            should_emit = true;
        }
        if should_emit {
            let mut rows_vec: Vec<TpoRow> = Vec::with_capacity(self.rows.len());
            for (p, c) in self.rows.iter() {
                rows_vec.push(TpoRow { price: p.0, tpo_count: *c });
            }
            let profile = TpoProfile {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                start_ts_ms: self.start_ts_ms.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                rows: rows_vec,
            };
            out.push(DerivedMarketData::TpoProfile(profile));
            self.last_emit_ts_ms = Some(tick.ts_ms);
            self.acc_tpo_since_emit = 0;
        }
    }

    fn reset(&mut self) {
        self.start_ts_ms = None;
        self.instrument = None;
        self.rows.clear();
        self.last_emit_ts_ms = None;
        self.acc_tpo_since_emit = 0;
    }
}

impl BuildTickAggregator for futures_interfaces::market_data::TpoSpec {
    type Output = DerivedMarketData;
    type Aggregator = TpoAgg;
    fn build(&self) -> Self::Aggregator { TpoAgg::new(self.clone()) }
}

pub struct KagiAgg {
    pub spec: futures_interfaces::market_data::KagiSpec,
    instrument: Option<futures_interfaces::InstrumentId>,
    current_dir: Option<KagiDirection>,
    segment_start_price: Option<f64>,
    segment_start_ts: Option<u64>,
    last_price: Option<f64>,
}

// 后续建议：
// - 粗细（yin/yang）规则：根据突破/回撤扩展粗线细线绘制语义，便于图形层表现。
// - 会话/锚点：提供复位或锚定段起点的选项，支持分段绘制。
// - 多步反转：在大跳跃下，按固定步长输出多个段以保持对齐一致。

impl KagiAgg {
    pub fn new(spec: futures_interfaces::market_data::KagiSpec) -> Self {
        Self { spec, instrument: None, current_dir: None, segment_start_price: None, segment_start_ts: None, last_price: None }
    }
}

impl TickDerived for KagiAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        // 初始化首段：记录起点与方向参考价，首个 tick 不输出，等待后续判断方向
        if self.segment_start_ts.is_none() {
            self.segment_start_ts = Some(tick.ts_ms);
            self.segment_start_price = Some(tick.price);
            self.instrument = Some(tick.instrument.clone());
            self.last_price = Some(tick.price);
            self.current_dir = None;
            return; // 初始化后等待下一笔以判断方向
        }
        let last = self.last_price.unwrap_or(tick.price);
        // 初次方向：基于相邻价格确定上/下段。
        if self.current_dir.is_none() {
            self.current_dir = if tick.price >= last { Some(KagiDirection::Up) } else { Some(KagiDirection::Down) };
        }
        let dir = self.current_dir.unwrap_or(KagiDirection::Up);
        let rev = self.spec.reversal_amount;
        let mut reversed = false;
        match dir {
            KagiDirection::Up => {
                // 上行段：若价格向下回撤达到 reversal_amount，则反转
                if tick.price <= last - rev { reversed = true; }
            }
            KagiDirection::Down => {
                // 下行段：若价格向上回升达到 reversal_amount，则反转
                if tick.price >= last + rev { reversed = true; }
            }
        }
        if reversed {
            // 输出当前段，以“反转发生前的最后价”为段终点，避免重复输出与抖动。
            let seg = KagiSegment {
                instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                direction: dir,
                start_price: self.segment_start_price.unwrap_or(last),
                end_price: last,
                start_ts_ms: self.segment_start_ts.unwrap_or(tick.ts_ms),
                end_ts_ms: tick.ts_ms,
                reversal_amount: rev,
            };
            out.push(DerivedMarketData::Kagi(seg));
            // 切换方向：以当前价为新段起点；若需要更严格绘制，可记录极值后再切换（后续增强）。
            self.segment_start_price = Some(last);
            self.segment_start_ts = Some(tick.ts_ms);
            self.current_dir = Some(match dir { KagiDirection::Up => KagiDirection::Down, KagiDirection::Down => KagiDirection::Up });
        }
        self.last_price = Some(tick.price);
    }

    fn reset(&mut self) {
        self.instrument = None;
        self.current_dir = None;
        self.segment_start_price = None;
        self.segment_start_ts = None;
        self.last_price = None;
    }
}

impl BuildTickAggregator for futures_interfaces::market_data::KagiSpec {
    type Output = DerivedMarketData;
    type Aggregator = KagiAgg;
    fn build(&self) -> Self::Aggregator { KagiAgg::new(self.clone()) }
}

pub struct ThreeLineBreakAgg {
    pub spec: futures_interfaces::market_data::ThreeLineBreakSpec,
    instrument: Option<futures_interfaces::InstrumentId>,
    last_closes: Vec<f64>,
    last_emitted_dir: Option<TlbDirection>,
    last_emitted_price: Option<f64>,
}

// 后续建议：
// - 动态 N：支持根据波动度动态调整 N（Lines），提升适应性。
// - 等价价格处理：严格使用 `EPS` 并提供可配置边界策略，避免假突破。
// - 去抖与限速：在剧烈波动中控制输出频率与去重，稳定可视化。

impl ThreeLineBreakAgg {
    pub fn new(spec: futures_interfaces::market_data::ThreeLineBreakSpec) -> Self {
        Self { spec, instrument: None, last_closes: Vec::new(), last_emitted_dir: None, last_emitted_price: None }
    }
}

impl TickDerived for ThreeLineBreakAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        if self.instrument.is_none() {
            self.instrument = Some(tick.instrument.clone());
        }
        self.last_closes.push(tick.price);
        // 控制窗口大小：仅保留最近 N 条，避免无界增长
        let lines = self.spec.lines as usize;
        if self.last_closes.len() > lines * 2 { // 多保留一些用于阈值参考
            let excess = self.last_closes.len() - lines * 2;
            self.last_closes.drain(0..excess);
        }
        if self.last_closes.len() >= lines {
            let recent = &self.last_closes[self.last_closes.len() - lines..];
            let max_close = recent.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
            let min_close = recent.iter().cloned().fold(f64::INFINITY, f64::min);
            let mut dir_opt: Option<TlbDirection> = None;
            // 严格突破最近 N 条的极值才视为新线形成；避免等于边界时抖动
            if tick.price > max_close + EPS { dir_opt = Some(TlbDirection::Up); }
            else if tick.price < min_close - EPS { dir_opt = Some(TlbDirection::Down); }
            if let Some(direction) = dir_opt {
                // 去重与防抖：若与上次同方向且价格未更远突破，则不重复输出
                let should_emit = match (self.last_emitted_dir, self.last_emitted_price) {
                    (Some(prev_dir), Some(prev_price)) => {
                        match direction {
                            TlbDirection::Up => tick.price > prev_price + EPS || !matches!(prev_dir, TlbDirection::Up),
                            TlbDirection::Down => tick.price < prev_price - EPS || !matches!(prev_dir, TlbDirection::Down),
                        }
                    }
                    _ => true,
                };
                if should_emit {
                    let line = ThreeLineBreakLine {
                        instrument: self.instrument.clone().unwrap_or(tick.instrument.clone()),
                        direction,
                        price: tick.price,
                        ts_ms: tick.ts_ms,
                    };
                    out.push(DerivedMarketData::ThreeLineBreak(line));
                    self.last_emitted_dir = Some(direction);
                    self.last_emitted_price = Some(tick.price);
                }
            }
        }
    }

    fn reset(&mut self) {
        self.instrument = None;
        self.last_closes.clear();
        self.last_emitted_dir = None;
        self.last_emitted_price = None;
    }
}

impl BuildTickAggregator for futures_interfaces::market_data::ThreeLineBreakSpec {
    type Output = DerivedMarketData;
    type Aggregator = ThreeLineBreakAgg;
    fn build(&self) -> Self::Aggregator { ThreeLineBreakAgg::new(self.clone()) }
}

// ---- 动态聚合器运行器（统一输出为 DerivedMarketData，便于按 Spec 构建）----

pub struct DynTickAggregatorRunner {
    pub aggregator: Box<dyn TickDerived<Output = DerivedMarketData>>,
    pub callbacks: CallbackHub<DerivedMarketData>,
    // 统一输出类型的复用缓冲；同样可考虑 SmallVec 优化小批量输出。
    buf: Vec<DerivedMarketData>,
}

impl DynTickAggregatorRunner {
    pub fn new(aggregator: Box<dyn TickDerived<Output = DerivedMarketData>>) -> Self {
        Self { aggregator, callbacks: CallbackHub::new(), buf: Vec::with_capacity(2) }
    }

    pub fn on_tick(&mut self, tick: &Tick) {
        self.buf.clear();
        self.aggregator.on_tick_into(tick, &mut self.buf);
        for out in self.buf.iter() {
            self.callbacks.emit(out);
        }
    }

    pub fn subscribe(&mut self, cb: Box<dyn DerivedCallback<DerivedMarketData>>) {
        self.callbacks.subscribe(cb);
    }

    pub fn reset(&mut self) { self.aggregator.reset(); }
}

/// 示例：根据 MarketDataSpec 构建统一输出的动态聚合器运行器
pub fn build_dyn_runner_from_spec(spec: &MarketDataSpec) -> Option<DynTickAggregatorRunner> {
    match spec {
        MarketDataSpec::Timeframe(tf) => Some(DynTickAggregatorRunner::new(Box::new(tf.build()))),
        MarketDataSpec::Renko(rk) => Some(DynTickAggregatorRunner::new(Box::new(rk.build()))),
        _ => None,
    }
}
// ---- 聚合骨架的通用常量（数值稳定与内存保护）----
// 说明：这些常量不改变外部接口，仅用于提升骨架的稳健性。可在后续根据产品需求调整。
const MIN_TOTAL_VOLUME_FOR_IMBALANCE: u64 = 10; // 不平衡输出的最小体量门槛，避免过噪
const MAX_BUCKETS_FOOTPRINT: usize = 2048; // Footprint 分桶最大数量，保护内存
const MAX_BUCKETS_VOLUME_PROFILE: usize = 2048; // VolumeProfile 分桶最大数量
const MAX_BUCKETS_TPO: usize = 4096; // TPO 分桶最大数量
const EPS: f64 = 1e-9; // 数值稳定的最小步长
