import { BarPrice } from '../../model/bar';
import { ISeriesBarColorer } from '../../model/series-bar-colorer';
import { LinePaneViewBase } from '../../model/series/line-pane-view-base';
import { TimePointIndex } from '../../model/time-data';
import { LineStrokeItem, PaneRendererLine, PaneRendererLineData } from '../../renderers/line-renderer';

// 折线系列面板视图，负责提供折线渲染数据。
export class SeriesLinePaneView extends LinePaneViewBase<'Line', LineStrokeItem, PaneRendererLine> {
	protected readonly _renderer: PaneRendererLine = new PaneRendererLine();

	// 构造绘制条目，结合基础点位和颜色配置。
	protected _createRawItem(time: TimePointIndex, price: BarPrice, colorer: ISeriesBarColorer<'Line'>): LineStrokeItem {
		return {
			...this._createRawItemBase(time, price),
			...colorer.barStyle(time),
		};
	}

	// 准备渲染器数据，包括线型、宽度和点标记。
	protected _prepareRendererData(): void {
		const options = this._series.options();

		const data: PaneRendererLineData = {
			items: this._items,
			lineStyle: options.lineStyle,
			lineType: options.lineVisible ? options.lineType : undefined,
			lineWidth: options.lineWidth,
			pointMarkersRadius: options.pointMarkersVisible ? (options.pointMarkersRadius || options.lineWidth / 2 + 2) : undefined,
			visibleRange: this._itemsVisibleRange,
			barWidth: this._model.timeScale().barSpacing(),
		};

		this._renderer.setData(data);
	}
}
