import { Mutable } from '../helpers/mutable';
import { Nominal } from '../helpers/nominal';

import { ChartOptionsImpl } from './chart-model';
import { SeriesDataItemTypeMap } from './data-consumer';
import { LocalizationOptions } from './localization-options';
import { SeriesType } from './series-options';
import { TickMark } from './tick-marks';
import { TickMarkWeightValue, TimeScalePoint } from './time-data';
import { TimeMark } from './time-scale';

/**
 * 内部横轴刻度项的标称类型。
 */
export type InternalHorzScaleItem = Nominal<unknown, 'InternalHorzScaleItem'>;

/**
 * 将业务层的横轴刻度值转换为内部使用的刻度类型的函数。
 */
export type HorzScaleItemConverterToInternalObj<HorzScaleItem> = (time: HorzScaleItem) => InternalHorzScaleItem;

/**
 * 序列数据项的联合类型。
 */
export type DataItem<HorzScaleItem> = SeriesDataItemTypeMap<HorzScaleItem>[SeriesType];

/**
 * 横轴刻度项对应的整数键值。
 */
export type InternalHorzScaleItemKey = Nominal<number, 'InternalHorzScaleItemKey'>;

/**
 * 横轴行为接口：统一描述时间/横坐标的解析、格式化与权重计算流程。
 */
export interface IHorzScaleBehavior<HorzScaleItem> {
	/**
	 * 获取图表选项。
	 */
	options(): ChartOptionsImpl<HorzScaleItem>;
	/**
	 * 设置完整的图表选项（直接覆盖而非 merge）。
	 */
	setOptions(options: ChartOptionsImpl<HorzScaleItem>): void;
	/**
	 * 对输入数据进行预处理（例如补充缺省字段、缓存转换器等）。
	 */
	preprocessData(data: DataItem<HorzScaleItem> | DataItem<HorzScaleItem>[]): void;
	/**
	 * 将外部时间值转换为内部刻度。
	 */
	convertHorzItemToInternal(item: HorzScaleItem): InternalHorzScaleItem;
	/**
	 * 基于已有数据创建转换器，后续可复用以提升性能。
	 */
	createConverterToInternalObj(data: SeriesDataItemTypeMap<HorzScaleItem>[SeriesType][]): HorzScaleItemConverterToInternalObj<HorzScaleItem>;
	/**
	 * 获取刻度项的整数键（用于排序/比较）。
	 */
	key(internalItem: InternalHorzScaleItem | HorzScaleItem): InternalHorzScaleItemKey;
	/**
	 * 获取刻度项的缓存键（通常与 format/cache 关联）。
	 */
	cacheKey(internalItem: InternalHorzScaleItem): number;
	/**
	 * 根据最新的本地化参数更新格式化器。
	 */
	updateFormatter(options: LocalizationOptions<HorzScaleItem>): void;
	/**
	 * 将内部刻度格式化为展示字符串。
	 */
	formatHorzItem(item: InternalHorzScaleItem): string;
	/**
	 * 格式化刻度线文本，可结合本地化信息。
	 */
	formatTickmark(item: TickMark, localizationOptions: LocalizationOptions<HorzScaleItem>): string;
	/**
	 * 返回可见刻度中的最大权重，用于控制渲染粒度。
	 */
	maxTickMarkWeight(marks: TimeMark[]): TickMarkWeightValue;
	/**
	 * 为有序的时间点填充权重值。
	 */
	fillWeightsForPoints(sortedTimePoints: readonly Mutable<TimeScalePoint>[], startIndex: number): void;

	/**
	 * 控制是否强制刷新所有可见刻度的文本。
	 */
	shouldResetTickmarkLabels?(tickMarks: readonly TickMark[]): boolean;
}
