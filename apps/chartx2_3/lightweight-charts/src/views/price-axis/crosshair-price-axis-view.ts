// 十字光标的价格信息与模式枚举
import { Crosshair, CrosshairMode, CrosshairPriceAndCoordinate } from '../../model/crosshair';
// 价格刻度实例
import { PriceScale } from '../../model/price-scale';
// 价格轴渲染器数据结构
import { PriceAxisViewRendererCommonData, PriceAxisViewRendererData } from '../../renderers/iprice-axis-view-renderer';

import { PriceAxisView } from './price-axis-view';

// 回调函数：根据刻度返回十字光标的价格与坐标
export type CrosshairPriceAxisViewValueProvider = (priceScale: PriceScale) => CrosshairPriceAndCoordinate;

// 视图：在价格轴上展示十字光标对应的价格标签
export class CrosshairPriceAxisView extends PriceAxisView {
	private _source: Crosshair;
	private readonly _priceScale: PriceScale;
	private readonly _valueProvider: CrosshairPriceAxisViewValueProvider;

	public constructor(source: Crosshair, priceScale: PriceScale, valueProvider: CrosshairPriceAxisViewValueProvider) {
		super();
		this._source = source;
		this._priceScale = priceScale;
		this._valueProvider = valueProvider;
	}

	protected _updateRendererData(
		axisRendererData: PriceAxisViewRendererData,
		paneRendererData: PriceAxisViewRendererData,
		commonRendererData: PriceAxisViewRendererCommonData
	): void {
		axisRendererData.visible = false;
		if (this._source.options().mode === CrosshairMode.Hidden) {
			// 隐藏模式直接跳过
			return;
		}

		const options = this._source.options().horzLine;
		if (!options.labelVisible) {
			return;
		}

		const firstValue = this._priceScale.firstValue();
		if (!this._source.visible() || this._priceScale.isEmpty() || (firstValue === null)) {
			// 没有有效价格时不显示标签
			return;
		}

		const colors = this._priceScale.colorParser().generateContrastColors(options.labelBackgroundColor);
		commonRendererData.background = colors.background;
		axisRendererData.color = colors.foreground;

		const additionalPadding = 2 / 12 * this._priceScale.fontSize();

		commonRendererData.additionalPaddingTop = additionalPadding;
		commonRendererData.additionalPaddingBottom = additionalPadding;

		const value = this._valueProvider(this._priceScale);
		commonRendererData.coordinate = value.coordinate;
		axisRendererData.text = this._priceScale.formatPrice(value.price, firstValue);
		axisRendererData.visible = true;
	}
}
