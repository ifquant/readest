import { ChartOptionsImpl } from '../chart-model';
import { LocalizationOptions } from '../localization-options';
import { HorzScalePriceItem } from './types';

/**
 * 价格横轴的本地化配置扩展，补充价格刻度格式相关选项。
 */
export interface PriceChartLocalizationOptions
	extends LocalizationOptions<HorzScalePriceItem> {
	/**
	 * 价格刻度保留的小数位数。
	 */
	precision: number;
}

/**
 * 价格横轴使用的图表配置，继承基础选项并指定价格格式化策略。
 */
export interface PriceChartOptions extends ChartOptionsImpl<number> {
	/**
	 * 控制价格和其他元素的本地化显示格式。
	 */
	localization: PriceChartLocalizationOptions;
}
