import { DateFormatter } from '../../formatters/date-formatter';
import { DateTimeFormatter } from '../../formatters/date-time-formatter';

import { ensureNotNull } from '../../helpers/assertions';
import { Mutable } from '../../helpers/mutable';
import { DeepPartial, merge } from '../../helpers/strict-type-checks';

import { SeriesDataItemTypeMap } from '../data-consumer';
import { DataItem, HorzScaleItemConverterToInternalObj, IHorzScaleBehavior, InternalHorzScaleItem, InternalHorzScaleItemKey } from '../ihorz-scale-behavior';
import { LocalizationOptions } from '../localization-options';
import { SeriesType } from '../series-options';
import { TickMark } from '../tick-marks';
import { TickMarkWeightValue, TimeScalePoint } from '../time-data';
import { markWithGreaterWeight, TimeMark } from '../time-scale';
import { defaultTickMarkFormatter } from './default-tick-mark-formatter';
import { TimeChartOptions } from './time-based-chart-options';
import { fillWeightsForPoints } from './time-scale-point-weight-generator';
import { convertStringsToBusinessDays, convertStringToBusinessDay, convertTime, selectTimeConverter } from './time-utils';
import { TickMarkType, TickMarkWeight, Time, TimePoint } from './types';

/**
 * 时间轴的本地化配置，扩展了日期格式化字符串等信息。
 */
interface TimeLocalizationOptions extends LocalizationOptions<Time> {
	/**
	 * 日期格式模版，例如 `dd MMM 'yy`。
	 */
	dateFormat: string;
}

/**
 * 时间刻度的自定义格式化函数，允许根据刻度类型和语言环境返回短标签。
 * 返回 `null` 时会回退到默认格式化器。
 */
export type TickMarkFormatter = (time: Time, tickMarkType: TickMarkType, locale: string) => string | null;

// eslint-disable-next-line complexity
function weightToTickMarkType(weight: TickMarkWeight, timeVisible: boolean, secondsVisible: boolean): TickMarkType {
	// 根据刻度权重和配置决定展示年/月/日或时间，避免信息过载。
	switch (weight) {
		case TickMarkWeight.LessThanSecond:
		case TickMarkWeight.Second:
			return timeVisible
				? (secondsVisible ? TickMarkType.TimeWithSeconds : TickMarkType.Time)
				: TickMarkType.DayOfMonth;

		case TickMarkWeight.Minute1:
		case TickMarkWeight.Minute5:
		case TickMarkWeight.Minute30:
		case TickMarkWeight.Hour1:
		case TickMarkWeight.Hour3:
		case TickMarkWeight.Hour6:
		case TickMarkWeight.Hour12:
			return timeVisible ? TickMarkType.Time : TickMarkType.DayOfMonth;

		case TickMarkWeight.Day:
			return TickMarkType.DayOfMonth;

		case TickMarkWeight.Month:
			return TickMarkType.Month;

		case TickMarkWeight.Year:
			return TickMarkType.Year;
	}
}

// 常规时间横轴的行为实现：负责数据预处理、坐标转换和刻度文本。
export class HorzScaleBehaviorTime implements IHorzScaleBehavior<Time> {
	private _dateTimeFormatter!: DateFormatter | DateTimeFormatter;
	private _options!: TimeChartOptions;

	// 返回当前配置。
	public options(): TimeChartOptions {
		return this._options;
	}

	// 当配置变更时，更新格式化器以匹配新的参数。
	public setOptions(options: TimeChartOptions): void {
		this._options = options;
		this.updateFormatter(options.localization as TimeLocalizationOptions);
	}

	// 预处理数据：将字符串日期转换为 BusinessDay 对象，确保内部统一。
	public preprocessData(data: DataItem<Time> | DataItem<Time>[]): void {
		if (Array.isArray(data)) {
			convertStringsToBusinessDays(data);
		} else {
			convertStringToBusinessDay(data);
		}
	}

	// 根据系列数据推断使用 BusinessDay 还是时间戳。
	public createConverterToInternalObj(data: SeriesDataItemTypeMap<Time>[SeriesType][]): HorzScaleItemConverterToInternalObj<Time> {
		return ensureNotNull(selectTimeConverter(data));
	}

	// 为不同输入类型生成稳定的缓存键。
	public key(item: InternalHorzScaleItem | Time): InternalHorzScaleItemKey {
		// eslint-disable-next-line no-restricted-syntax
		if (typeof item === 'object' && 'timestamp' in item) {
			return (item as unknown as TimePoint).timestamp as unknown as InternalHorzScaleItemKey;
		} else {
			return this.key(this.convertHorzItemToInternal(item as Time));
		}
	}

	// 用于缓存和比较的唯一数值键。
	public cacheKey(item: InternalHorzScaleItem): number {
		const time = item as unknown as TimePoint;
		return time.businessDay === undefined
			? new Date(time.timestamp * 1000).getTime()
			: new Date(Date.UTC(time.businessDay.year, time.businessDay.month - 1, time.businessDay.day)).getTime();
	}

	// 将外部时间值统一转换为内部结构。
	public convertHorzItemToInternal(item: Time): InternalHorzScaleItem {
		return convertTime(item);
	}

	// 当本地化配置调整时，重建日期/时间格式化器。
	public updateFormatter(options: TimeLocalizationOptions): void {
		if (!this._options) {
			return;
		}
		const dateFormat = options.dateFormat;

		if (this._options.timeScale.timeVisible) {
			this._dateTimeFormatter = new DateTimeFormatter({
				dateFormat: dateFormat,
				timeFormat: this._options.timeScale.secondsVisible ? '%h:%m:%s' : '%h:%m',
				dateTimeSeparator: '   ',
				locale: options.locale,
			});
		} else {
			this._dateTimeFormatter = new DateFormatter(dateFormat, options.locale);
		}
	}

	// 将内部时间格式化为轴标签。
	public formatHorzItem(item: InternalHorzScaleItem): string {
		const tp = item as unknown as TimePoint;
		return this._dateTimeFormatter.format(new Date(tp.timestamp * 1000));
	}

	// 计算刻度文本，优先使用自定义 formatter。
	public formatTickmark(tickMark: TickMark, localizationOptions: LocalizationOptions<Time>): string {
		const tickMarkType = weightToTickMarkType(tickMark.weight, this._options.timeScale.timeVisible, this._options.timeScale.secondsVisible);

		const options = this._options.timeScale;

		if (options.tickMarkFormatter !== undefined) {
			const tickMarkString = options.tickMarkFormatter(
				tickMark.originalTime as Time,
				tickMarkType,
				localizationOptions.locale
			);
			if (tickMarkString !== null) {
				return tickMarkString;
			}
		}

		return defaultTickMarkFormatter(tickMark.time as unknown as TimePoint, tickMarkType, localizationOptions.locale);
	}

	// 返回当前可见刻度中最高的权重，适配渲染优先级。
	public maxTickMarkWeight(tickMarks: TimeMark[]): TickMarkWeightValue {
		let maxWeight = tickMarks.reduce(markWithGreaterWeight, tickMarks[0]).weight;

		// special case: it looks strange if 15:00 is bold but 14:00 is not
		// so if maxWeight > TickMarkWeight.Hour1 and < TickMarkWeight.Day reduce it to TickMarkWeight.Hour1
		if (maxWeight > TickMarkWeight.Hour1 && maxWeight < TickMarkWeight.Day) {
			maxWeight = TickMarkWeight.Hour1 as TickMarkWeightValue;
		}
		return maxWeight;
	}

	// 为时间点补充权重信息，驱动刻度精度切换。
	public fillWeightsForPoints(sortedTimePoints: readonly Mutable<TimeScalePoint>[], startIndex: number): void {
		fillWeightsForPoints(sortedTimePoints, startIndex);
	}

	// 应用默认值（主要是日期格式），同时合并用户配置。
	public static applyDefaults(options?: DeepPartial<TimeChartOptions>): DeepPartial<TimeChartOptions> {
		return merge({ localization: { dateFormat: 'dd MMM \'yy' } }, options ?? {});
	}
}
