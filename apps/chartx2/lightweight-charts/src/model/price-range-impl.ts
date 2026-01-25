import { isNumber } from '../helpers/strict-type-checks';

import { PriceRange } from './series-options';

// 针对存在 Infinity/NaN 的场景，优先返回有限值，避免破坏范围
function computeFiniteResult(
	method: (...values: number[]) => number,
	valueOne: number,
	valueTwo: number,
	fallback: number
): number {
	const firstFinite = Number.isFinite(valueOne);
	const secondFinite = Number.isFinite(valueTwo);

	if (firstFinite && secondFinite) {
		return method(valueOne, valueTwo);
	}

	return !firstFinite && !secondFinite ? fallback : (firstFinite ? valueOne : valueTwo);
}

// PriceRangeImpl 是价格区间的可变表示，封装最值、缩放、平移等操作
export class PriceRangeImpl {
	private _minValue: number;
	private _maxValue!: number;

	public constructor(minValue: number, maxValue: number) {
		this._minValue = minValue;
		this._maxValue = maxValue;
	}

	public equals(pr: PriceRangeImpl | null): boolean {
		if (pr === null) {
			return false;
		}
		return this._minValue === pr._minValue && this._maxValue === pr._maxValue;
	}

	public clone(): PriceRangeImpl {
		return new PriceRangeImpl(this._minValue, this._maxValue);
	}

	public minValue(): number {
		return this._minValue;
	}

	public maxValue(): number {
		return this._maxValue;
	}

	public length(): number {
		return this._maxValue - this._minValue;
	}

	public isEmpty(): boolean {
		return this._maxValue === this._minValue || Number.isNaN(this._maxValue) || Number.isNaN(this._minValue);
	}

	public merge(anotherRange: PriceRangeImpl | null): PriceRangeImpl {
		// 合并两个区间，保持上、下界的有限值
		if (anotherRange === null) {
			return this;
		}
		return new PriceRangeImpl(
			computeFiniteResult(Math.min, this.minValue(), anotherRange.minValue(), -Infinity),
			computeFiniteResult(Math.max, this.maxValue(), anotherRange.maxValue(), Infinity)
		);
	}

	public scaleAroundCenter(coeff: number): void {
		// 围绕中心缩放区间，用于纵轴缩放
		if (!isNumber(coeff)) {
			return;
		}

		const delta = this._maxValue - this._minValue;
		if (delta === 0) {
			return;
		}

		const center = (this._maxValue + this._minValue) * 0.5;
		let maxDelta = this._maxValue - center;
		let minDelta = this._minValue - center;
		maxDelta *= coeff;
		minDelta *= coeff;
		this._maxValue = center + maxDelta;
		this._minValue = center + minDelta;
	}

	public shift(delta: number): void {
		// 平移区间，在拖拽价格轴时调用
		if (!isNumber(delta)) {
			return;
		}

		this._maxValue += delta;
		this._minValue += delta;
	}

	public toRaw(): PriceRange {
		// 导出为不可变结构，便于透传给外部 API
		return {
			minValue: this._minValue,
			maxValue: this._maxValue,
		};
	}

	public static fromRaw(raw: PriceRange | null): PriceRangeImpl | null {
		// 从 API 传入的 raw 对象恢复内部结构
		return (raw === null) ? null : new PriceRangeImpl(raw.minValue, raw.maxValue);
	}
}
