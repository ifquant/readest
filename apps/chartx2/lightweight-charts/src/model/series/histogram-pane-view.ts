import { ensureNotNull } from '../../helpers/assertions';

import { BarPrice } from '../../model/bar';
import { ISeriesBarColorer } from '../../model/series-bar-colorer';
import { TimePointIndex } from '../../model/time-data';
import { HistogramItem, PaneRendererHistogram, PaneRendererHistogramData } from '../../renderers/histogram-renderer';

import { LinePaneViewBase } from './line-pane-view-base';

// 直方图面板视图，以折线基类实现单柱渲染。
export class SeriesHistogramPaneView extends LinePaneViewBase<'Histogram', HistogramItem, PaneRendererHistogram> {
	protected readonly _renderer: PaneRendererHistogram = new PaneRendererHistogram();

	// 构建包含颜色的绘制项。
	protected _createRawItem(time: TimePointIndex, price: BarPrice, colorer: ISeriesBarColorer<'Histogram'>): HistogramItem {
		return {
			...this._createRawItemBase(time, price),
			...colorer.barStyle(time),
		};
	}

	// 设置直方图渲染器的数据与基准线位置。
	protected _prepareRendererData(): void {
		const data: PaneRendererHistogramData = {
			items: this._items,
			barSpacing: this._model.timeScale().barSpacing(),
			visibleRange: this._itemsVisibleRange,
			histogramBase: this._series.priceScale().priceToCoordinate(this._series.options().base, ensureNotNull(this._series.firstValue()).value),
		};

		this._renderer.setData(data);
	}
}
