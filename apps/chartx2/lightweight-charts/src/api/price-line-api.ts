// 包装底层 CustomPriceLine，提供公共 API
import { CustomPriceLine } from '../model/custom-price-line';
import { PriceLineOptions } from '../model/price-line-options';

import { IPriceLine } from './iprice-line';

export class PriceLine implements IPriceLine {
	private readonly _priceLine: CustomPriceLine;

	public constructor(priceLine: CustomPriceLine) {
		this._priceLine = priceLine;
	}

	public applyOptions(options: Partial<PriceLineOptions>): void {
		// 透传外部配置到内部模型
		this._priceLine.applyOptions(options);
	}
	public options(): Readonly<PriceLineOptions> {
		// 返回当前生效的配置，包含默认值
		return this._priceLine.options();
	}

	public priceLine(): CustomPriceLine {
		// 暴露底层对象以便内部复用
		return this._priceLine;
	}
}
