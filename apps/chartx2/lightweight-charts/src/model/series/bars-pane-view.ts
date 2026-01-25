import { SeriesBarColorer } from '../../model/series-bar-colorer';
import { SeriesPlotRow } from '../../model/series-data';
import { SeriesType } from '../../model/series-options';
import { TimePointIndex } from '../../model/time-data';
import {
	BarItem,
	PaneRendererBars,
} from '../../renderers/bars-renderer';

import { BarsPaneViewBase } from './bars-pane-view-base';

// 柱状图面板视图，利用父类将数据映射成 BarItem。
export class SeriesBarsPaneView extends BarsPaneViewBase<'Bar', BarItem, PaneRendererBars> {
	protected readonly _renderer: PaneRendererBars = new PaneRendererBars();

	// 组合默认 Item 和颜色样式，生成最终绘制数据。
	protected _createRawItem(time: TimePointIndex, bar: SeriesPlotRow<SeriesType>, colorer: SeriesBarColorer<'Bar'>): BarItem {
		return {
			...this._createDefaultItem(time, bar, colorer),
			...colorer.barStyle(time),
		};
	}

	// 准备渲染器参数，包括条宽和可见区间。
	protected _prepareRendererData(): void {
		const barStyleProps = this._series.options();

		this._renderer.setData({
			bars: this._items,
			barSpacing: this._model.timeScale().barSpacing(),
			openVisible: barStyleProps.openVisible,
			thinBars: barStyleProps.thinBars,
			visibleRange: this._itemsVisibleRange,
		});
	}
}
