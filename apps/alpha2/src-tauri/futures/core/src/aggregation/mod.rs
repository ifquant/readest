use futures_interfaces::market_data::raw::Tick;
use futures_interfaces::market_data::{DerivedMarketData, MarketDataSpec};

/// 从 Tick 驱动生成派生数据的通用聚合器
pub trait TickDerived {
    type Output;
    /// 处理一笔 Tick，将派生数据写入提供的缓冲区。多数情况下写入0或1个，必要时写入多个。
    fn on_tick_into(&mut self, tick: &Tick, out: &mut Vec<Self::Output>);
    /// 可选的重置方法
    fn reset(&mut self) {}
}

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


// ---- 子模块声明 ----
pub mod timeframe;
pub mod common;
pub mod renko;
pub mod volume;
pub mod tick_count;
pub mod range;
pub mod dollar;
pub mod vwap;
pub mod imbalance;
pub mod delta;
pub mod footprint;
pub mod volume_profile;
pub mod tpo;
pub mod kagi;
pub mod three_line_break;
pub mod pnf;

// ---- 便捷导出 ----
pub use timeframe::TimeframeBarAgg;
pub use renko::RenkoBrickAgg;
pub use volume::VolumeBarAgg;
pub use tick_count::TickCountAgg;
pub use range::RangeBarAgg;
pub use dollar::DollarBarAgg;
pub use vwap::VwapAgg;
pub use imbalance::ImbalanceAgg;
pub use delta::DeltaAgg;
pub use footprint::FootprintAgg;
pub use volume_profile::VolumeProfileAgg;
pub use tpo::TpoAgg;
pub use kagi::KagiAgg;
pub use three_line_break::ThreeLineBreakAgg;
pub use pnf::PnfAgg;

// ---- 动态聚合器运行器（统一输出为 DerivedMarketData）----
pub struct DynTickAggregatorRunner {
    pub aggregator: RunnerBox, 
    pub callbacks: CallbackHub<DerivedMarketData>,
    buf: Vec<DerivedMarketData>,
}

impl DynTickAggregatorRunner {
    pub fn new(aggregator: RunnerBox) -> Self {
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

/// 便捷封装：将具体聚合器装箱为统一运行器
fn runner_of<A>(aggregator: A) -> DynTickAggregatorRunner
where
    A: TickDerived<Output = DerivedMarketData> + 'static,
{
    DynTickAggregatorRunner::new(Box::new(aggregator))
}

/// 根据统一的 `MarketDataSpec` 构建动态聚合器运行器（统一输出为 `DerivedMarketData`）
pub fn build_dyn_runner_from_spec(spec: &MarketDataSpec) -> Option<DynTickAggregatorRunner> {
    match spec {
        // 时间与成交量/笔数/价格区间等基础 K 线
        MarketDataSpec::Timeframe(tf) => Some(runner_of(TimeframeBarAgg::new(tf.clone()))),
        MarketDataSpec::Volume(v) => Some(runner_of(VolumeBarAgg::new(v.clone()))),
        MarketDataSpec::TickCount(tc) => Some(runner_of(TickCountAgg::new(tc.clone()))),
        MarketDataSpec::Range(r) => Some(runner_of(RangeBarAgg::new(r.clone()))),
        MarketDataSpec::Renko(rk) => Some(runner_of(RenkoBrickAgg::new(rk.clone()))),

        // 成交额、微结构与加权
        MarketDataSpec::Dollar(d) => Some(runner_of(DollarBarAgg::new(d.clone()))),
        MarketDataSpec::Imbalance(im) => Some(runner_of(ImbalanceAgg::new(im.clone()))),
        MarketDataSpec::Delta(ds) => Some(runner_of(DeltaAgg::new(ds.clone()))),
        MarketDataSpec::Vwap(vw) => Some(runner_of(VwapAgg::new(vw.clone()))),

        // 价格分布影像
        MarketDataSpec::Footprint(fp) => Some(runner_of(FootprintAgg::new(fp.clone()))),
        MarketDataSpec::VolumeProfile(vp) => Some(runner_of(VolumeProfileAgg::new(vp.clone()))),
        MarketDataSpec::Tpo(tpo) => Some(runner_of(TpoAgg::new(tpo.clone()))),

        // 线型/反转类
        MarketDataSpec::Kagi(kg) => Some(runner_of(KagiAgg::new(kg.clone()))),
        MarketDataSpec::ThreeLineBreak(tlb) => Some(runner_of(ThreeLineBreakAgg::new(tlb.clone()))),

        // 点数图（PNF）
        MarketDataSpec::Pnf(pnf) => Some(runner_of(PnfAgg::new(pnf.clone()))),
    }
}

// ---- 聚合骨架的通用常量（数值稳定与内存保护）----
const MIN_TOTAL_VOLUME_FOR_IMBALANCE: u64 = 10; // 不平衡输出的最小体量门槛，避免过噪
const MAX_BUCKETS_FOOTPRINT: usize = 2048; // Footprint 分桶最大数量，保护内存
const MAX_BUCKETS_VOLUME_PROFILE: usize = 2048; // VolumeProfile 分桶最大数量
const MAX_BUCKETS_TPO: usize = 4096; // TPO 分桶最大数量
const EPS: f64 = 1e-9; // 数值稳定的最小步长

// 长类型别名，减少重复书写，保持语义清晰
type RunnerBox = Box<dyn TickDerived<Output = DerivedMarketData>>;