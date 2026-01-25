import { lowerBound } from '../helpers/algorithms';
import { ensureDefined } from '../helpers/assertions';

import { InternalHorzScaleItem } from './ihorz-scale-behavior';
import { TickMarkWeightValue, TimePointIndex, TimeScalePoint } from './time-data';

/**
 * 横轴刻度实体，包含索引、时间与权重信息。
 */
export interface TickMark {
	/** Index */
	index: TimePointIndex;
	/** Time / Coordinate */
	time: InternalHorzScaleItem;
	/** Weight of the tick mark */
	weight: TickMarkWeightValue;
	/** Original value for the `time` property */
	originalTime: unknown;
}

interface MarksCache {
	maxIndexesPerMark: number;
	indicesWithDataId: number;
	checkIndicesForData: boolean;
	marks: readonly TickMark[];
}

export class TickMarks<HorzScaleItem> {
	private _marksByWeight: Map<TickMarkWeightValue, TickMark[]> = new Map();
	private _cache: MarksCache | null = null;
	private _uniformDistribution: boolean = false;

	/**
	 * 是否强制刻度均匀分布（不允许跳过）。
	 */
	public setUniformDistribution(val: boolean): void {
		this._uniformDistribution = val;
		this._cache = null;
	}

	/**
	 * 更新时间刻度点，从变更索引开始重建对应权重的刻度列表。
	 */
	public setTimeScalePoints(newPoints: readonly TimeScalePoint[], firstChangedPointIndex: number): void {
		this._removeMarksSinceIndex(firstChangedPointIndex);

		this._cache = null;

		for (let index = firstChangedPointIndex; index < newPoints.length; ++index) {
			const point = newPoints[index];
			let marksForWeight = this._marksByWeight.get(point.timeWeight);
			if (marksForWeight === undefined) {
				marksForWeight = [];
				this._marksByWeight.set(point.timeWeight, marksForWeight);
			}

			marksForWeight.push({
				index: index as TimePointIndex,
				time: point.time,
				weight: point.timeWeight,
				originalTime: point.originalTime,
			});
		}
	}

	/**
	 * 根据像素间距和数据覆盖情况构建刻度列表，并对结果进行缓存。
	 */
	public build(spacing: number, maxWidth: number, checkIndicesForData: boolean, indicesWithDataMap: Map<TimePointIndex, boolean>, indicesWithDataId: number): readonly TickMark[] {
		const maxIndexesPerMark = Math.ceil(maxWidth / spacing);
		if (
			this._cache === null ||
			this._cache.maxIndexesPerMark !== maxIndexesPerMark ||
			indicesWithDataId !== this._cache.indicesWithDataId ||
			checkIndicesForData !== this._cache.checkIndicesForData
		) {
			this._cache = {
				indicesWithDataId,
				checkIndicesForData,
				marks: this._buildMarksImpl(maxIndexesPerMark, checkIndicesForData, indicesWithDataMap),
				maxIndexesPerMark,
			};
		}

		return this._cache.marks;
	}

	/**
	 * 删除指定索引之后的缓存刻度，以便重建。
	 */
	private _removeMarksSinceIndex(sinceIndex: number): void {
		if (sinceIndex === 0) {
			this._marksByWeight.clear();
			return;
		}

		const weightsToClear: TickMarkWeightValue[] = [];

		this._marksByWeight.forEach((marks: TickMark[], timeWeight: TickMarkWeightValue) => {
			if (sinceIndex <= marks[0].index) {
				weightsToClear.push(timeWeight);
			} else {
				marks.splice(
					lowerBound(marks, sinceIndex, (tm: TickMark) => tm.index < sinceIndex),
					Infinity
				);
			}
		});

		for (const weight of weightsToClear) {
			this._marksByWeight.delete(weight);
		}
	}

	/**
	 * 按权重从高到低迭代，生成新的刻度集合，确保相邻刻度满足最小像素间距。
	 */
	private _buildMarksImpl(maxIndexesPerMark: number, checkIndicesForData: boolean, indicesWithDataMap: Map<TimePointIndex, boolean>): readonly TickMark[] {
		let marks: TickMark[] = [];

		const canBeIncluded = (mark: TickMark): boolean => !checkIndicesForData || indicesWithDataMap.has(mark.index);

		for (const weight of Array.from(this._marksByWeight.keys()).sort((a: number, b: number) => b - a)) {
			if (!this._marksByWeight.get(weight)) {
				continue;
			}

			// 上一轮筛选出的刻度作为 prevMarks，新一轮重新构建。
			const prevMarks = marks;
			marks = [];

			const prevMarksLength = prevMarks.length;
			let prevMarksPointer = 0;
			const currentWeight = ensureDefined(this._marksByWeight.get(weight));
			const currentWeightLength = currentWeight.length;

			let rightIndex = Infinity;
			let leftIndex = -Infinity;
			for (let i = 0; i < currentWeightLength; i++) {
				const mark = currentWeight[i];
				const currentIndex = mark.index;

				// 确定当前索引与左右邻居的距离。
				while (prevMarksPointer < prevMarksLength) {
					const lastMark = prevMarks[prevMarksPointer];
					const lastIndex = lastMark.index;
					if (lastIndex < currentIndex && canBeIncluded(lastMark)) {
						prevMarksPointer++;
						marks.push(lastMark);
						leftIndex = lastIndex;
						rightIndex = Infinity;
					} else {
						rightIndex = lastIndex;
						break;
					}
				}

				if (
					rightIndex - currentIndex >= maxIndexesPerMark &&
					currentIndex - leftIndex >= maxIndexesPerMark &&
					canBeIncluded(mark)
				) {
					// TickMark fits. Place it into new array
					marks.push(mark);
					leftIndex = currentIndex;
				} else {
					if (this._uniformDistribution) {
						return prevMarks;
					}
				}
			}

			// Place all unused tickMarks into new array;
			for (; prevMarksPointer < prevMarksLength; prevMarksPointer++) {
				if (canBeIncluded(prevMarks[prevMarksPointer])) {
					marks.push(prevMarks[prevMarksPointer]);
				}
			}
		}

		return marks;
	}
}
