// 系列接口与价格线数据来源配置
import { ISeries } from '../../model/iseries';
import { PriceLineSource, SeriesType } from '../../model/series-options';

import { SeriesHorizontalLinePaneView } from './series-horizontal-line-pane-view';

// 视图：根据系列最新价格绘制价格线
export class SeriesPriceLinePaneView extends SeriesHorizontalLinePaneView {
	// eslint-disable-next-line no-useless-constructor
	public constructor(series: ISeries<SeriesType>) {
		super(series);
	}

	protected _updateImpl(): void {
		const data = this._lineRendererData;
		data.visible = false;

		const seriesOptions = this._series.options();
		// 当配置或系列不可见时不绘制
		if (!seriesOptions.priceLineVisible || !this._series.visible()) {
			return;
		}

		// priceLineSource 决定取收盘价还是最后柱子的价格
		const lastValueData = this._series.lastValueData(seriesOptions.priceLineSource === PriceLineSource.LastBar);
		if (lastValueData.noData) {
			return;
		}

		data.visible = true;
		data.y = lastValueData.coordinate;
		data.color = this._series.priceLineColor(lastValueData.color);
		data.lineWidth = seriesOptions.priceLineWidth;
		data.lineStyle = seriesOptions.priceLineStyle;
	}
}
