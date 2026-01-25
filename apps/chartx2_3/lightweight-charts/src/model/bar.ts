import { Nominal } from '../helpers/nominal';

import { Coordinate } from './coordinate';

/**
 * 以 Nominal 类型标记的价格值，避免与普通 `number` 混淆。
 */
export type BarPrice = Nominal<number, 'BarPrice'>;

/**
 * K 线的 OHLC（开、高、低、收）价格集合。
 */
export interface BarPrices {
	/**
	 * 开盘价。
	 */
	open: BarPrice;
	/**
	 * 最高价。
	 */
	high: BarPrice;
	/**
	 * 最低价。
	 */
	low: BarPrice;
	/**
	 * 收盘价。
	 */
	close: BarPrice;
}

/**
 * K 线各价位映射到画布 y 坐标后的结果，用于渲染。
 */
export interface BarCoordinates {
	openY: Coordinate;
	highY: Coordinate;
	lowY: Coordinate;
	closeY: Coordinate;
}
