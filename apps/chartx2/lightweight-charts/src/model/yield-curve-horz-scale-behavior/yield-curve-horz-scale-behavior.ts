import { Delegate } from '../../helpers/delegate';
import { ISubscription } from '../../helpers/isubscription';
import { Mutable } from '../../helpers/mutable';

import { SeriesDataItemTypeMap } from '../data-consumer';
import {
	DataItem,
	HorzScaleItemConverterToInternalObj,
	IHorzScaleBehavior,
	InternalHorzScaleItem,
	InternalHorzScaleItemKey,
} from '../ihorz-scale-behavior';
import { LocalizationOptions } from '../localization-options';
import { SeriesType } from '../series-options';
import { TickMark } from '../tick-marks';
import { TickMarkWeightValue, TimeScalePoint } from '../time-data';
import { TimeMark } from '../time-scale';
import { YieldCurveChartOptions } from './yield-curve-chart-options';

type EventHandler = (...args: unknown[]) => void;
// 创建微任务级别的去抖处理器，避免频繁触发空白区域重建。
function createDebouncedMicroTaskHandler(callback: EventHandler): EventHandler {
	let scheduled = false;

	return function(...args: unknown[]): void {
		if (!scheduled) {
			scheduled = true;

			queueMicrotask((): void => {
				callback(...args);
				scheduled = false;
			});
		}
	};
}

// 比较刻度权重，返回权重较大的标记。
function markWithGreaterWeight(a: TimeMark, b: TimeMark): TimeMark {
	return a.weight > b.weight ? a : b;
}

function toInternalHorzScaleItem(
	item: number | InternalHorzScaleItem
): InternalHorzScaleItem {
	return item as unknown as InternalHorzScaleItem;
}

function fromInternalHorzScaleItem(
	item: InternalHorzScaleItem | number
): number {
	return item as unknown as number;
}

// 收益率曲线横轴行为实现，时间轴以月份数表示。
export class YieldCurveHorzScaleBehavior implements IHorzScaleBehavior<number> {
	private _options!: YieldCurveChartOptions;
	private readonly _pointsChangedDelegate: Delegate<number> = new Delegate();
	private _invalidateWhitespace: EventHandler = createDebouncedMicroTaskHandler(() => this._pointsChangedDelegate.fire(this._largestIndex));
	private _largestIndex: number = 0;

	/** Data changes might require that the whitespace be generated again */
	// 当需要重新生成空白数据时触发事件。
	public whitespaceInvalidated(): ISubscription<number> {
		return this._pointsChangedDelegate;
	}

	// 释放事件资源。
	public destroy(): void {
		this._pointsChangedDelegate.destroy();
	}

	// 返回当前配置。
	public options(): YieldCurveChartOptions {
		return this._options;
	}

	// 更新配置引用。
	public setOptions(options: YieldCurveChartOptions): void {
		this._options = options;
	}

	// 收益率曲线暂不需要数据预处理，保留空实现。
	public preprocessData(data: DataItem<number> | DataItem<number>[]): void {
		// No preprocessing needed for yield curve data
	}

	// 更新本地化配置，主要是时间格式化函数。
	public updateFormatter(options: LocalizationOptions<number>): void {
		if (!this._options) {
			return;
		}
		this._options.localization = options;
	}

	// 生成横轴转换器，并记录最大索引用于空白填补。
	public createConverterToInternalObj(
		data: SeriesDataItemTypeMap<number>[SeriesType][]
	): HorzScaleItemConverterToInternalObj<number> {
		this._invalidateWhitespace();
		return (time: number) => {
			if (time > this._largestIndex) {
				this._largestIndex = time;
			}
			return toInternalHorzScaleItem(time);
		};
	}

	// 横轴缓存键使用数字本身。
	public key(
		internalItem: InternalHorzScaleItem | number
	): InternalHorzScaleItemKey {
		return internalItem as unknown as InternalHorzScaleItemKey;
	}

	// 提供数字类型的缓存 key。
	public cacheKey(internalItem: InternalHorzScaleItem): number {
		return fromInternalHorzScaleItem(internalItem);
	}

	// 外部值直接转换为内部值。
	public convertHorzItemToInternal(item: number): InternalHorzScaleItem {
		return toInternalHorzScaleItem(item);
	}

	// 格式化横轴标签。
	public formatHorzItem(item: InternalHorzScaleItem): string {
		return this._formatTime(item as unknown as number);
	}

	// 格式化刻度标签。
	public formatTickmark(item: TickMark): string {
		return this._formatTime(item.time as unknown as number);
	}

	// 选择权重最大刻度，用于渲染决策。
	public maxTickMarkWeight(marks: TimeMark[]): TickMarkWeightValue {
		return marks.reduce(markWithGreaterWeight, marks[0]).weight;
	}

	// 按月份间距设定权重，并触发空白重建通知。
	public fillWeightsForPoints(
		sortedTimePoints: readonly Mutable<TimeScalePoint>[],
		startIndex: number
	): void {
		const timeWeight = (time: number) => {
			if (time % 120 === 0) {
				return 10;
			}
			if (time % 60 === 0) {
				return 9;
			}
			if (time % 36 === 0) {
				return 8;
			}
			if (time % 12 === 0) {
				return 7;
			}
			if (time % 6 === 0) {
				return 6;
			}
			if (time % 3 === 0) {
				return 5;
			}
			if (time % 1 === 0) {
				return 4;
			}
			return 0;
		};

		for (let index = startIndex; index < sortedTimePoints.length; ++index) {
			sortedTimePoints[index].timeWeight = timeWeight(
				fromInternalHorzScaleItem(sortedTimePoints[index].time)
			) as TickMarkWeightValue;
		}
		this._largestIndex = fromInternalHorzScaleItem(sortedTimePoints[sortedTimePoints.length - 1].time);
		this._invalidateWhitespace();
	}

	// 默认以 “年月” 形式格式化时间，若提供自定义 formatter 则优先使用。
	private _formatTime(months: number): string {
		if (this._options.localization?.timeFormatter) {
			return this._options.localization.timeFormatter(months);
		}

		if (months < 12) {
			return `${months}M`;
		}
		const years = Math.floor(months / 12);
		const remainingMonths = months % 12;
		if (remainingMonths === 0) {
			return `${years}Y`;
		}
		return `${years}Y${remainingMonths}M`;
	}
}
