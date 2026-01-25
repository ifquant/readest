// 图表模型、坐标与系列接口
import { IChartModelBase } from '../../model/chart-model';
import { Coordinate } from '../../model/coordinate';
import { ISeries } from '../../model/iseries';
import { SeriesType } from '../../model/series-options';
// 水平线渲染依赖
import { LineStyle } from '../../renderers/draw-line';
import { HorizontalLineRenderer, HorizontalLineRendererData } from '../../renderers/horizontal-line-renderer';
import { IPaneRenderer } from '../../renderers/ipane-renderer';

import { IPaneView } from './ipane-view';

// 抽象基类：用于将系列派生出的水平线 (自定义线、最后价等) 推送给渲染器
export abstract class SeriesHorizontalLinePaneView implements IPaneView {
	protected readonly _lineRendererData: HorizontalLineRendererData = {
		y: 0 as Coordinate,
		color: 'rgba(0, 0, 0, 0)',
		lineWidth: 1,
		lineStyle: LineStyle.Solid,
		visible: false,
	};

	protected readonly _series: ISeries<SeriesType>;
	protected readonly _model: IChartModelBase;
	protected readonly _lineRenderer: HorizontalLineRenderer = new HorizontalLineRenderer();
	private _invalidated: boolean = true;

	protected constructor(series: ISeries<SeriesType>) {
		this._series = series;
		this._model = series.model();
		// 将共享的数据对象绑定给渲染器，子类仅需修改字段
		this._lineRenderer.setData(this._lineRendererData);
	}

	public update(): void {
		// 标记脏数据，延迟到 renderer 调用时再刷新
		this._invalidated = true;
	}

	public renderer(): IPaneRenderer | null {
		if (!this._series.visible()) {
			return null;
		}

		if (this._invalidated) {
			// 子类负责填充具体的线条位置和样式
			this._updateImpl();
			this._invalidated = false;
		}
		return this._lineRenderer;
	}

	protected abstract _updateImpl(): void;
}
