import { undefinedIfNull } from '../../helpers/strict-type-checks';

import { BarPrice } from '../../model/bar';
import { IChartModelBase } from '../../model/chart-model';
import { Coordinate } from '../../model/coordinate';
import { ISeries } from '../../model/iseries';
import { PlotRowValueIndex } from '../../model/plot-data';
import { PriceScale } from '../../model/price-scale';
import { ISeriesBarColorer } from '../../model/series-bar-colorer';
import { SeriesPlotRow } from '../../model/series-data';
import { TimePointIndex } from '../../model/time-data';
import { ITimeScale } from '../../model/time-scale';
import { BarCandlestickItemBase } from '../../renderers/bars-renderer';
import { IPaneRenderer } from '../../renderers/ipane-renderer';

import { SeriesPaneViewBase } from './series-pane-view-base';

// 基于柱状/蜡烛图的面板视图基类，共享坐标转换与数据生成逻辑。
export abstract class BarsPaneViewBase<TSeriesType extends 'Bar' | 'Candlestick', ItemType extends BarCandlestickItemBase, TRenderer extends IPaneRenderer> extends SeriesPaneViewBase<TSeriesType, ItemType, TRenderer> {
	public constructor(series: ISeries<TSeriesType>, model: IChartModelBase) {
		super(series, model, false);
	}

	// 将时间索引与价格映射为屏幕坐标。
	protected _convertToCoordinates(priceScale: PriceScale, timeScale: ITimeScale, firstValue: number): void {
		timeScale.indexesToCoordinates(this._items, undefinedIfNull(this._itemsVisibleRange));
		priceScale.barPricesToCoordinates(this._items, firstValue, undefinedIfNull(this._itemsVisibleRange));
	}

	protected abstract _createRawItem(time: TimePointIndex, bar: SeriesPlotRow<TSeriesType>, colorer: ISeriesBarColorer<TSeriesType>): ItemType;

	// 构建 Item 的默认结构，包含开高低收及坐标占位。
	protected _createDefaultItem(time: TimePointIndex, bar: SeriesPlotRow<TSeriesType>, colorer: ISeriesBarColorer<TSeriesType>): BarCandlestickItemBase {
		return {
			time: time,
			open: bar.value[PlotRowValueIndex.Open] as BarPrice,
			high: bar.value[PlotRowValueIndex.High] as BarPrice,
			low: bar.value[PlotRowValueIndex.Low] as BarPrice,
			close: bar.value[PlotRowValueIndex.Close] as BarPrice,
			x: NaN as Coordinate,
			openY: NaN as Coordinate,
			highY: NaN as Coordinate,
			lowY: NaN as Coordinate,
			closeY: NaN as Coordinate,
		};
	}

	// 遍历系列数据，生成渲染所需的原始点集合。
	protected _fillRawPoints(): void {
		const colorer = this._series.barColorer();

		this._items = this._series.bars().rows().map((row: SeriesPlotRow<TSeriesType>) => this._createRawItem(row.index, row, colorer));
	}
}
