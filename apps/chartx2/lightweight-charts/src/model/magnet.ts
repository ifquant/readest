import { ensure } from '../helpers/assertions';

import { Coordinate } from './coordinate';
import { CrosshairMode, CrosshairOptions } from './crosshair';
import { IPriceDataSource } from './iprice-data-source';
import { ISeries } from './iseries';
import { Pane } from './pane';
import { PlotRowValueIndex } from './plot-data';
import { Series } from './series';
import { SeriesType } from './series-options';
import { TimePointIndex } from './time-data';

const magnetPlotRowKeys: readonly PlotRowValueIndex[] = [
	PlotRowValueIndex.Close,
] as const;
const magnetOHLCPlotRowKeys: readonly PlotRowValueIndex[] = [
	PlotRowValueIndex.Open,
	PlotRowValueIndex.High,
	PlotRowValueIndex.Low,
	PlotRowValueIndex.Close,
] as const;

/**
 * 价格吸附工具，用于在十字光标“磁吸”模式下，将光标 y 轴对应的价格吸附到相邻的 K 线数据点上。
 * 逻辑上会从当前 pane 的所有主图/副图系列中寻找当前时间点的候选价格值，并选择与当前坐标最接近的一个。
 */
export class Magnet {
	private readonly _options: CrosshairOptions;

	/**
	 * @param options 十字光标配置，其中 mode 控制吸附模式（关闭/只吸附收盘价/吸附 OHLC）。
	 */
	public constructor(options: CrosshairOptions) {
		this._options = options;
	}

	/**
	 * 根据十字光标当前的价格值和时间点，计算磁吸后的价格。
	 *
	 * @param price 光标当前所处的价格值（未吸附）。
	 * @param index 对应的时间索引。
	 * @param pane 当前光标所在的面板。
	 */
	public align(price: number, index: TimePointIndex, pane: Pane): number {
		let res = price;
		if (this._options.mode === CrosshairMode.Normal) {
			// 常规模式下不做任何吸附，直接返回原始价格即可。
			return res;
		}

		const defaultPriceScale = pane.defaultPriceScale();
		const firstValue = defaultPriceScale.firstValue();

		if (firstValue === null) {
			// 如果坐标轴还没有初始化数值，则无法换算，直接返回。
			return res;
		}

		const y = defaultPriceScale.priceToCoordinate(price, firstValue);

		// 收集当前 pane 上所有序列（排除覆盖图层与隐藏序列）的候选价格坐标。
		const serieses: readonly ISeries<SeriesType>[] = pane.dataSources().filter(
			((ds: IPriceDataSource) => (ds instanceof Series)) as (ds: IPriceDataSource) => ds is Series<SeriesType>);

		const candidates = serieses.reduce(
			(acc: Coordinate[], series: ISeries<SeriesType>) => {
				if (pane.isOverlay(series) || !series.visible()) {
					// 覆盖图层或隐藏序列不参与吸附。
					return acc;
				}
				const ps = series.priceScale();
				const bars = series.bars();
				if (ps.isEmpty() || !bars.contains(index)) {
					// 若当前时间点没有数据或价格轴为空，跳过。
					return acc;
				}

				const bar = bars.valueAt(index);
				if (bar === null) {
					return acc;
				}

				// 根据配置决定吸附到收盘价还是 OHLC (四个值)。
				const firstPrice = ensure(series.firstValue());
				const plotRowKeys = this._options.mode === CrosshairMode.MagnetOHLC
					? magnetOHLCPlotRowKeys
					: magnetPlotRowKeys;
				return acc.concat(
					plotRowKeys.map((key: PlotRowValueIndex) => ps.priceToCoordinate(bar.value[key], firstPrice.value))
				);
			},
			[] as Coordinate[]);

		if (candidates.length === 0) {
			// 没有任何候选，则保持原价。
			return res;
		}

		// 选取距离当前光标坐标最近的候选值。
		candidates.sort((y1: Coordinate, y2: Coordinate) => Math.abs(y1 - y) - Math.abs(y2 - y));

		const nearest = candidates[0];
		res = defaultPriceScale.coordinateToPrice(nearest, firstValue);

		return res;
	}
}
