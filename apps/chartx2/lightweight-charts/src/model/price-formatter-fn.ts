import { BarPrice } from './bar';

/**
 * 将 {@link BarPrice} 转换为字符串的函数类型。
 */
export type PriceFormatterFn = (priceValue: BarPrice) => string;

export type TickmarksPriceFormatterFn = (priceValue: BarPrice[]) => string[];

/**
 * 将百分比值格式化为字符串的函数类型。
 */
export type PercentageFormatterFn = (percentageValue: number) => string;

export type TickmarksPercentageFormatterFn = (percentageValue: number[]) => string[];
