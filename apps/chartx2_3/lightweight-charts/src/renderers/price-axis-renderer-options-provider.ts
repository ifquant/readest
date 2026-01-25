// 根据字号和字体生成 CSS 字体字符串
import { makeFont } from '../helpers/make-font';

// 图表模型接口，提供布局和背景信息
import { IChartModelBase } from '../model/chart-model';

// 价格轴渲染器的选项结构
import { PriceAxisViewRendererOptions } from './iprice-axis-view-renderer';

const enum RendererConstants {
	// 价格轴边框宽度
	BorderSize = 1,
	// 刻度线长度
	TickLength = 5,
}

export class PriceAxisRendererOptionsProvider {
	// 引用图表模型以获取配置
	private readonly _chartModel: IChartModelBase;

	// 缓存构造出的渲染器配置
	private readonly _rendererOptions: PriceAxisViewRendererOptions = {
		borderSize: RendererConstants.BorderSize,
		tickLength: RendererConstants.TickLength,
		fontSize: NaN,
		font: '',
		fontFamily: '',
		color: '',
		paneBackgroundColor: '',
		paddingBottom: 0,
		paddingInner: 0,
		paddingOuter: 0,
		paddingTop: 0,
		baselineOffset: 0,
	};

	// 构造函数注入图表模型
	public constructor(chartModel: IChartModelBase) {
		this._chartModel = chartModel;
	}

	// 获取渲染选项，必要时重新计算字体相关的 padding
	public options(): Readonly<PriceAxisViewRendererOptions> {
		const rendererOptions = this._rendererOptions;

		const currentFontSize = this._fontSize();
		const currentFontFamily = this._fontFamily();

		if (rendererOptions.fontSize !== currentFontSize || rendererOptions.fontFamily !== currentFontFamily) {
			rendererOptions.fontSize = currentFontSize;
			rendererOptions.fontFamily = currentFontFamily;
			rendererOptions.font = makeFont(currentFontSize, currentFontFamily);
			rendererOptions.paddingTop = 2.5 / 12 * currentFontSize; // 2.5 px for 12px font
			rendererOptions.paddingBottom = rendererOptions.paddingTop;
			rendererOptions.paddingInner = currentFontSize / 12 * rendererOptions.tickLength;
			rendererOptions.paddingOuter = currentFontSize / 12 * rendererOptions.tickLength;
			rendererOptions.baselineOffset = 0;
		}

		rendererOptions.color = this._textColor();
		rendererOptions.paneBackgroundColor = this._paneBackgroundColor();

		return this._rendererOptions;
	}

	// 文本颜色来自图表布局配置
	private _textColor(): string {
		return this._chartModel.options()['layout'].textColor;
	}

	// 背景颜色来自模型的背景配置
	private _paneBackgroundColor(): string {
		return this._chartModel.backgroundTopColor();
	}

	// 当前字体大小
	private _fontSize(): number {
		return this._chartModel.options()['layout'].fontSize;
	}

	// 当前字体族
	private _fontFamily(): string {
		return this._chartModel.options()['layout'].fontFamily;
	}
}
