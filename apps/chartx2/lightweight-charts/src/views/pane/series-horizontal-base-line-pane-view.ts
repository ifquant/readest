// 系列接口以及价格刻度模式
import { ISeries } from '../../model/iseries';
import { PriceScaleMode } from '../../model/price-scale';
import { SeriesType } from '../../model/series-options';

import { SeriesHorizontalLinePaneView } from './series-horizontal-line-pane-view';

// 视图：在百分比或指数化模式下绘制系列基准线
export class SeriesHorizontalBaseLinePaneView extends SeriesHorizontalLinePaneView {
	// eslint-disable-next-line no-useless-constructor
	public constructor(series: ISeries<SeriesType>) {
		super(series);
	}

	protected _updateImpl(): void {
		this._lineRendererData.visible = false;

		// 仅在特定价格刻度模式下启用基准线
		const priceScale = this._series.priceScale();
		const mode = priceScale.mode().mode;
		if (mode !== PriceScaleMode.Percentage && mode !== PriceScaleMode.IndexedTo100) {
			return;
		}

		const seriesOptions = this._series.options();

		// 基准线可见配置关闭或系列隐藏时跳过
		if (!seriesOptions.baseLineVisible || !this._series.visible()) {
			return;
		}

		const firstValue = this._series.firstValue();
		if (firstValue === null) {
			return;
		}

		this._lineRendererData.visible = true;
		this._lineRendererData.y = priceScale.priceToCoordinate(firstValue.value, firstValue.value);
		this._lineRendererData.color = seriesOptions.baseLineColor;
		this._lineRendererData.lineWidth = seriesOptions.baseLineWidth;
		this._lineRendererData.lineStyle = seriesOptions.baseLineStyle;
	}
}
