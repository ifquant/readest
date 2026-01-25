// 比较函数：传入数组元素与目标值，返回布尔值表示元素是否“在目标值之前”
export type BoundComparatorType<TArrayElementType, TValueType> = (a: TArrayElementType, b: TValueType) => boolean;

/**
 * Binary function that accepts two arguments (the first of the type of array elements, and the second is always val), and returns a value convertible to bool.
 * The value returned indicates whether the first argument is considered to go before the second.
 * The function shall not modify any of its arguments.
 */

function boundCompare<TArrayElementType, TValueType>(
	lower: boolean,
	arr: readonly TArrayElementType[],
	value: TValueType,
	compare: BoundComparatorType<TArrayElementType, TValueType>,
	start: number = 0,
	to: number = arr.length): number {
	let count: number = to - start;
	// 经典二分查找骨架，通过 count 追踪当前搜索区间长度
	while (0 < count) {
		const count2: number = (count >> 1);
		const mid: number = start + count2;
		// compare 返回 true 代表“arr[mid] 在 value 前面”
		if (compare(arr[mid], value) === lower) {
			// lower=true: 找到仍然满足条件的元素，需要向右继续寻找上界
			start = mid + 1;
			count -= count2 + 1;
		} else {
			// upper bound 或查找失败时，缩小到左半区间
			count = count2;
		}
	}

	// 返回最终区间起点，即 lower/upper bound 索引
	return start;
}

type BoundCompareFunctionDefinition = <TArrayElementType, TValueType>(
	arr: readonly TArrayElementType[],
	value: TValueType,
	compare: BoundComparatorType<TArrayElementType, TValueType>,
	start?: number,
	to?: number
) => number;

// lowerBound：寻找第一个 compare(element, value) === false 的位置（即 value 的插入点）
export const lowerBound = boundCompare.bind(null, true) as BoundCompareFunctionDefinition;
// upperBound：寻找最后一个 compare(element, value) === true 之后的位置
export const upperBound = boundCompare.bind(null, false) as BoundCompareFunctionDefinition;
