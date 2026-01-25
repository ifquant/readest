// 十字光标模型及其模式枚举
import { Crosshair, CrosshairMode } from '../../model/crosshair';
// 当前所在的面板实例
import { Pane } from '../../model/pane';
// 十字光标渲染器及数据结构
import { CrosshairRenderer, CrosshairRendererData } from '../../renderers/crosshair-renderer';
// 面板渲染器接口
import { IPaneRenderer } from '../../renderers/ipane-renderer';

import { IPaneView } from './ipane-view';

// 面板视图：负责将十字光标的可视状态同步给渲染器
export class CrosshairPaneView implements IPaneView {
	private _invalidated: boolean = true;
	private readonly _pane: Pane;
	private readonly _source: Crosshair;
	private readonly _rendererData: CrosshairRendererData = {
		vertLine: {
			lineWidth: 1,
			lineStyle: 0,
			color: '',
			visible: false,
		},
		horzLine: {
			lineWidth: 1,
			lineStyle: 0,
			color: '',
			visible: false,
		},
		x: 0,
		y: 0,
	};
	private _renderer: CrosshairRenderer = new CrosshairRenderer(this._rendererData);

	public constructor(source: Crosshair, pane: Pane) {
		this._source = source;
		this._pane = pane;
	}

	public update(): void {
		// 标记数据脏，需要重新同步位置与样式
		this._invalidated = true;
	}

	public renderer(pane: Pane): IPaneRenderer {
		if (this._invalidated) {
			// 延迟更新渲染数据
			this._updateImpl();
			this._invalidated = false;
		}

		return this._renderer;
	}

	private _updateImpl(): void {
		const visible = this._source.visible();
		const crosshairOptions = this._pane.model().options().crosshair;

		const data = this._rendererData;

		if (crosshairOptions.mode === CrosshairMode.Hidden) {
			// 隐藏模式直接关闭两条线的渲染
			data.horzLine.visible = false;
			data.vertLine.visible = false;
			return;
		}

		data.horzLine.visible = visible && this._source.horzLineVisible(this._pane);
		data.vertLine.visible = visible && this._source.vertLineVisible();

		// 根据配置同步线条样式
		data.horzLine.lineWidth = crosshairOptions.horzLine.width;
		data.horzLine.lineStyle = crosshairOptions.horzLine.style;
		data.horzLine.color = crosshairOptions.horzLine.color;

		data.vertLine.lineWidth = crosshairOptions.vertLine.width;
		data.vertLine.lineStyle = crosshairOptions.vertLine.style;
		data.vertLine.color = crosshairOptions.vertLine.color;

		// 缓存十字光标的像素位置
		data.x = this._source.appliedX();
		data.y = this._source.appliedY();
	}
}
