// 面板模型，提供价格刻度和时间刻度
import { Pane } from '../../model/pane';
// 时间刻度上的刻度点类型
import { TimeMark } from '../../model/time-scale';
// 网格渲染器及其数据结构
import { GridRenderer, GridRendererData } from '../../renderers/grid-renderer';
// 面板渲染器接口
import { IPaneRenderer } from '../../renderers/ipane-renderer';

import { IUpdatablePaneView } from './iupdatable-pane-view';

// 面板视图：负责同步网格线的样式与可见范围
export class GridPaneView implements IUpdatablePaneView {
	private readonly _pane: Pane;
	private readonly _renderer: GridRenderer = new GridRenderer();
	private _invalidated: boolean = true;

	public constructor(pane: Pane) {
		this._pane = pane;
	}

	public update(): void {
		// 标记需要重新收集网格线数据
		this._invalidated = true;
	}

	public renderer(): IPaneRenderer | null {
		if (this._invalidated) {
			const gridOptions = this._pane.model().options().grid;

			const data: GridRendererData = {
				horzLinesVisible: gridOptions.horzLines.visible,
				vertLinesVisible: gridOptions.vertLines.visible,
				horzLinesColor: gridOptions.horzLines.color,
				vertLinesColor: gridOptions.vertLines.color,
				horzLineStyle: gridOptions.horzLines.style,
				vertLineStyle: gridOptions.vertLines.style,
				priceMarks: this._pane.defaultPriceScale().marks(),
				// need this conversiom because TimeMark is a part of external interface
				// and fields inside TimeMark are not minified
				timeMarks: (this._pane.model().timeScale().marks() || []).map((tm: TimeMark) => {
					// 仅保留坐标，避免暴露外部接口上的额外字段
					return { coord: tm.coord };
				}),
			};

			this._renderer.setData(data);
			// 更新完成，重置脏标记
			this._invalidated = false;
		}

		return this._renderer;
	}
}
