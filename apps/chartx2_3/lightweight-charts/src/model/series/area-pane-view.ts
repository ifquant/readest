import { BarPrice } from '../../model/bar';
import { IChartModelBase } from '../../model/chart-model';
import { ISeries } from '../../model/iseries';
import { ISeriesBarColorer } from '../../model/series-bar-colorer';
import { TimePointIndex } from '../../model/time-data';
import { AreaFillItem, PaneRendererArea } from '../../renderers/area-renderer';
import { CompositeRenderer } from '../../renderers/composite-renderer';
import { LineStrokeItem, PaneRendererLine } from '../../renderers/line-renderer';

import { LinePaneViewBase } from './line-pane-view-base';

// 面积图系列的面板视图，组合填充和折线渲染器实现渐变区域。
export class SeriesAreaPaneView extends LinePaneViewBase<'Area', AreaFillItem & LineStrokeItem, CompositeRenderer> {
	protected readonly _renderer: CompositeRenderer = new CompositeRenderer();
	private readonly _areaRenderer: PaneRendererArea = new PaneRendererArea();
	private readonly _lineRenderer: PaneRendererLine = new PaneRendererLine();

	public constructor(series: ISeries<'Area'>, model: IChartModelBase) {
		super(series, model);
		this._renderer.setRenderers([this._areaRenderer, this._lineRenderer]);
	}

	// 创建绘制数据，融合基础坐标与颜色信息。
	protected _createRawItem(time: TimePointIndex, price: BarPrice, colorer: ISeriesBarColorer<'Area'>): AreaFillItem & LineStrokeItem {
		return {
			...this._createRawItemBase(time, price),
			...colorer.barStyle(time),
		};
	}

	// 根据系列配置准备区域和折线渲染器的数据。
	protected _prepareRendererData(): void {
		const options = this._series.options();
		if (this._itemsVisibleRange === null || this._items.length === 0) {
			return;
		}
		let topCoordinate;

		if (options.relativeGradient) {
			topCoordinate = this._items[this._itemsVisibleRange.from].y;

			for (let i = this._itemsVisibleRange.from; i < this._itemsVisibleRange.to; i++) {
				const item = this._items[i];
				if (item.y < topCoordinate) {
					topCoordinate = item.y;
				}
			}
		}
		this._areaRenderer.setData({
			lineType: options.lineType,
			items: this._items,
			lineStyle: options.lineStyle,
			lineWidth: options.lineWidth,
			baseLevelCoordinate: null,
			topCoordinate,
			invertFilledArea: options.invertFilledArea,
			visibleRange: this._itemsVisibleRange,
			barWidth: this._model.timeScale().barSpacing(),
		});

		this._lineRenderer.setData({
			lineType: options.lineVisible ? options.lineType : undefined,
			items: this._items,
			lineStyle: options.lineStyle,
			lineWidth: options.lineWidth,
			visibleRange: this._itemsVisibleRange,
			barWidth: this._model.timeScale().barSpacing(),
			pointMarkersRadius: options.pointMarkersVisible ? (options.pointMarkersRadius || options.lineWidth / 2 + 2) : undefined,
		});
	}
}
