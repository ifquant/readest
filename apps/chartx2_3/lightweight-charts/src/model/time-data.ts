import { lowerBound, upperBound } from '../helpers/algorithms';
import { Nominal } from '../helpers/nominal';

import { Coordinate } from './coordinate';
import { InternalHorzScaleItem } from './ihorz-scale-behavior';
import { RangeImpl } from './range-impl';

/**
 * 刻度权重值，对应 TickMarkWeight 枚举。
 */
export type TickMarkWeightValue = Nominal<number, 'TickMarkWeightValue'>;

/**
 * 时间轴上的一个采样点。
 */
export interface TimeScalePoint {
	/** 刻度权重。 */
	readonly timeWeight: TickMarkWeightValue;
	/** 逻辑时间值。 */
	readonly time: InternalHorzScaleItem;
	/** 原始时间值（API 层）。 */
	readonly originalTime: unknown;
}

/** 通用范围结构，包含 `from` 与 `to`。 */
export interface IRange<T> {
	/** 范围起点。 */
	from: T;
	/** 范围终点。 */
	to: T;
}

export type TimePointsRange = IRange<Omit<TimeScalePoint, 'timeWeight'>>;

/**
 * 横向时间轴上的整数索引。
 */
export type TimePointIndex = Nominal<number, 'TimePointIndex'>;

/**
 * 时间轴逻辑坐标值。
 */
export type Logical = Nominal<number, 'Logical'>;

/**
 * 时间轴的逻辑范围，`from` 与 `to` 可能包含小数以表示连续滚动。
 * 起点为所有序列的首个数据项，之前索引为负，之后为正。
 * 小数部分表示可视区域覆盖的比例，例如 5.2 表示第 5 条完全可见，第 6 条显示 20%。
 */
export type LogicalRange = IRange<Logical>;

export interface TimedValue {
	time: TimePointIndex;
	x: Coordinate;
}

export type SeriesItemsIndexesRange = IRange<number>;

function lowerBoundItemsCompare(item: TimedValue, time: TimePointIndex): boolean {
	return item.time < time;
}

function upperBoundItemsCompare(item: TimedValue, time: TimePointIndex): boolean {
	return time < item.time;
}

/**
 * 计算给定逻辑范围内可见的数据索引区间，可选择向前后延伸一个数据点。
 */
export function visibleTimedValues(items: TimedValue[], range: RangeImpl<TimePointIndex>, extendedRange: boolean): SeriesItemsIndexesRange {
	const firstBar = range.left();
	const lastBar = range.right();

	const from = lowerBound(items, firstBar, lowerBoundItemsCompare);
	const to = upperBound(items, lastBar, upperBoundItemsCompare);

	if (!extendedRange) {
		return { from, to };
	}

	let extendedFrom = from;
	let extendedTo = to;

	if (from > 0 && from < items.length && items[from].time >= firstBar) {
		extendedFrom = from - 1;
	}

	if (to > 0 && to < items.length && items[to - 1].time <= lastBar) {
		extendedTo = to + 1;
	}

	return { from: extendedFrom, to: extendedTo };
}
