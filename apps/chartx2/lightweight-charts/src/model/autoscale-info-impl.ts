import { PriceRangeImpl } from './price-range-impl';
import { AutoscaleInfo } from './series-options';

/**
 * 自动缩放时使用的上下边距定义，单位为像素。
 */
export interface AutoScaleMargins {
	/** 下边距像素数。 */
	below: number;
	/** 上边距像素数。 */
	above: number;
}

/**
 * 自动缩放结果对象。封装了价格区间与可选的边距设置，便于与模型层保持类型一致。
 */
export class AutoscaleInfoImpl {
	private readonly _priceRange: PriceRangeImpl | null;
	private readonly _margins: AutoScaleMargins | null;

	/**
	 * @param priceRange 自动缩放计算得到的价格区间。
	 * @param margins 可选的上下边距，用于缩放后预留空间绘制蜡烛影线等。
	 */
	public constructor(priceRange: PriceRangeImpl | null, margins?: AutoScaleMargins | null) {
		this._priceRange = priceRange;
		this._margins = margins || null;
	}

	/**
	 * 返回内部的价格区间对象。
	 */
	public priceRange(): PriceRangeImpl | null {
		return this._priceRange;
	}

	/**
	 * 返回自动缩放附带的上下边距。
	 */
	public margins(): AutoScaleMargins | null {
		return this._margins;
	}

	/**
	 * 序列化为暴露给外部 API 的 `AutoscaleInfo` 结构。
	 */
	public toRaw(): AutoscaleInfo {
		return {
			priceRange: this._priceRange === null ? null : this._priceRange.toRaw(),
			margins: this._margins || undefined,
		};
	}

	/**
	 * 从 API 层的原始结构还原回内部实现对象。
	 */
	public static fromRaw(raw: AutoscaleInfo | null): AutoscaleInfoImpl | null {
		return (raw === null) ? null : new AutoscaleInfoImpl(PriceRangeImpl.fromRaw(raw.priceRange), raw.margins);
	}
}
