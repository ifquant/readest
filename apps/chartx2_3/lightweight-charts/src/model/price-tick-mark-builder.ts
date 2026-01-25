import { ensure } from '../helpers/assertions';
import { min } from '../helpers/mathex';

import { Coordinate } from './coordinate';
import { PriceMark, PriceScale } from './price-scale';
import { convertPriceRangeFromLog } from './price-scale-conversions';
import { PriceTickSpanCalculator } from './price-tick-span-calculator';

export type CoordinateToLogicalConverter = (x: number, firstValue: number) => number;
export type LogicalToCoordinateConverter = (x: number, firstValue: number, keepItFloat: boolean) => number;

const TICK_DENSITY = 2.5;

/**
 * 根据价格轴范围自动生成刻度线及标签的构建器。
 */
export class PriceTickMarkBuilder {
	private _marks: PriceMark[] = [];
	private _base: number;
	private readonly _priceScale: PriceScale;
	private readonly _coordinateToLogicalFunc: CoordinateToLogicalConverter;
	private readonly _logicalToCoordinateFunc: LogicalToCoordinateConverter;

	public constructor(
		priceScale: PriceScale,
		base: number,
		coordinateToLogicalFunc: CoordinateToLogicalConverter,
		logicalToCoordinateFunc: LogicalToCoordinateConverter
	) {
		this._priceScale = priceScale;
		this._base = base;
		this._coordinateToLogicalFunc = coordinateToLogicalFunc;
		this._logicalToCoordinateFunc = logicalToCoordinateFunc;
	}

	/**
	 * 根据当前显示范围估算合适的刻度间距。
	 */
	public tickSpan(high: number, low: number): number {
		if (high < low) {
			throw new Error('high < low');
		}

		const scaleHeight = this._priceScale.height();
		const markHeight = this._tickMarkHeight();

		const maxTickSpan = (high - low) * markHeight / scaleHeight;

		const spanCalculator1 = new PriceTickSpanCalculator(this._base, [2, 2.5, 2]);
		const spanCalculator2 = new PriceTickSpanCalculator(this._base, [2, 2, 2.5]);
		const spanCalculator3 = new PriceTickSpanCalculator(this._base, [2.5, 2, 2]);

		const spans: number[] = [];

		spans.push(
			spanCalculator1.tickSpan(high, low, maxTickSpan),
			spanCalculator2.tickSpan(high, low, maxTickSpan),
			spanCalculator3.tickSpan(high, low, maxTickSpan)
		);

		return min(spans);
	}

	/**
	 * 重新计算价格轴刻度，更新标签文本。
	 */
	public rebuildTickMarks(): void {
		const priceScale = this._priceScale;

		const firstValue = priceScale.firstValue();

		if (firstValue === null) {
			this._marks = [];
			return;
		}

		const scaleHeight = priceScale.height();

		const bottom = this._coordinateToLogicalFunc(scaleHeight - 1, firstValue);
		const top = this._coordinateToLogicalFunc(0, firstValue);

		const extraTopBottomMargin = this._priceScale.options().entireTextOnly ? this._fontHeight() / 2 : 0;
		const minCoord = extraTopBottomMargin;
		const maxCoord = scaleHeight - 1 - extraTopBottomMargin;

		const high = Math.max(bottom, top);
		const low = Math.min(bottom, top);

		if (high === low) {
			this._marks = [];
			return;
		}

		const span = this.tickSpan(high, low);
		this._updateMarks(
			firstValue,
			span,
			high,
			low,
			minCoord,
			maxCoord
		);

		if (priceScale.hasVisibleEdgeMarks() && this._shouldApplyEdgeMarks(span, low, high)) {
			const padding = this._priceScale.getEdgeMarksPadding();
			this._applyEdgeMarks(
				firstValue,
				span,
				minCoord,
				maxCoord,
				padding,
				padding * 2
			);
		}

		const logicals = this._marks.map((mark: PriceMark) => mark.logical);
		const labels = this._priceScale.formatLogicalTickmarks(logicals);
		for (let i = 0; i < this._marks.length; i++) {
			this._marks[i].label = labels[i];
		}
	}

	public marks(): PriceMark[] {
		return this._marks;
	}

	private _fontHeight(): number {
		return this._priceScale.fontSize();
	}

	private _tickMarkHeight(): number {
		return Math.ceil(this._fontHeight() * TICK_DENSITY);
	}

	/**
	 * 遍历逻辑值区间，生成或复用刻度条目，并在对数坐标下动态调整跨度。
	 */
	private _updateMarks(firstValue: number, span: number, high: number, low: number, minCoord: number, maxCoord: number): void {
		const marks = this._marks;
		const priceScale = this._priceScale;

		let mod = high % span;
		mod += mod < 0 ? span : 0;

		const sign = (high >= low) ? 1 : -1;
		let prevCoord: number | null = null;

		let targetIndex = 0;

		for (let logical = high - mod; logical > low; logical -= span) {
			const coord = this._logicalToCoordinateFunc(logical, firstValue, true);

			// 检查刻度间距是否足够（对数轴下可能非常密集）。
			if (prevCoord !== null && Math.abs(coord - prevCoord) < this._tickMarkHeight()) {
				continue;
			}

			// 若刻度超出可视范围，则跳过。
			if (coord < minCoord || coord > maxCoord) {
				continue;
			}

			if (targetIndex < marks.length) {
				marks[targetIndex].coord = coord as Coordinate;
				marks[targetIndex].label = priceScale.formatLogical(logical);
				marks[targetIndex].logical = logical;
			} else {
				marks.push({
					coord: coord as Coordinate,
					label: priceScale.formatLogical(logical),
					logical,
				});
			}

			targetIndex++;

			prevCoord = coord;
			if (priceScale.isLog()) {
				// 对数坐标下，根据新的逻辑值重新估算跨度。
				span = this.tickSpan(logical * sign, low);
			}
		}

		marks.length = targetIndex;
	}

	/**
	 * 为价格轴上下边界补充额外的刻度，避免标签被裁剪。
	 */
	private _applyEdgeMarks(
		firstValue: number,
		span: number,
		minCoord: number,
		maxCoord: number,
		minPadding: number,
		maxPadding: number
	): void {
		const marks = this._marks;
		// 顶部边界刻度
		const topMark = this._computeBoundaryPriceMark(
			firstValue,
			minCoord,
			minPadding,
			maxPadding
		);

		// 底部边界刻度
		const bottomMark = this._computeBoundaryPriceMark(
			firstValue,
			maxCoord,
			-maxPadding,
			-minPadding
		);

		const spanPx = this._logicalToCoordinateFunc(0, firstValue, true)
			- this._logicalToCoordinateFunc(span, firstValue, true);

		if (marks.length > 0 && marks[0].coord - topMark.coord < spanPx / 2) {
			marks.shift();
		}

		if (marks.length > 0 && bottomMark.coord - marks[marks.length - 1].coord < spanPx / 2) {
			marks.pop();
		}

		marks.unshift(topMark);
		marks.push(bottomMark);
	}

	/**
	 * 计算靠近边界的刻度位置及标签，使用 padding 控制可见性。
	 */
	private _computeBoundaryPriceMark(
		firstValue: number,
		coord: number,
		minPadding: number,
		maxPadding: number
	): PriceMark {
		const avgPadding = (minPadding + maxPadding) / 2;
		const value1 = this._coordinateToLogicalFunc(coord + minPadding, firstValue);
		const value2 = this._coordinateToLogicalFunc(coord + maxPadding, firstValue);
		const minValue = Math.min(value1, value2);
		const maxValue = Math.max(value1, value2);
		const valueSpan = Math.max(0.1, this.tickSpan(maxValue, minValue));

		const value = this._coordinateToLogicalFunc(coord + avgPadding, firstValue);
		const roundedValue = value - (value % valueSpan);
		const roundedCoord = this._logicalToCoordinateFunc(roundedValue, firstValue, true);

		return { label: this._priceScale.formatLogical(roundedValue), coord: roundedCoord as Coordinate, logical: roundedValue };
	}

	private _shouldApplyEdgeMarks(span: number, low: number, high: number): boolean {
		let range = ensure(this._priceScale.priceRange());

		if (this._priceScale.isLog()) {
			range = convertPriceRangeFromLog(range, this._priceScale.getLogFormula());
		}

		return (range.minValue() - low < span) && (high - range.maxValue() < span);
	}
}
