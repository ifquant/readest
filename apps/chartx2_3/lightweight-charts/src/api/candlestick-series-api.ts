// 蜡烛图配置及颜色填充工具
import {
	CandlestickSeriesPartialOptions,
	fillUpDownCandlesticksColors,
} from '../model/series-options';

import { SeriesApi } from './series-api';

// 蜡烛图序列 API：在应用选项前补齐多空颜色
export class CandlestickSeriesApi<HorzScaleItem> extends SeriesApi<'Candlestick', HorzScaleItem> {
	public override applyOptions(options: CandlestickSeriesPartialOptions): void {
		// 缺省时自动生成涨跌颜色，避免渲染阶段判断
		fillUpDownCandlesticksColors(options);
		super.applyOptions(options);
	}
}
