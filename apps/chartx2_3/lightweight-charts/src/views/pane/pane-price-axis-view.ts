// fancy-canvas 提供的绘制上下文封装
import { CanvasRenderingTarget2D } from 'fancy-canvas';

// 图表模型、数据源与文本宽度缓存
import { IChartModelBase } from '../../model/chart-model';
import { IPriceDataSource } from '../../model/iprice-data-source';
import { TextWidthCache } from '../../model/text-width-cache';
// 面板渲染器与价格轴渲染器接口
import { IPaneRenderer } from '../../renderers/ipane-renderer';
import { IPriceAxisViewRenderer, PriceAxisViewRendererOptions } from '../../renderers/iprice-axis-view-renderer';

import { IPriceAxisView } from '../price-axis/iprice-axis-view';
import { IPaneView } from './ipane-view';

// 包装价格轴渲染器，使其作为面板渲染器统一调用
class PanePriceAxisViewRenderer implements IPaneRenderer {
	private _priceAxisViewRenderer: IPriceAxisViewRenderer | null = null;
	private _rendererOptions: PriceAxisViewRendererOptions | null = null;
	private _align: 'left' | 'right' = 'right';
	private readonly _textWidthCache: TextWidthCache;

	public constructor(textWidthCache: TextWidthCache) {
		this._textWidthCache = textWidthCache;
	}

	public setParams(
		priceAxisViewRenderer: IPriceAxisViewRenderer,
		rendererOptions: PriceAxisViewRendererOptions,
		align: 'left' | 'right'
	): void {
		// 缓存当前配置，供 draw 调用使用
		this._priceAxisViewRenderer = priceAxisViewRenderer;
		this._rendererOptions = rendererOptions;
		this._align = align;
	}

	public draw(target: CanvasRenderingTarget2D): void {
		if (this._rendererOptions === null || this._priceAxisViewRenderer === null) {
			return;
		}

		// 复用 PriceAxisViewRenderer 的绘制逻辑
		this._priceAxisViewRenderer.draw(target, this._rendererOptions, this._textWidthCache, this._align);
	}
}

// 面板视图：负责将价格轴视图挂载至对应 pane
export class PanePriceAxisView implements IPaneView {
	private _priceAxisView: IPriceAxisView;
	private readonly _textWidthCache: TextWidthCache;
	private readonly _dataSource: IPriceDataSource;
	private readonly _chartModel: IChartModelBase;
	private readonly _renderer: PanePriceAxisViewRenderer;
	private _fontSize: number;

	public constructor(priceAxisView: IPriceAxisView, dataSource: IPriceDataSource, chartModel: IChartModelBase) {
		this._priceAxisView = priceAxisView;
		this._textWidthCache = new TextWidthCache(50); // when should we clear cache?
		this._dataSource = dataSource;
		this._chartModel = chartModel;
		this._fontSize = -1;
		this._renderer = new PanePriceAxisViewRenderer(this._textWidthCache);
	}

	public renderer(): IPaneRenderer | null {
		const pane = this._chartModel.paneForSource(this._dataSource);
		if (pane === null) {
			return null;
		}

		// this price scale will be used to find label placement only (left, right, none)
		const priceScale = pane.isOverlay(this._dataSource) ? pane.defaultVisiblePriceScale() : this._dataSource.priceScale();
		if (priceScale === null) {
			return null;
		}

		const position = pane.priceScalePosition(priceScale);
		if (position === 'overlay') {
			// overlay 模式不绘制轴标签
			return null;
		}

		const options = this._chartModel.priceAxisRendererOptions();
		if (options.fontSize !== this._fontSize) {
			this._fontSize = options.fontSize;
			// 字号变更后需清空宽度缓存，确保测量准确
			this._textWidthCache.reset();
		}

		this._renderer.setParams(this._priceAxisView.paneRenderer(), options, position);
		return this._renderer;
	}
}
