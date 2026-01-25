// 引入位图渲染作用域，提供 Canvas 上下文与缩放信息
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 帮助函数，用于在矩形内部绘制边框
import { fillRectInnerBorder } from '../helpers/canvas-helpers';

// 蜡烛图的颜色样式定义
import { CandlesticksColorerStyle } from '../model/series-bar-colorer';
// 序列索引可见范围类型
import { SeriesItemsIndexesRange } from '../model/time-data';

// 柱、蜡烛图通用的数据结构
import { BarCandlestickItemBase } from './bars-renderer';
// 位图坐标平面的渲染器基类
import { BitmapCoordinatesPaneRenderer } from './bitmap-coordinates-pane-renderer';
// 计算最佳蜡烛宽度的工具函数
import { optimalCandlestickWidth } from './optimal-bar-width';

// 蜡烛图渲染项，包含价格、坐标与颜色信息
export interface CandlestickItem extends BarCandlestickItemBase, CandlesticksColorerStyle {
}

// 蜡烛图渲染器所需的数据
export interface PaneRendererCandlesticksData {
	// 蜡烛图列表
	bars: readonly CandlestickItem[];

	// 蜡烛之间的间距
	barSpacing: number;

	// 是否绘制影线
	wickVisible: boolean;
	// 是否绘制边框
	borderVisible: boolean;

	// 当前可见的索引范围
	visibleRange: SeriesItemsIndexesRange | null;
}

const enum Constants {
	// 蜡烛边框默认宽度
	BarBorderWidth = 1,
}

export class PaneRendererCandlesticks extends BitmapCoordinatesPaneRenderer {
	// 当前渲染数据
	private _data: PaneRendererCandlesticksData | null = null;

	// scaled with pixelRatio
	// 缩放后的蜡烛宽度
	private _barWidth: number = 0;

	// 设置渲染数据
	public setData(data: PaneRendererCandlesticksData): void {
		this._data = data;
	}

	// 主绘制流程
	protected override _drawImpl(renderingScope: BitmapCoordinatesRenderingScope): void {
		// 无数据或可见范围为空时直接返回
		if (this._data === null || this._data.bars.length === 0 || this._data.visibleRange === null) {
			return;
		}

		// 解构像素比例
		const { horizontalPixelRatio } = renderingScope;

		// now we know pixelRatio and we could calculate barWidth effectively
		// 根据像素比计算蜡烛宽度
		this._barWidth = optimalCandlestickWidth(this._data.barSpacing, horizontalPixelRatio);

		// grid and crosshair have line width = Math.floor(pixelRatio)
		// if this value is odd, we have to make candlesticks' width odd
		// if this value is even, we have to make candlesticks' width even
		// in order of keeping crosshair-over-candlesticks drawing symmetric
		// 调整蜡烛宽度，使其与网格线宽的奇偶性一致，保持十字准线对称
		if (this._barWidth >= 2) {
			// 影线宽度基于像素比
			const wickWidth = Math.floor(horizontalPixelRatio);
			// 若奇偶性不同则减少蜡烛宽度
			if ((wickWidth % 2) !== (this._barWidth % 2)) {
				this._barWidth--;
			}
		}

		// 当前可见的蜡烛集合
		const bars = this._data.bars;
		// 根据配置绘制影线
		if (this._data.wickVisible) {
			this._drawWicks(renderingScope, bars, this._data.visibleRange);
		}

		// 根据配置绘制边框
		if (this._data.borderVisible) {
			this._drawBorder(renderingScope, bars, this._data.visibleRange);
		}

		// 计算边框宽度，用于判断是否渲染实体
		const borderWidth = this._calculateBorderWidth(horizontalPixelRatio);

		// 当边框未显示或蜡烛足够宽时绘制实体
		if (!this._data.borderVisible || this._barWidth > borderWidth * 2) {
			this._drawCandles(renderingScope, bars, this._data.visibleRange);
		}
	}

	// 绘制影线
	private _drawWicks(renderingScope: BitmapCoordinatesRenderingScope, bars: readonly CandlestickItem[], visibleRange: SeriesItemsIndexesRange): void {
		if (this._data === null) {
			return;
		}

		// 解构上下文与像素比
		const { context: ctx, horizontalPixelRatio, verticalPixelRatio } = renderingScope;

		// 记录上一次使用的影线颜色，避免重复赋值
		let prevWickColor = '';
		// 初始影线宽度，限制在像素比与柱间距之间
		let wickWidth = Math.min(
			Math.floor(horizontalPixelRatio),
			Math.floor(this._data.barSpacing * horizontalPixelRatio)
		);
		// 保证影线宽度至少为像素比且不超过蜡烛宽度
		wickWidth = Math.max(
			Math.floor(horizontalPixelRatio),
			Math.min(wickWidth, this._barWidth)
		);
		// 影线相对中心的偏移量
		const wickOffset = Math.floor(wickWidth * 0.5);

		// 上一个影线的右边界，用于避免重叠
		let prevEdge: number | null = null;

		// 遍历可见范围内的蜡烛
		for (let i = visibleRange.from; i < visibleRange.to; i++) {
			// 当前蜡烛数据
			const bar = bars[i];
			// 若颜色变化则更新填充颜色
			if (bar.barWickColor !== prevWickColor) {
				ctx.fillStyle = bar.barWickColor;
				prevWickColor = bar.barWickColor;
			}

			// 实体顶部和底部（开收价）
			const top = Math.round(Math.min(bar.openY, bar.closeY) * verticalPixelRatio);
			const bottom = Math.round(Math.max(bar.openY, bar.closeY) * verticalPixelRatio);

			// 最高价与最低价像素坐标
			const high = Math.round(bar.highY * verticalPixelRatio);
			const low = Math.round(bar.lowY * verticalPixelRatio);

			// 蜡烛中心 x 坐标
			const scaledX = Math.round(horizontalPixelRatio * bar.x);

			// 影线左侧位置
			let left = scaledX - wickOffset;
			// 影线右侧位置
			const right = left + wickWidth - 1;
			// 避免与前一根影线重叠
			if (prevEdge !== null) {
				left = Math.max(prevEdge + 1, left);
				left = Math.min(left, right);
			}
			// 实际宽度
			const width = right - left + 1;

			// 绘制上影线
			ctx.fillRect(left, high, width, top - high);
			// 绘制下影线
			ctx.fillRect(left, bottom + 1, width, low - bottom);

			// 记录当前影线的右边界
			prevEdge = right;
		}
	}

	// 计算蜡烛边框宽度
	private _calculateBorderWidth(pixelRatio: number): number {
		// 初始边框宽度基于常量与像素比
		let borderWidth = Math.floor(Constants.BarBorderWidth * pixelRatio);
		// 若蜡烛整体过窄，则缩小边框避免覆盖实体
		if (this._barWidth <= 2 * borderWidth) {
			borderWidth = Math.floor((this._barWidth - 1) * 0.5);
		}
		// 选择像素比与边框宽度的较大值
		const res = Math.max(Math.floor(pixelRatio), borderWidth);
		// 若蜡烛宽度不足以容纳实体，则不绘制实体
		if (this._barWidth <= res * 2) {
			// do not draw bodies, restore original value
			return Math.max(Math.floor(pixelRatio), Math.floor(Constants.BarBorderWidth * pixelRatio));
		}
		// 返回边框宽度
		return res;
	}

	// 绘制蜡烛边框
	private _drawBorder(renderingScope: BitmapCoordinatesRenderingScope, bars: readonly CandlestickItem[], visibleRange: SeriesItemsIndexesRange): void {
		if (this._data === null) {
			return;
		}

		// 解构上下文与像素比
		const { context: ctx, horizontalPixelRatio, verticalPixelRatio } = renderingScope;

		// 记录前一根边框颜色，避免重复赋值
		let prevBorderColor: string | undefined = '';
		// 当前的边框宽度
		const borderWidth = this._calculateBorderWidth(horizontalPixelRatio);

		// 记录前一根蜡烛的右边界，避免重叠
		let prevEdge: number | null = null;

		// 遍历可见范围内的蜡烛
		for (let i = visibleRange.from; i < visibleRange.to; i++) {
			// 当前蜡烛
			const bar = bars[i];
			// 根据颜色变化更新填充样式
			if (bar.barBorderColor !== prevBorderColor) {
				ctx.fillStyle = bar.barBorderColor;
				prevBorderColor = bar.barBorderColor;
			}

			// 左侧位置（基于蜡烛中心）
			let left = Math.round(bar.x * horizontalPixelRatio) - Math.floor(this._barWidth * 0.5);
			// this is important to calculate right before patching left
			// 右侧位置需先计算以确保左右对齐
			const right = left + this._barWidth - 1;

			// 上下边界基于开收价
			const top = Math.round(Math.min(bar.openY, bar.closeY) * verticalPixelRatio);
			const bottom = Math.round(Math.max(bar.openY, bar.closeY) * verticalPixelRatio);

			// 避免边框相互覆盖
			if (prevEdge !== null) {
				left = Math.max(prevEdge + 1, left);
				left = Math.min(left, right);
			}
			// 根据柱间距决定采用内边框还是整体填充
			if (this._data.barSpacing * horizontalPixelRatio > 2 * borderWidth) {
				fillRectInnerBorder(ctx, left, top, right - left + 1, bottom - top + 1, borderWidth);
			} else {
				// 空间不足时直接填充矩形
				const width = right - left + 1;
				ctx.fillRect(left, top, width, bottom - top + 1);
			}
			// 更新上一根的右边界
			prevEdge = right;
		}
	}

	// 绘制蜡烛实体
	private _drawCandles(renderingScope: BitmapCoordinatesRenderingScope, bars: readonly CandlestickItem[], visibleRange: SeriesItemsIndexesRange): void {
		if (this._data === null) {
			return;
		}

		// 解构上下文与像素比
		const { context: ctx, horizontalPixelRatio, verticalPixelRatio } = renderingScope;

		// 记录上一次的实体颜色
		let prevBarColor = '';
		// 当前边框宽度，用于缩减实体宽度
		const borderWidth = this._calculateBorderWidth(horizontalPixelRatio);

		// 遍历可见范围内的蜡烛
		for (let i = visibleRange.from; i < visibleRange.to; i++) {
			// 当前蜡烛
			const bar = bars[i];

			// 计算实体的上下位置
			let top = Math.round(Math.min(bar.openY, bar.closeY) * verticalPixelRatio);
			let bottom = Math.round(Math.max(bar.openY, bar.closeY) * verticalPixelRatio);

			// 计算左右边界
			let left = Math.round(bar.x * horizontalPixelRatio) - Math.floor(this._barWidth * 0.5);
			let right = left + this._barWidth - 1;

			// 若颜色变化则更新填充颜色
			if (bar.barColor !== prevBarColor) {
				const barColor = bar.barColor;
				ctx.fillStyle = barColor;
				prevBarColor = barColor;
			}

			// 如果边框可见，需要在实体内缩进边框宽度
			if (this._data.borderVisible) {
				left += borderWidth;
				top += borderWidth;
				right -= borderWidth;
				bottom -= borderWidth;
			}

			// 数据质量问题可能导致顶部大于底部，需跳过
			if (top > bottom) {
				continue;
			}
			// 绘制蜡烛实体
			ctx.fillRect(left, top, right - left + 1, bottom - top + 1);
		}
	}
}
