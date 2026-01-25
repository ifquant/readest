import { PlotRow } from './plot-data';
import { PlotList } from './plot-list';
import { SeriesType } from './series-options';

/** 折线图 PlotRow 扩展，支持单独颜色。 */
export interface LinePlotRow extends PlotRow {
	readonly color?: string;
}

/** 面积图 PlotRow 扩展，包含上下颜色与线条颜色。 */
export interface AreaPlotRow extends PlotRow {
	lineColor?: string;
	topColor?: string;
	bottomColor?: string;
}

/** Baseline PlotRow 扩展，区分上下区域的填充与线条颜色。 */
export interface BaselinePlotRow extends PlotRow {
	topFillColor1?: string;
	topFillColor2?: string;
	topLineColor?: string;
	bottomFillColor1?: string;
	bottomFillColor2?: string;
	bottomLineColor?: string;
}

/** 直方图 PlotRow 扩展。 */
export interface HistogramPlotRow extends PlotRow {
	readonly color?: string;
}

/** 柱状图 PlotRow 扩展。 */
export interface BarPlotRow extends PlotRow {
	readonly color?: string;
}

/** 蜡烛图 PlotRow 扩展，支持柱体/边框/影线颜色。 */
export interface CandlestickPlotRow extends PlotRow {
	readonly color?: string;
	readonly borderColor?: string;
	readonly wickColor?: string;
}

/** 自定义序列 PlotRow，可携带原始数据及颜色。 */
export interface CustomPlotRow extends PlotRow {
	// 用于存储原始数据字段。
	data: Record<string, unknown>;
	readonly color?: string;
}

/** 不同系列类型对应的 PlotRow 类型映射。 */
export interface SeriesPlotRowTypeAtTypeMap {
	Bar: BarPlotRow;
	Candlestick: CandlestickPlotRow;
	Area: AreaPlotRow;
	Baseline: BaselinePlotRow;
	Line: LinePlotRow;
	Histogram: HistogramPlotRow;
	Custom: CustomPlotRow;
}

export type SeriesPlotRow<T extends SeriesType = SeriesType> = SeriesPlotRowTypeAtTypeMap[T];
export type SeriesPlotList<T extends SeriesType = SeriesType> = PlotList<SeriesPlotRow<T>>;

/** 创建一个空的系列 PlotList。 */
export function createSeriesPlotList<T extends SeriesType>(): SeriesPlotList<T> {
	return new PlotList<SeriesPlotRow<T>>();
}
