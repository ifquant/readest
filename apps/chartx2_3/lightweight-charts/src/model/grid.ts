import { LineStyle } from '../renderers/draw-line';
import { GridPaneView } from '../views/pane/grid-pane-view';
import { IUpdatablePaneView } from '../views/pane/iupdatable-pane-view';

import { Pane } from './pane';

/** 网格线配置项。 */
export interface GridLineOptions {
	/**
	 * 网格线颜色。
	 *
	 * @defaultValue `'#D6DCDE'`
	 */
	color: string;

	/**
	 * 网格线样式。
	 *
	 * @defaultValue {@link LineStyle.Solid}
	 */
	style: LineStyle;

	/**
	 * 是否显示网格线。
	 *
	 * @defaultValue `true`
	 */
	visible: boolean;
}

/** 网格配置结构体。 */
export interface GridOptions {
	/**
	 * 垂直网格线配置。
	 */
	vertLines: GridLineOptions;

	/**
	 * 水平网格线配置。
	 */
	horzLines: GridLineOptions;
}

export class Grid {
	private _paneView: GridPaneView;

	/**
	 * 初始化 pane 的网格视图包装。
	 */
	public constructor(pane: Pane) {
		this._paneView = new GridPaneView(pane);
	}

	/**
	 * 返回可更新的绘制视图，供渲染管线使用。
	 */
	public paneView(): IUpdatablePaneView {
		return this._paneView;
	}
}
