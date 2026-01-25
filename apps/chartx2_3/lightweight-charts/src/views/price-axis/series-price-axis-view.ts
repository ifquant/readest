// 系列接口及最后值数据结构
import { ISeries, LastValueDataResultWithData } from '../../model/iseries';
// 价格轴标签显示模式配置
import { PriceAxisLastValueMode, SeriesType } from '../../model/series-options';
import { PriceAxisViewRendererCommonData, PriceAxisViewRendererData } from '../../renderers/iprice-axis-view-renderer';

import { PriceAxisView } from './price-axis-view';

// 视图：在价格轴/面板上展示系列的最后价格与附加信息
export class SeriesPriceAxisView extends PriceAxisView {
	private readonly _source: ISeries<SeriesType>;

	public constructor(source: ISeries<SeriesType>) {
		super();
		this._source = source;
	}

	protected _updateRendererData(
		axisRendererData: PriceAxisViewRendererData,
		paneRendererData: PriceAxisViewRendererData,
		commonRendererData: PriceAxisViewRendererCommonData
	): void {
		axisRendererData.visible = false;
		paneRendererData.visible = false;

		const source = this._source;
		if (!source.visible()) {
			return;
		}

		const seriesOptions = source.options();

		const showSeriesLastValue = seriesOptions.lastValueVisible;

		const showSymbolLabel = source.title() !== '';
		const showPriceAndPercentage = seriesOptions.seriesLastValueMode === PriceAxisLastValueMode.LastPriceAndPercentageValue;

		const lastValueData = source.lastValueData(false);
		if (lastValueData.noData) {
			return;
		}

		if (showSeriesLastValue) {
			axisRendererData.text = this._axisText(lastValueData, showSeriesLastValue, showPriceAndPercentage);
			axisRendererData.visible = axisRendererData.text.length !== 0;
		}

		if (showSymbolLabel || showPriceAndPercentage) {
			paneRendererData.text = this._paneText(lastValueData, showSeriesLastValue, showSymbolLabel, showPriceAndPercentage);
			paneRendererData.visible = paneRendererData.text.length > 0;
		}

		// 标签背景与边框颜色基于系列颜色生成对比度
		const lastValueColor = source.priceLineColor(lastValueData.color);
		const colors = this._source
			.model()
			.colorParser()
			.generateContrastColors(lastValueColor);

		commonRendererData.background = colors.background;
		commonRendererData.coordinate = lastValueData.coordinate;
		paneRendererData.borderColor = source.model().backgroundColorAtYPercentFromTop(lastValueData.coordinate / source.priceScale().height());
		axisRendererData.borderColor = lastValueColor;
		axisRendererData.color = colors.foreground;
		paneRendererData.color = colors.foreground;
	}

	protected _paneText(
		lastValue: LastValueDataResultWithData,
		showSeriesLastValue: boolean,
		showSymbolLabel: boolean,
		showPriceAndPercentage: boolean
	): string {
		let result = '';

		const title = this._source.title();

		if (showSymbolLabel && title.length !== 0) {
			result += `${title} `;
		}

		if (showSeriesLastValue && showPriceAndPercentage) {
			// 百分比刻度时要互换显示绝对值/百分比文案
			result += this._source.priceScale().isPercentage() ?
				lastValue.formattedPriceAbsolute : lastValue.formattedPricePercentage;
		}

		return result.trim();
	}

	protected _axisText(lastValueData: LastValueDataResultWithData, showSeriesLastValue: boolean, showPriceAndPercentage: boolean): string {
		if (!showSeriesLastValue) {
			return '';
		}

		if (!showPriceAndPercentage) {
			return lastValueData.text;
		}

		return this._source.priceScale().isPercentage() ?
			lastValueData.formattedPricePercentage : lastValueData.formattedPriceAbsolute;
	}
}
