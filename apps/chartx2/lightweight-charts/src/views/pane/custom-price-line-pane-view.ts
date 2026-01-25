// 自定义价格线模型
import { CustomPriceLine } from '../../model/custom-price-line';
// 系列接口及类型
import { ISeries } from '../../model/iseries';
import { SeriesType } from '../../model/series-options';

import { SeriesHorizontalLinePaneView } from './series-horizontal-line-pane-view';

// 视图：将自定义价格线映射为水平线渲染数据
export class CustomPriceLinePaneView extends SeriesHorizontalLinePaneView {
	private readonly _priceLine: CustomPriceLine;

	public constructor(series: ISeries<SeriesType>, priceLine: CustomPriceLine) {
		super(series);
		this._priceLine = priceLine;
	}

	protected _updateImpl(): void {
		const data = this._lineRendererData;
		data.visible = false;

		const lineOptions = this._priceLine.options();

		// 系列隐藏或配置禁用时直接退出
		if (!this._series.visible() || !lineOptions.lineVisible) {
			return;
		}

		// 将价格转换为像素坐标
		const y = this._priceLine.yCoord();
		if (y === null) {
			return;
		}

		data.visible = true;
		data.y = y;
		data.color = lineOptions.color;
		data.lineWidth = lineOptions.lineWidth;
		data.lineStyle = lineOptions.lineStyle;
		// 透传外部 ID，便于命中测试回调识别
		data.externalId = this._priceLine.options().id;
	}
}
