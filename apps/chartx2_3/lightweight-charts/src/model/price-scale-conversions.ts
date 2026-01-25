import { PriceRangeImpl } from './price-range-impl';

export interface LogFormula {
	logicalOffset: number;
	coordOffset: number;
}

// 默认的对数公式参数，避免在零附近出现数值不稳定
const defLogFormula: LogFormula = {
	logicalOffset: 4,
	coordOffset: 0.0001,
};

export function fromPercent(value: number, baseValue: number): number {
	// 将百分比值还原为真实价格，baseValue 符号决定方向
	if (baseValue < 0) {
		value = -value;
	}

	return (value / 100) * baseValue + baseValue;
}

export function toPercent(value: number, baseValue: number): number {
	// 计算价格相对基准值的百分比变化
	const result = 100 * (value - baseValue) / baseValue;
	return (baseValue < 0 ? -result : result);
}

export function toPercentRange(priceRange: PriceRangeImpl, baseValue: number): PriceRangeImpl {
	// 区间级别的百分比转换，常用于百分比模式的 autoscale
	const minPercent = toPercent(priceRange.minValue(), baseValue);
	const maxPercent = toPercent(priceRange.maxValue(), baseValue);
	return new PriceRangeImpl(minPercent, maxPercent);
}

export function fromIndexedTo100(value: number, baseValue: number): number {
	value -= 100;
	if (baseValue < 0) {
		value = -value;
	}

	return (value / 100) * baseValue + baseValue;
}

export function toIndexedTo100(value: number, baseValue: number): number {
	// 将价格映射到“以 100 为基准”的指数模式
	const result = 100 * (value - baseValue) / baseValue + 100;
	return (baseValue < 0 ? -result : result);
}

export function toIndexedTo100Range(priceRange: PriceRangeImpl, baseValue: number): PriceRangeImpl {
	const minPercent = toIndexedTo100(priceRange.minValue(), baseValue);
	const maxPercent = toIndexedTo100(priceRange.maxValue(), baseValue);
	return new PriceRangeImpl(minPercent, maxPercent);
}

export function toLog(price: number, logFormula: LogFormula): number {
	// 先加上 coordOffset 防止对数奇异，再加 logicalOffset 确保结果为正
	const m = Math.abs(price);
	if (m < 1e-15) {
		return 0;
	}

	const res = Math.log10(m + logFormula.coordOffset) + logFormula.logicalOffset;
	return ((price < 0) ? -res : res);
}

export function fromLog(logical: number, logFormula: LogFormula): number {
	// 对 toLog 的逆操作，同样保持符号
	const m = Math.abs(logical);
	if (m < 1e-15) {
		return 0;
	}

	const res = Math.pow(10, m - logFormula.logicalOffset) - logFormula.coordOffset;
	return (logical < 0) ? -res : res;
}

export function convertPriceRangeToLog(priceRange: PriceRangeImpl | null, logFormula: LogFormula): PriceRangeImpl | null {
	// 价格区间 -> 对数区间，主要用于对数轴 autoscale
	if (priceRange === null) {
		return null;
	}

	const min = toLog(priceRange.minValue(), logFormula);
	const max = toLog(priceRange.maxValue(), logFormula);

	return new PriceRangeImpl(min, max);
}

export function canConvertPriceRangeFromLog(priceRange: PriceRangeImpl | null, logFormula: LogFormula): boolean {
	// 只有当逆变换仍为有限值时才能安全地回到线性坐标
	if (priceRange === null) {
		return false;
	}

	const min = fromLog(priceRange.minValue(), logFormula);
	const max = fromLog(priceRange.maxValue(), logFormula);

	return isFinite(min) && isFinite(max);
}

export function convertPriceRangeFromLog(priceRange: PriceRangeImpl, logFormula: LogFormula): PriceRangeImpl;
export function convertPriceRangeFromLog(priceRange: null, logFormula: LogFormula): null;
export function convertPriceRangeFromLog(priceRange: PriceRangeImpl | null, logFormula: LogFormula): PriceRangeImpl | null;
export function convertPriceRangeFromLog(priceRange: PriceRangeImpl | null, logFormula: LogFormula): PriceRangeImpl | null {
	if (priceRange === null) {
		return null;
	}

	const min = fromLog(priceRange.minValue(), logFormula);
	const max = fromLog(priceRange.maxValue(), logFormula);

	return new PriceRangeImpl(min, max);
}

export function logFormulaForPriceRange(range: PriceRangeImpl | null): LogFormula {
	// 根据当前区间动态调整 offset，保证极小区间下的数值稳定
	if (range === null) {
		return defLogFormula;
	}

	const diff = Math.abs(range.maxValue() - range.minValue());
	if (diff >= 1 || diff < 1e-15) {
		return defLogFormula;
	}

	const digits = Math.ceil(Math.abs(Math.log10(diff)));
	const logicalOffset = defLogFormula.logicalOffset + digits;
	const coordOffset = 1 / Math.pow(10, logicalOffset);

	return {
		logicalOffset,
		coordOffset,
	};
}

export function logFormulasAreSame(f1: LogFormula, f2: LogFormula): boolean {
	// 简单比较，避免对象引用不同导致重复计算
	return f1.logicalOffset === f2.logicalOffset && f1.coordOffset === f2.coordOffset;
}
