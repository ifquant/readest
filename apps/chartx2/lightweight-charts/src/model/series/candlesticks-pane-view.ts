import { SeriesBarColorer } from '../../model/series-bar-colorer';
import { SeriesPlotRow } from '../../model/series-data';
import { TimePointIndex } from '../../model/time-data';
import {
	CandlestickItem,
	PaneRendererCandlesticks,
} from '../../renderers/candlesticks-renderer';

import { BarsPaneViewBase } from './bars-pane-view-base';

// 蜡烛图面板视图，负责生成烛体渲染数据。
export class SeriesCandlesticksPaneView extends BarsPaneViewBase<'Candlestick', CandlestickItem, PaneRendererCandlesticks> {
	protected readonly _renderer: PaneRendererCandlesticks = new PaneRendererCandlesticks();

	// 将默认 OHLC 值与颜色样式组合为绘制条目。
	protected _createRawItem(time: TimePointIndex, bar: SeriesPlotRow<'Candlestick'>, colorer: SeriesBarColorer<'Candlestick'>): CandlestickItem {
		return {
			...this._createDefaultItem(time, bar, colorer),
			...colorer.barStyle(time),
		};
	}

	// 设置渲染器所需的间距、影线/边框可见性等属性。
	protected _prepareRendererData(): void {
		const candlestickStyleProps = this._series.options();

		this._renderer.setData({
			bars: this._items,
			barSpacing: this._model.timeScale().barSpacing(),
			wickVisible: candlestickStyleProps.wickVisible,
			borderVisible: candlestickStyleProps.borderVisible,
			visibleRange: this._itemsVisibleRange,
		});
	}
}
