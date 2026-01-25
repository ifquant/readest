use super::TickDerived;
use futures_interfaces::market_data::{DerivedMarketData, TimeframeSpec};
use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::derived::Bar;
use chrono::{Utc, DateTime};
use super::common::{OhlcAcc, align_to_window_start, push_bar, TriggerCondition, WindowEndTrigger};

pub struct TimeframeBarAgg {
    pub spec: TimeframeSpec,
    current_start_ms: Option<u64>,
    current_end_ms: Option<u64>,
    ohlc: OhlcAcc,
    volume: f64,
    gap_fill_enabled: bool,
    gap_fill_max: Option<usize>,
    time_format_iso: bool,
    // 触发器：当前时间戳穿越窗口结束时输出
    trigger: WindowEndTrigger,
}

impl TimeframeBarAgg {
    pub fn new(spec: TimeframeSpec) -> Self {
        Self {
            spec,
            current_start_ms: None,
            current_end_ms: None,
            ohlc: OhlcAcc::new(),
            volume: 0.0,
            gap_fill_enabled: false,
            gap_fill_max: None,
            time_format_iso: false,
            trigger: WindowEndTrigger { end_ts_ms: None, current_ts_ms: 0 },
        }
    }

    fn aligned_start(&self, ts: u64) -> u64 { align_to_window_start(ts, self.spec.interval_ms) }
    pub fn enable_gap_fill(&mut self, enabled: bool) { self.gap_fill_enabled = enabled; }
    pub fn set_gap_fill_max(&mut self, max: Option<usize>) { self.gap_fill_max = max; }
    pub fn set_time_format_iso(&mut self, enabled: bool) { self.time_format_iso = enabled; }

    fn time_label(&self, ts_ms: u64) -> String {
        if self.time_format_iso {
            if let Some(dt) = DateTime::<Utc>::from_timestamp_millis(ts_ms as i64) {
                dt.to_rfc3339()
            } else { format!("{}", ts_ms) }
        } else { format!("{}", ts_ms) }
    }

    // 构造 Bar 的小辅助方法，统一时间标签与数值传递，避免重复代码
    fn mk_bar(&self, end_ts_ms: u64, open: f64, high: f64, low: f64, close: f64, volume: f64) -> Bar {
        Bar {
            time: self.time_label(end_ts_ms),
            open,
            high,
            low,
            close,
            volume,
        }
    }

    // 设置当前窗口的开始与结束
    fn set_window(&mut self, start_ms: u64, interval_ms: u64) {
        self.current_start_ms = Some(start_ms);
        let end = start_ms + interval_ms;
        self.current_end_ms = Some(end);
        // 同步触发器的窗口结束时间
        self.trigger.end_ts_ms = Some(end);
    }

    // 用当前 tick 初始化 OHLCV
    fn init_ohlcv(&mut self, tick: &Tick) {
        self.ohlc.init_from_price(tick.price);
        self.volume = tick.volume as f64;
    }

    // 区间内的更新：高低、收盘与成交量累加
    fn update_in_window(&mut self, tick: &Tick) {
        self.ohlc.update_hl_close(tick.price);
        self.volume += tick.volume as f64;
    }

    // 结束当前窗口：输出真实 Bar，执行 gap 填充（如启用），推进到下一窗口并初始化
    fn emit_and_rollover(&mut self, tick: &Tick, out: &mut Vec<DerivedMarketData>) {
        let iv = self.spec.interval_ms;
        let end = self.current_end_ms.unwrap();
        let (open, high, low, close) = self.ohlc.values_or(tick.price);
        let bar = self.mk_bar(end, open, high, low, close, self.volume);
        push_bar(out, bar);
        if self.gap_fill_enabled {
            let last_close = close;
            let next_start = self.fill_gap_bars(tick.ts_ms, last_close, end, iv, out);
            self.set_window(next_start, iv);
        } else {
            let new_start = if self.spec.align_to_start { self.aligned_start(tick.ts_ms) } else { end };
            self.set_window(new_start, iv);
        }
        self.init_ohlcv(tick);
    }

    // 将缺口填充为私有方法，保持原有行为：
    // 从给定开始时间 `start` 起，按 `interval_ms` 生成零成交量的等价 K 线，直到 `up_to_ts_ms` 之前。
    // 返回最后一个填充后的起始时间（即下一个区间的开始）。
    fn fill_gap_bars(
        &mut self,
        up_to_ts_ms: u64,
        last_close: f64,
        start: u64,
        interval_ms: u64,
        out: &mut Vec<DerivedMarketData>,
    ) -> u64 {
        let mut next_start = start;
        let mut filled: usize = 0;
        while up_to_ts_ms >= next_start + interval_ms {
            if let Some(max) = self.gap_fill_max { if filled >= max { break; } }
            let next_end = next_start + interval_ms;
            let gap_bar = self.mk_bar(next_end, last_close, last_close, last_close, last_close, 0.0);
            push_bar(out, gap_bar);
            next_start = next_end;
            filled += 1;
        }
        next_start
    }
}

impl TickDerived for TimeframeBarAgg {
    type Output = DerivedMarketData;
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>) {
        let iv = self.spec.interval_ms;
        if self.current_start_ms.is_none() {
            let start = if self.spec.align_to_start { self.aligned_start(tick.ts_ms) } else { tick.ts_ms };
            self.set_window(start, iv);
            self.init_ohlcv(tick);
            return;
        }
        // 使用触发器判定是否跨越窗口结束
        self.trigger.current_ts_ms = tick.ts_ms;
        self.trigger.end_ts_ms = self.current_end_ms;
        if self.trigger.should_emit(tick) {
            self.emit_and_rollover(tick, out);
        } else {
            self.update_in_window(tick);
        }
    }
    fn reset(&mut self) {}
}

// BuildTickAggregator 已移除，统一由 build_dyn_runner_from_spec 直接调用 new()