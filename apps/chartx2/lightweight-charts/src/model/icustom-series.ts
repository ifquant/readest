import { CanvasRenderingTarget2D } from 'fancy-canvas';

import { Coordinate } from './coordinate';
import { Time } from './horz-scale-behavior-time/types';
import { CustomSeriesOptions } from './series-options';
import { IRange } from './time-data';

/**
 * 自定义序列中的“空白”数据点（无数值，仅占位时间）。
 */
export interface CustomSeriesWhitespaceData<HorzScaleItem> {
	/** 对应的时间值。 */
	time: HorzScaleItem;

	/** 附加自定义字段，库不会处理，可供插件使用。 */
	customValues?: Record<string, unknown>;
}

/**
 * 自定义序列的基础数据结构，可根据需要扩展属性。
 */
export interface CustomData<HorzScaleItem = Time> extends CustomSeriesWhitespaceData<HorzScaleItem> {
	/**
	 * 若指定，则用于该数据点的价格线及价格轴标签颜色。
	 */
	color?: string;
}

export type WhitespaceCheck<HorzScaleItem, TData extends CustomData<HorzScaleItem> = CustomData<HorzScaleItem>> = (bar: TData | CustomSeriesWhitespaceData<HorzScaleItem>) => bar is CustomSeriesWhitespaceData<HorzScaleItem>;

/**
 * 自定义序列传递给渲染器的单条数据。
 */
export interface CustomBarItemData<
	HorzScaleItem,
	TData extends CustomData<HorzScaleItem> = CustomData<HorzScaleItem>
> {
	/** 条目在画布上的 X 坐标（相对于 pane 左侧的像素）。 */
	x: number;
	/** 对应的时间轴逻辑索引。 */
	time: number;
	/** 原始数据对象。 */
	originalData: TData;
	/** 该数据项指定的颜色（常用于价格线/标签）。 */
	barColor: string;
}

/**
 * 传递给自定义序列 Pane 视图的数据，用于渲染。
 */
export interface PaneRendererCustomData<
	HorzScaleItem,
	TData extends CustomData<HorzScaleItem>
> {
	/** 序列条目及其对应的 X 坐标列表。 */
	bars: readonly CustomBarItemData<HorzScaleItem, TData>[];
	/** 相邻柱之间的像素间距。 */
	barSpacing: number;
	/** 当前可见的条目范围。 */
	visibleRange: IRange<number> | null;
}

/**
 * 将价格转换为纵向坐标的便捷函数，等同于调用系列的 `priceToCoordinate`。
 */
export type PriceToCoordinateConverter = (price: number) => Coordinate | null;

/**
 * 自定义序列专用的渲染器接口，负责在主图 pane 绘制。
 */
export interface ICustomSeriesPaneRenderer {
	/**
	 * 绘制函数。
	 *
	 * @param target FancyCanvas 提供的上下文。
	 * @param priceConverter 价格→坐标转换器。
	 * @param isHovered 当前是否处于 hover 状态。
	 * @param hitTestData 可选的命中测试数据。
	 */
	draw(
		target: CanvasRenderingTarget2D,
		priceConverter: PriceToCoordinateConverter,
		isHovered: boolean,
		hitTestData?: unknown
	): void;
}

/**
 * 自定义序列的价格集合。通常包含最大值、最小值及当前值（数组最后一项视为当前值）。
 */
export type CustomSeriesPricePlotValues = number[];

/**
 * 自定义序列的 Pane 视图接口。
 */
export interface ICustomSeriesPaneView<
	HorzScaleItem = Time,
	TData extends CustomData<HorzScaleItem> = CustomData<HorzScaleItem>,
	TSeriesOptions extends CustomSeriesOptions = CustomSeriesOptions
> {
	/** 获取用于绘制的渲染器实例。 */
	renderer(): ICustomSeriesPaneRenderer;

	/** 在每次绘制前传入最新的数据与配置。 */
	update(
		data: PaneRendererCustomData<HorzScaleItem, TData>,
		seriesOptions: TSeriesOptions
	): void;

	/**
	 * 解析自定义数据，返回用于自动缩放/十字线的价格数组（最后一项视为当前值）。
	 */
	priceValueBuilder(plotRow: TData): CustomSeriesPricePlotValues;

	/**
	 * 判断数据是否为空白点。
	 */
	isWhitespace(data: TData | CustomSeriesWhitespaceData<HorzScaleItem>): data is CustomSeriesWhitespaceData<HorzScaleItem>;

	/** 返回默认配置。 */
	defaultOptions(): TSeriesOptions;

	/**
	 * 序列移除时触发，可释放资源/解绑事件等。
	 */
	destroy?(): void;
}
