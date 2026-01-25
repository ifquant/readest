/// <reference types="_build-time-constants" />
// 轻量图表库的主入口文件，聚合所有公开 API 与默认配置

import { customStyleDefaults, seriesOptionsDefaults } from './api/options/series-options-defaults';
import { CustomSeriesOptions } from './model/series-options';

// 渲染层相关的线型枚举供外部直接使用
export { LineStyle, LineType } from './renderers/draw-line';

// 模型层中的配置枚举和模式，帮助调用方控制行为
export { TrackingModeExitMode } from './model/chart-model';
export { CrosshairMode } from './model/crosshair';
export { MismatchDirection } from './model/plot-list';
export { PriceScaleMode } from './model/price-scale';
export { PriceLineSource, LastPriceAnimationMode } from './model/series-options';
export { ColorType } from './model/layout-options';

export { isBusinessDay, isUTCTimestamp } from './model/horz-scale-behavior-time/types';
export { TickMarkType } from './model/horz-scale-behavior-time/types';
// 自定义序列的默认选项，由通用序列默认和自定义样式默认组合
export const customSeriesDefaultOptions: CustomSeriesOptions = {
	...seriesOptionsDefaults,
	...customStyleDefaults,
};
export type { ICustomSeriesPaneView, ICustomSeriesPaneRenderer, CustomBarItemData, CustomData } from './model/icustom-series';

// 常用图表示例的创建工厂
export { createChart, createChartEx, defaultHorzScaleBehavior } from './api/create-chart';
export { createYieldCurveChart } from './api/create-yield-curve-chart';
export { createOptionsChart } from './api/create-options-chart';

// 内置序列类型的构造器别名
export { lineSeries as LineSeries } from './model/series/line-series';
export { baselineSeries as BaselineSeries } from './model/series/baseline-series';
export { areaSeries as AreaSeries } from './model/series/area-series';
export { barSeries as BarSeries } from './model/series/bar-series';
export { candlestickSeries as CandlestickSeries } from './model/series/candlestick-series';
export { histogramSeries as HistogramSeries } from './model/series/histogram-series';
/*
	Plugins
*/
// 插件快捷工厂，简化常用扩展的创建
export { createTextWatermark } from './plugins/text-watermark/primitive';
export { createImageWatermark } from './plugins/image-watermark/primitive';
export { createSeriesMarkers } from './plugins/series-markers/wrapper';
export { createUpDownMarkers } from './plugins/up-down-markers-plugin/wrapper';

/**
 * Returns the current version as a string. For example `'3.3.0'`.
 */
export function version(): string {
	// 版本号在构建阶段通过 DefinePlugin 注入
	return process.env.BUILD_VERSION;
}
