import { RangeImpl } from './range-impl';
import { Logical, TimePointIndex } from './time-data';

// TimeScaleVisibleRange 将逻辑坐标（浮点）范围与整数索引范围绑定，便于 GUI/模型互换
export class TimeScaleVisibleRange {
	private readonly _logicalRange: RangeImpl<Logical> | null;

	public constructor(logicalRange: RangeImpl<Logical> | null) {
		this._logicalRange = logicalRange;
	}

	public strictRange(): RangeImpl<TimePointIndex> | null {
		// 严格范围指包含所有可见柱的整数索引，向外扩展到最近整数
		if (this._logicalRange === null) {
			return null;
		}

		return new RangeImpl(
			Math.floor(this._logicalRange.left()) as TimePointIndex,
			Math.ceil(this._logicalRange.right()) as TimePointIndex
		);
	}

	public logicalRange(): RangeImpl<Logical> | null {
		return this._logicalRange;
	}

	public static invalid(): TimeScaleVisibleRange {
		// 工具方法：表示尚未计算出可见范围
		return new TimeScaleVisibleRange(null);
	}
}
