import { LineStyle, LineWidth } from '../renderers/draw-line';

/**
 * 价格线配置。
 */
export interface PriceLineOptions {
	/** 价格线的可选 ID。 */
	id?: string;
	/**
	 * 价格线对应的数值。
	 *
	 * @defaultValue `0`
	 */
	price: number;
	/**
	 * 价格线颜色。
	 *
	 * @defaultValue `''`
	 */
	color: string;
	/**
	 * 价格线宽度（像素）。
	 *
	 * @defaultValue `1`
	 */
	lineWidth: LineWidth;
	/**
	 * 价格线样式。
	 *
	 * @defaultValue {@link LineStyle.Solid}
	 */
	lineStyle: LineStyle;
	/**
	 * 是否显示价格线。
	 *
	 * @defaultValue `true`
	 */
	lineVisible: boolean;
	/**
	 * 是否在价格轴上显示当前值标签。
	 *
	 * @defaultValue `true`
	 */
	axisLabelVisible: boolean;
	/**
	 * 价格线标题，将绘制在图表上。
	 *
	 * @defaultValue `''`
	 */
	title: string;
	/**
	 * 轴标签背景色，默认沿用价格线颜色。
	 *
	 * @defaultValue `''`
	 */
	axisLabelColor: string;
	/**
	 * 轴标签文字颜色。
	 *
	 * @defaultValue `''`
	 */
	axisLabelTextColor: string;
}

/**
 * {@link ISeriesApi.createPriceLine} 方法所需的配置类型。
 * `price` 为必填，其余字段可选。
 */
export type CreatePriceLineOptions = Partial<PriceLineOptions> & Pick<PriceLineOptions, 'price'>;
