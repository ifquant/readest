import { InternalHorzScaleItem } from './ihorz-scale-behavior';
import { TimePointIndex } from './time-data';

/**
 * PlotRow 值数组中 OHLC 各元素的索引。
 */
export const enum PlotRowValueIndex {
	Open = 0,
	High = 1,
	Low = 2,
	Close = 3,
}

export type PlotRowValue = [
	number, // open
	number, // high
	number, // low
	number, // close
];

/**
 * 单条 PlotRow 数据，封装时间索引、逻辑时间与数值等信息。
 */
export interface PlotRow {
	readonly index: TimePointIndex;
	readonly time: InternalHorzScaleItem;
	readonly originalTime: unknown;
	readonly value: PlotRowValue;
	readonly customValues?: Record<string, unknown>;
}
