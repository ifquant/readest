import { Time } from './horz-scale-behavior-time/types';
import {
	PercentageFormatterFn,
	PriceFormatterFn,
	TickmarksPercentageFormatterFn,
	TickmarksPriceFormatterFn,
} from './price-formatter-fn';

/**
 * 自定义时间格式化函数，将时间值转换为字符串。
 */
export type TimeFormatterFn<HorzScaleItem = Time> = (time: HorzScaleItem) => string;

/**
 * 本地化基础配置。
 */
export interface LocalizationOptionsBase {
	/**
	 * 控制日期格式化所使用的语言环境，默认取浏览器语言。
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_identification_and_negotiation
	 * @defaultValue `navigator.language`
	 */
	locale: string;

	/**
	 * 覆盖价格轴刻度、标签及十字光标的显示格式。
	 *
	 * @see {@link PriceFormatCustom}
	 * @defaultValue `undefined`
	 */
	priceFormatter?: PriceFormatterFn;

	/**
	 * 自定义价格刻度格式化逻辑，可基于所有提供的价格值共同决定格式。
	 *
	 * @defaultValue `undefined`
	 */
	tickmarksPriceFormatter?: TickmarksPriceFormatterFn;

	/**
	 * 自定义百分比刻度的格式化结果。
	 *
	 * @defaultValue `undefined`
	 */
	percentageFormatter?: PercentageFormatterFn;

	/**
	 * 基于所有待格式化的百分比值统一决定格式。
	 *
	 * @defaultValue `undefined`
	 */
	tickmarksPercentageFormatter?: TickmarksPercentageFormatterFn;

}

/**
 * 日期、时间、价格的本地化选项集合。
 */
export interface LocalizationOptions<HorzScaleItem> extends LocalizationOptionsBase {

	/**
	 * 覆盖时间轴十字光标标签的格式。
	 *
	 * @defaultValue `undefined`
	 */
	timeFormatter?: TimeFormatterFn<HorzScaleItem>;

	/**
	 * 日期格式化模板，可包含 `yyyy`、`yy`、`MMMM`、`MMM`、`MM`、`dd` 等占位符。
	 * 如指定 `timeFormatter`，则该字段被忽略。
	 *
	 * @defaultValue `'dd MMM \'yy'`
	 */
	dateFormat: string;
}
