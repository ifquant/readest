/** 将数值限制在指定区间内 */
export function clamp(value: number, minVal: number, maxVal: number): number {
	return Math.min(Math.max(value, minVal), maxVal);
}

/** 判断一个数是否为 “基础 10” 小数（1、10、100...），超过 1e18 视作 true */
export function isBaseDecimal(value: number): boolean {
	if (value < 0) {
		return false;
	}

	// cannot calculate exactly due to rounding error
	if (value > 1e18) {
		return true;
	}

	for (let current = value; current > 1; current /= 10) {
		if ((current % 10) !== 0) {
			return false;
		}
	}

	return true;
}

/** 判断 x1 是否 >= x2（允许 epsilon 误差） */
export function greaterOrEqual(x1: number, x2: number, epsilon: number): boolean {
	return (x2 - x1) <= epsilon;
}

/** 判断两个浮点数是否相等（允许 epsilon 误差） */
export function equal(x1: number, x2: number, epsilon: number): boolean {
	return Math.abs(x1 - x2) < epsilon;
}

// We can't use Math.min(...arr) because that would only support arrays shorter than 65536 items.
/** 线性扫描求数组最小值，避免扩展运算符的长度限制 */
export function min(arr: number[]): number {
	if (arr.length < 1) {
		throw Error('array is empty');
	}

	let minVal = arr[0];
	for (let i = 1; i < arr.length; ++i) {
		if (arr[i] < minVal) {
			minVal = arr[i];
		}
	}

	return minVal;
}

/** 向上取整到最近的偶数 */
export function ceiledEven(x: number): number {
	const ceiled = Math.ceil(x);
	return (ceiled % 2 !== 0) ? ceiled - 1 : ceiled;
}

/** 向上取整到最近的奇数 */
export function ceiledOdd(x: number): number {
	const ceiled = Math.ceil(x);
	return (ceiled % 2 === 0) ? ceiled - 1 : ceiled;
}
