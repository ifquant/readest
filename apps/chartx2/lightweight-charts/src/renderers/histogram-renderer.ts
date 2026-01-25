// 引入位图渲染作用域，提供 Canvas 上下文与像素缩放
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 价格数据结构
import { PricedValue } from '../model/price-scale';
// 序列索引范围、时间戳与索引类型
import { SeriesItemsIndexesRange, TimedValue, TimePointIndex } from '../model/time-data';

// 位图坐标面板渲染器基类
import { BitmapCoordinatesPaneRenderer } from './bitmap-coordinates-pane-renderer';

const showSpacingMinimalBarWidth = 1;
const alignToMinimalWidthLimit = 4;

// 直方图条目结构
export interface HistogramItem extends PricedValue, TimedValue {
	barColor: string;
}

// 直方图渲染数据
export interface PaneRendererHistogramData {
	items: HistogramItem[];

	barSpacing: number;
	histogramBase: number;

	visibleRange: SeriesItemsIndexesRange | null;
}

// 预计算后的条目位置信息
interface PrecalculatedItemCoordinates {
	left: number;
	right: number;
	roundedCenter: number;
	center: number;
	time: TimePointIndex;
}

export class PaneRendererHistogram extends BitmapCoordinatesPaneRenderer {
	// 当前渲染数据
	private _data: PaneRendererHistogramData | null = null;
	// 缓存条目像素坐标，提高绘制性能
	private _precalculatedCache: PrecalculatedItemCoordinates[] = [];

	// 写入数据并清空缓存
	public setData(data: PaneRendererHistogramData): void {
		this._data = data;
		this._precalculatedCache = [];
	}

	// 绘制直方图
	protected override _drawImpl({ context: ctx, horizontalPixelRatio, verticalPixelRatio }: BitmapCoordinatesRenderingScope): void {
		// 无数据或无可见范围时直接返回
		if (this._data === null || this._data.items.length === 0 || this._data.visibleRange === null) {
			return;
		}
		// 首次绘制时计算像素坐标缓存
		if (!this._precalculatedCache.length) {
			this._fillPrecalculatedCache(horizontalPixelRatio);
		}

		// 计算条形线宽和基线位置
		const tickWidth = Math.max(1, Math.floor(verticalPixelRatio));
		const histogramBase = Math.round((this._data.histogramBase) * verticalPixelRatio);
		const topHistogramBase = histogramBase - Math.floor(tickWidth / 2);
		const bottomHistogramBase = topHistogramBase + tickWidth;

		// 遍历可见范围绘制柱子
		for (let i = this._data.visibleRange.from; i < this._data.visibleRange.to; i++) {
			const item = this._data.items[i];
			const current = this._precalculatedCache[i - this._data.visibleRange.from];
			const y = Math.round(item.y * verticalPixelRatio);
			ctx.fillStyle = item.barColor;

			let top: number;
			let bottom: number;

			// 判断柱子位于基线之上还是之下
			if (y <= topHistogramBase) {
				top = y;
				bottom = bottomHistogramBase;
			} else {
				top = topHistogramBase;
				bottom = y - Math.floor(tickWidth / 2) + tickWidth;
			}

			// 绘制矩形柱
			ctx.fillRect(current.left, top, current.right - current.left + 1, bottom - top);
		}
	}

	// eslint-disable-next-line complexity
	// 预计算直方图条目的像素坐标
	private _fillPrecalculatedCache(pixelRatio: number): void {
		if (this._data === null || this._data.items.length === 0 || this._data.visibleRange === null) {
			this._precalculatedCache = [];
			return;
		}
		// 计算条目之间的间距像素宽度
		const spacing = Math.ceil(this._data.barSpacing * pixelRatio) <= showSpacingMinimalBarWidth ? 0 : Math.max(1, Math.floor(pixelRatio));
		// 实际柱宽
		const columnWidth = Math.round(this._data.barSpacing * pixelRatio) - spacing;

		// 按可见范围长度初始化缓存
		this._precalculatedCache = new Array(this._data.visibleRange.to - this._data.visibleRange.from);

		// 逐条计算左右边界
		for (let i = this._data.visibleRange.from; i < this._data.visibleRange.to; i++) {
			const item = this._data.items[i];
			// force cast to avoid ensureDefined call
			const x = Math.round(item.x * pixelRatio);
			let left: number;
			let right: number;

			if (columnWidth % 2) {
				const halfWidth = (columnWidth - 1) / 2;
				left = x - halfWidth;
				right = x + halfWidth;
			} else {
				// shift pixel to left
				const halfWidth = columnWidth / 2;
				left = x - halfWidth;
				right = x + halfWidth - 1;
			}
			// 将结果写入缓存
			this._precalculatedCache[i - this._data.visibleRange.from] = {
				left,
				right,
				roundedCenter: x,
				center: (item.x * pixelRatio),
				time: item.time,
			};
		}

		// correct positions
		// 调整相邻条目之间的边界以保持间距
		for (let i = this._data.visibleRange.from + 1; i < this._data.visibleRange.to; i++) {
			const current = this._precalculatedCache[i - this._data.visibleRange.from];
			const prev = this._precalculatedCache[i - this._data.visibleRange.from - 1];
			if (current.time !== prev.time + 1) {
				continue;
			}
			if (current.left - prev.right !== (spacing + 1)) {
				// have to align
				if (prev.roundedCenter > prev.center) {
					// prev wasshifted to left, so add pixel to right
					prev.right = current.left - spacing - 1;
				} else {
					// extend current to left
					current.left = prev.right + spacing + 1;
				}
			}
		}

		// 统计最小柱宽度
		let minWidth = Math.ceil(this._data.barSpacing * pixelRatio);
		for (let i = this._data.visibleRange.from; i < this._data.visibleRange.to; i++) {
			const current = this._precalculatedCache[i - this._data.visibleRange.from];
			// this could happen if barspacing < 1
			if (current.right < current.left) {
				current.right = current.left;
			}
			const width = current.right - current.left + 1;
			minWidth = Math.min(width, minWidth);
		}

		// 当存在间距但最小宽度过小时，进一步对齐
		if (spacing > 0 && minWidth < alignToMinimalWidthLimit) {
			for (let i = this._data.visibleRange.from; i < this._data.visibleRange.to; i++) {
				const current = this._precalculatedCache[i - this._data.visibleRange.from];
				const width = current.right - current.left + 1;
				if (width > minWidth) {
					if (current.roundedCenter > current.center) {
						current.right -= 1;
					} else {
						current.left += 1;
					}
				}
			}
		}
	}
}
