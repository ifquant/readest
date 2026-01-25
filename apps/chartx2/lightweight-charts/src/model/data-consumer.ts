import { Time } from './horz-scale-behavior-time/types';
import { CustomData, CustomSeriesWhitespaceData } from './icustom-series';
import { Series } from './series';
import { SeriesType } from './series-options';

/**
 * 空白数据点（无价格值的时间点）。
 *
 * @example
 * ```js
 * const data = [
 *     { time: '2018-12-03', value: 27.02 },
 *     { time: '2018-12-04' }, // 空白
 *     { time: '2018-12-05' },
 *     { time: '2018-12-06' },
 *     { time: '2018-12-07' },
 *     { time: '2018-12-08', value: 23.92 },
 *     { time: '2018-12-13', value: 30.74 },
 * ];
 * ```
 */
export interface WhitespaceData<HorzScaleItem = Time> {
	/** 数据对应的时间点。 */
	time: HorzScaleItem;

	/**
	 * 附加自定义字段，库自身忽略，可供插件使用。
	 */
	customValues?: Record<string, unknown>;
}

/** 单值序列（折线/面积等）的数据点基类。 */
export interface SingleValueData<HorzScaleItem = Time> extends WhitespaceData<HorzScaleItem> {
	/** 数据对应的时间点。 */
	time: HorzScaleItem;

	/** 数据的数值（价格）。 */
	value: number;
}

/** 折线序列的数据结构。 */
export interface LineData<HorzScaleItem = Time> extends SingleValueData<HorzScaleItem> {
	/**
	 * 可选颜色，未指定时使用序列默认颜色。
	 */
	color?: string;
}

/** 柱状图序列的数据结构。 */
export interface HistogramData<HorzScaleItem = Time> extends SingleValueData<HorzScaleItem> {
	/**
	 * 可选颜色，未指定时使用序列默认颜色。
	 */
	color?: string;
}

/** 面积图序列的数据结构。 */
export interface AreaData<HorzScaleItem = Time> extends SingleValueData<HorzScaleItem> {
	/** 可选线条颜色。 */
	lineColor?: string;

	/** 可选上侧填充颜色。 */
	topColor?: string;

	/** 可选下侧填充颜色。 */
	bottomColor?: string;
}

/** 基准线（Baseline）序列的数据结构。 */
export interface BaselineData<HorzScaleItem = Time> extends SingleValueData<HorzScaleItem> {
	/** 顶部区域的上层填充颜色。 */
	topFillColor1?: string;

	/** 顶部区域的下层填充颜色。 */
	topFillColor2?: string;

	/** 顶部区域的线条颜色。 */
	topLineColor?: string;

	/** 底部区域的上层填充颜色。 */
	bottomFillColor1?: string;

	/** 底部区域的下层填充颜色。 */
	bottomFillColor2?: string;

	/** 底部区域的线条颜色。 */
	bottomLineColor?: string;
}

/**
 * 含有时间和 OHLC 价格的 K 线数据结构。
 */
export interface OhlcData<HorzScaleItem = Time> extends WhitespaceData<HorzScaleItem> {
	/** K 线对应的时间点。 */
	time: HorzScaleItem;

	/** 开盘价。 */
	open: number;
	/** 最高价。 */
	high: number;
	/** 最低价。 */
	low: number;
	/** 收盘价。 */
	close: number;
}

/** 柱状序列的数据结构。 */
export interface BarData<HorzScaleItem = Time> extends OhlcData<HorzScaleItem> {
	/** 可选颜色。 */
	color?: string;
}

/** 蜡烛图序列的数据结构。 */
export interface CandlestickData<HorzScaleItem = Time> extends OhlcData<HorzScaleItem> {
	/** 可选柱体颜色。 */
	color?: string;
	/** 可选边框颜色。 */
	borderColor?: string;
	/** 可选影线颜色。 */
	wickColor?: string;
}

/**
 * 判定数据点是否为空白（既无 open 也无 value 字段）。
 */
export function isWhitespaceData<HorzScaleItem = Time>(data: SeriesDataItemTypeMap<HorzScaleItem>[SeriesType]): data is WhitespaceData<HorzScaleItem> {
	return (data as Partial<BarData<HorzScaleItem>>).open === undefined && (data as Partial<LineData<HorzScaleItem>>).value === undefined;
}

/**
 * 判定数据点是否具备可绘制数值（K 线或单值）。
 */
export function isFulfilledData<HorzScaleItem, T extends SeriesDataItemTypeMap<HorzScaleItem>[SeriesType]>(
	data: T
): data is Extract<T, BarData<HorzScaleItem> | LineData<HorzScaleItem> | HistogramData<HorzScaleItem>> {
	return isFulfilledBarData(data) || isFulfilledLineData(data);
}

/**
 * 判定是否为完整的 K 线数据（包含 open）。
 */
export function isFulfilledBarData<HorzScaleItem, T extends SeriesDataItemTypeMap<HorzScaleItem>[SeriesType]>(
	data: T
): data is Extract<T, BarData<HorzScaleItem>> {
	return (data as Partial<BarData<HorzScaleItem>>).open !== undefined;
}

/**
 * 判定是否为折线/直方数据（包含 value）。
 */
export function isFulfilledLineData<HorzScaleItem, T extends SeriesDataItemTypeMap<HorzScaleItem>[SeriesType]>(
	data: T
): data is Extract<T, LineData<HorzScaleItem> | HistogramData<HorzScaleItem>> {
	return (data as Partial<LineData<HorzScaleItem>>).value !== undefined;
}

/**
 * 序列对应的数据类型映射。
 * 例如柱状序列对应 `BarData | WhitespaceData`。
 */
export interface SeriesDataItemTypeMap<HorzScaleItem = Time> {
	/** 柱状序列的数据类型。 */
	Bar: BarData<HorzScaleItem> | WhitespaceData<HorzScaleItem>;
	/** 蜡烛图序列的数据类型。 */
	Candlestick: CandlestickData<HorzScaleItem> | WhitespaceData<HorzScaleItem>;
	/** 面积图序列的数据类型。 */
	Area: AreaData<HorzScaleItem> | WhitespaceData<HorzScaleItem>;
	/** 基准线序列的数据类型。 */
	Baseline: BaselineData<HorzScaleItem> | WhitespaceData<HorzScaleItem>;
	/** 折线序列的数据类型。 */
	Line: LineData<HorzScaleItem> | WhitespaceData<HorzScaleItem>;
	/** 直方图序列的数据类型。 */
	Histogram: HistogramData<HorzScaleItem> | WhitespaceData<HorzScaleItem>;
	/** 自定义序列的数据类型。 */
	Custom: CustomData<HorzScaleItem> | CustomSeriesWhitespaceData<HorzScaleItem>;
}

/**
 * 描述数据更新消费器的接口，供 DataLayer 调用。
 */
export interface DataUpdatesConsumer<TSeriesType extends SeriesType, HorzScaleItem = Time> {
	applyNewData(series: Series<TSeriesType>, data: SeriesDataItemTypeMap<HorzScaleItem>[TSeriesType][]): void;
	updateData(series: Series<TSeriesType>, data: SeriesDataItemTypeMap<HorzScaleItem>[TSeriesType], historicalUpdate: boolean): void;
}
