import { assert } from '../helpers/assertions';

// RangeImpl 表示含端点的闭区间，用于时间索引、逻辑坐标等
export class RangeImpl<T extends number> {
	private readonly _left: T;
	private readonly _right: T;

	public constructor(left: T, right: T) {
		assert(left <= right, 'right should be >= left');

		this._left = left;
		this._right = right;
	}

	public left(): T {
		return this._left;
	}

	public right(): T {
		return this._right;
	}

	public count(): number {
		// 包含端点，因此需要 +1
		return this._right - this._left + 1;
	}

	public contains(index: T): boolean {
		return this._left <= index && index <= this._right;
	}

	public equals(other: RangeImpl<T>): boolean {
		return this._left === other.left() && this._right === other.right();
	}
}

export function areRangesEqual<T extends number>(first: RangeImpl<T> | null, second: RangeImpl<T> | null): boolean {
	// 支持 null 的比较，常用于缓存命中判断
	if (first === null || second === null) {
		return first === second;
	}

	return first.equals(second);
}
