import { Mutable } from '../../helpers/mutable';

import { ChartOptionsImpl } from '../chart-model';
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
import { PriceChartLocalizationOptions } from './options';
import { HorzScalePriceItem } from './types';

// 比较两个刻度标记，返回权重更大的那个，用于挑选最显著的刻度。
function markWithGreaterWeight(a: TimeMark, b: TimeMark): TimeMark {
	return a.weight > b.weight ? a : b;
}

// 针对价格横轴的行为实现，直接以数字作为横坐标，负责刻度格式化与权重计算。
export class HorzScaleBehaviorPrice implements IHorzScaleBehavior<HorzScalePriceItem> {
	private _options!: ChartOptionsImpl<HorzScalePriceItem>;

	// 返回当前绑定的图表配置。
	public options(): ChartOptionsImpl<HorzScalePriceItem> {
		return this._options;
	}

	// 更新内部配置实例。
	public setOptions(options: ChartOptionsImpl<HorzScalePriceItem>): void {
		this._options = options;
	}

	// 价格横轴无需预处理数据，保持空实现。
	public preprocessData(
		data: DataItem<HorzScalePriceItem> | DataItem<HorzScalePriceItem>[]
	): void {}

	// 更新价格格式化配置，直接覆盖 chart 的 localization。
	public updateFormatter(options: PriceChartLocalizationOptions): void {
		if (!this._options) {
			return;
		}
		this._options.localization = options;
	}

	// 价格类型本身就是数字，转换为内部类型时仅做类型断言。
	public createConverterToInternalObj(
		data: SeriesDataItemTypeMap<HorzScalePriceItem>[SeriesType][]
	): HorzScaleItemConverterToInternalObj<HorzScalePriceItem> {
		return (price: number) => price as unknown as InternalHorzScaleItem;
	}

	// 价格横轴的键值就是自身。
	public key(
		internalItem: InternalHorzScaleItem | HorzScalePriceItem
	): InternalHorzScaleItemKey {
		return internalItem as InternalHorzScaleItemKey;
	}

	// 缓存 key 与内部值一致，便于快速比较。
	public cacheKey(internalItem: InternalHorzScaleItem): number {
		return internalItem as unknown as number;
	}

	// 对外部值做内部转换，实质为断言。
	public convertHorzItemToInternal(
		item: HorzScalePriceItem
	): InternalHorzScaleItem {
		return item as unknown as InternalHorzScaleItem;
	}

	// 使用配置精度输出价格刻度标签。
	public formatHorzItem(item: InternalHorzScaleItem): string {
		return (item as unknown as number).toFixed(this._precision());
	}

	// 按照横轴价格格式化 tick 标注。
	public formatTickmark(
		item: TickMark,
		localizationOptions: LocalizationOptions<HorzScalePriceItem>
	): string {
		return (item.time as unknown as number).toFixed(this._precision());
	}

	// 从一组刻度中找出最大权重。
	public maxTickMarkWeight(marks: TimeMark[]): TickMarkWeightValue {
		return marks.reduce(markWithGreaterWeight, marks[0]).weight;
	}

	// 根据价格的整数级别为刻度赋权，避免过于密集的标签。
	public fillWeightsForPoints(
		sortedTimePoints: readonly Mutable<TimeScalePoint>[],
		startIndex: number
	): void {
		const priceWeight = (price: number) => {
			if (price === Math.ceil(price / 100) * 100) {
				return 8;
			}
			if (price === Math.ceil(price / 50) * 50) {
				return 7;
			}
			if (price === Math.ceil(price / 25) * 25) {
				return 6;
			}
			if (price === Math.ceil(price / 10) * 10) {
				return 5;
			}
			if (price === Math.ceil(price / 5) * 5) {
				return 4;
			}
			if (price === Math.ceil(price)) {
				return 3;
			}
			if (price * 2 === Math.ceil(price * 2)) {
				return 1;
			}
			return 0;
		};
		for (let index = startIndex; index < sortedTimePoints.length; ++index) {
			sortedTimePoints[index].timeWeight = priceWeight(
				sortedTimePoints[index].time as unknown as number
			) as TickMarkWeightValue;
		}
	}

	// 读取配置中的价格精度。
	private _precision(): number {
		return (this._options.localization as PriceChartLocalizationOptions)
			.precision;
	}
}
