// 定义标记点上显示的价格类型
import { BarPrice } from '../../model/bar';
// 访问图表模型与时间轴等上下文
import { IChartModelBase } from '../../model/chart-model';
// 垂直坐标类型
import { Coordinate } from '../../model/coordinate';
// 十字光标状态与模式
import { Crosshair, CrosshairMode } from '../../model/crosshair';
// 系列接口定义
import { ISeries } from '../../model/iseries';
// 面板实例，负责管理系列与渲染
import { Pane } from '../../model/pane';
// 系列类型，用于筛选和渲染
import { SeriesType } from '../../model/series-options';
// 可见范围与时间索引类型
import { SeriesItemsIndexesRange, TimePointIndex } from '../../model/time-data';
// 组合渲染器，可聚合多个子渲染器
import { CompositeRenderer } from '../../renderers/composite-renderer';
// 面板渲染器接口
import { IPaneRenderer } from '../../renderers/ipane-renderer';
// 十字光标标记渲染器及其数据结构
import { MarksRendererData, PaneRendererMarks } from '../../renderers/marks-renderer';

import { IUpdatablePaneView, UpdateType } from './iupdatable-pane-view';

// 创建默认的标记渲染数据结构，避免空指针判断
function createEmptyMarkerData(): MarksRendererData {
	return {
		items: [{
			x: 0 as Coordinate,
			y: 0 as Coordinate,
			time: 0 as TimePointIndex,
			price: 0 as BarPrice,
		}],
		lineColor: '',
		backColor: '',
		radius: 0,
		lineWidth: 0,
		visibleRange: null,
	};
}

const rangeForSinglePoint: SeriesItemsIndexesRange = { from: 0, to: 1 };

// 面板视图：负责绘制十字光标在每个序列上的圆点标记
export class CrosshairMarksPaneView implements IUpdatablePaneView {
	private readonly _chartModel: IChartModelBase;
	private readonly _crosshair: Crosshair;
	private readonly _pane: Pane;
	private readonly _compositeRenderer: CompositeRenderer = new CompositeRenderer();
	private _markersRenderers: PaneRendererMarks[] = [];
	private _markersData: MarksRendererData[] = [];
	private _invalidated: boolean = true;

	public constructor(chartModel: IChartModelBase, crosshair: Crosshair, pane: Pane) {
		this._chartModel = chartModel;
		this._crosshair = crosshair;
		this._pane = pane;
		// 初始化组合渲染器，将子渲染器数组托管进去
		this._compositeRenderer.setRenderers(this._markersRenderers);
	}

	public update(updateType?: UpdateType): void {
		// 更新时确保渲染器数量与系列一致
		this._createMarkerRenderersIfNeeded();

		// 标记需要重新计算渲染数据
		this._invalidated = true;
	}

	public renderer(): IPaneRenderer | null {
		if (this._invalidated) {
			// 延迟计算渲染数据，避免重复工作
			this._updateImpl();
			this._invalidated = false;
		}

		return this._compositeRenderer;
	}

	private _createMarkerRenderersIfNeeded(): void {
		const serieses = this._pane.orderedSources();
		if (serieses.length !== this._markersRenderers.length) {
			// 为每条系列生成独立的标记数据与渲染器
			this._markersData = serieses.map(createEmptyMarkerData);
			this._markersRenderers = this._markersData.map((data: MarksRendererData) => {
				const res = new PaneRendererMarks();
				res.setData(data);
				return res;
			});
			// 更新组合渲染器中的子渲染器引用
			this._compositeRenderer.setRenderers(this._markersRenderers);
		}
	}

	private _updateImpl(): void {
		// 隐藏模式或光标不可见时强制隐藏所有标记
		const forceHidden = this._crosshair.options().mode === CrosshairMode.Hidden || !this._crosshair.visible();
		const serieses = this._pane.orderedSeries();
		const timePointIndex = this._crosshair.appliedIndex();
		const timeScale = this._chartModel.timeScale();
		this._createMarkerRenderersIfNeeded();

		serieses.forEach((s: ISeries<SeriesType>, index: number) => {
			const data = this._markersData[index];
			const seriesData = s.markerDataAtIndex(timePointIndex);
			const firstValue = s.firstValue();
			if (forceHidden || seriesData === null || !s.visible() || firstValue === null) {
				// 清空可见范围即可让渲染器跳过
				data.visibleRange = null;
				return;
			}
			// 同步标记的样式和位置
			data.lineColor = seriesData.backgroundColor;
			data.radius = seriesData.radius;
			data.lineWidth = seriesData.borderWidth;
			data.items[0].price = seriesData.price;
			data.items[0].y = s.priceScale().priceToCoordinate(seriesData.price, firstValue.value);
			data.backColor = seriesData.borderColor ?? this._chartModel.backgroundColorAtYPercentFromTop(data.items[0].y / s.priceScale().height());
			data.items[0].time = timePointIndex;
			data.items[0].x = timeScale.indexToCoordinate(timePointIndex);
			data.visibleRange = rangeForSinglePoint;
		});
	}
}
