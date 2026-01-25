// 引入位图渲染作用域，用于访问 Canvas 上下文与像素比
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 断言工具，确保值不为 null
import { ensureNotNull } from '../helpers/assertions';

// 柱状图坐标与价格数据结构
import { BarCoordinates, BarPrices } from '../model/bar';
// 柱状图的颜色样式定义
import { BarColorerStyle } from '../model/series-bar-colorer';
// 序列索引范围以及带时间戳的值类型
import { SeriesItemsIndexesRange, TimedValue } from '../model/time-data';

// 基于位图坐标的面板渲染器基类
import { BitmapCoordinatesPaneRenderer } from './bitmap-coordinates-pane-renderer';
// 计算最佳柱宽的工具函数
import { optimalBarWidth } from './optimal-bar-width';

// 柱状图基础项：包含时间、价格以及屏幕坐标
export type BarCandlestickItemBase = TimedValue & BarPrices & BarCoordinates;

// 加上颜色样式后的柱状图项
export interface BarItem extends BarCandlestickItemBase, BarColorerStyle {
}

// 柱状图渲染器所需的数据结构
export interface PaneRendererBarsData {
	// 所有柱子的渲染数据
	bars: readonly BarItem[];
	// 柱子之间的间距
	barSpacing: number;
	// 是否显示开盘价的水平线
	openVisible: boolean;
	// 是否使用细柱样式
	thinBars: boolean;

	// 当前可见的数据索引范围
	visibleRange: SeriesItemsIndexesRange | null;
}

export class PaneRendererBars extends BitmapCoordinatesPaneRenderer {
	// 当前渲染数据
	private _data: PaneRendererBarsData | null = null;
	// 当前计算出的柱宽（像素）
	private _barWidth: number = 0;
	// 柱体绘制时使用的线宽
	private _barLineWidth: number = 0;

	// 写入渲染数据
	public setData(data: PaneRendererBarsData): void {
		this._data = data;
	}

	// eslint-disable-next-line complexity
	// 实际绘制逻辑，接收渲染作用域
	protected override _drawImpl({ context: ctx, horizontalPixelRatio, verticalPixelRatio }: BitmapCoordinatesRenderingScope): void {
		// 没有数据或可见范围为空时直接返回
		if (this._data === null || this._data.bars.length === 0 || this._data.visibleRange === null) {
			return;
		}

		// 计算实际渲染的柱宽
		this._barWidth = this._calcBarWidth(horizontalPixelRatio);

		// grid and crosshair have line width = Math.floor(pixelRatio)
		// if this value is odd, we have to make bars' width odd
		// if this value is even, we have to make bars' width even
		// in order of keeping crosshair-over-bar drawing symmetric
		// 调整柱宽以与网格和十字光标保持奇偶性一致，确保对称
		if (this._barWidth >= 2) {
			// 计算与像素比匹配的线宽
			const lineWidth = Math.max(1, Math.floor(horizontalPixelRatio));
			// 当奇偶性不一致时，减少宽度以保持一致
			if ((lineWidth % 2) !== (this._barWidth % 2)) {
				this._barWidth--;
			}
		}

		// if scale is compressed, bar could become less than 1 CSS pixel
		// 细柱模式下，线宽应为柱宽与像素比取最小值
		this._barLineWidth = this._data.thinBars ? Math.min(this._barWidth, Math.floor(horizontalPixelRatio)) : this._barWidth;
		// 记录前一根柱子的颜色，避免重复赋值
		let prevColor: string | null = null;

		// 决定是否绘制开/收价的短横线
		const drawOpenClose = this._barLineWidth <= this._barWidth && this._data.barSpacing >= Math.floor(1.5 * horizontalPixelRatio);
		// 遍历可见范围内的柱子
		for (let i = this._data.visibleRange.from; i < this._data.visibleRange.to; ++i) {
			// 当前柱的数据
			const bar = this._data.bars[i];
			// 如果颜色改变，更新 fillStyle
			if (prevColor !== bar.barColor) {
				ctx.fillStyle = bar.barColor;
				prevColor = bar.barColor;
			}

			// 计算柱体宽度的一半
			const bodyWidthHalf = Math.floor(this._barLineWidth * 0.5);

			// 柱体中心在像素坐标系中的位置
			const bodyCenter = Math.round(bar.x * horizontalPixelRatio);
			// 柱体左侧像素位置
			const bodyLeft = bodyCenter - bodyWidthHalf;
			// 柱体宽度等于线宽
			const bodyWidth = this._barLineWidth;
			// 柱体右侧像素位置
			const bodyRight = bodyLeft + bodyWidth - 1;

			// 高低点中较高的一侧（屏幕坐标向下增大）
			const high = Math.min(bar.highY, bar.lowY);
			// 高低点中较低的一侧
			const low = Math.max(bar.highY, bar.lowY);

			// 柱体顶部像素位置
			const bodyTop = Math.round(high * verticalPixelRatio) - bodyWidthHalf;

			// 柱体底部像素位置
			const bodyBottom = Math.round(low * verticalPixelRatio) + bodyWidthHalf;

			// 核算柱体高度，至少为线宽
			const bodyHeight = Math.max((bodyBottom - bodyTop), this._barLineWidth);

			// 绘制柱体矩形
			ctx.fillRect(
				bodyLeft,
				bodyTop,
				bodyWidth,
				bodyHeight
			);

			// 开收价短横线两侧的延伸宽度
			const sideWidth = Math.ceil(this._barWidth * 1.5);

			// 根据配置决定是否绘制开/收价
			if (drawOpenClose) {
				// 可选地绘制开盘价短横线
				if (this._data.openVisible) {
					// 开盘价横线左侧位置
					const openLeft = bodyCenter - sideWidth;
					// 计算开盘价短横线顶部像素
					let openTop = Math.max(bodyTop, Math.round(bar.openY * verticalPixelRatio) - bodyWidthHalf);
					// 根据线宽推导底部像素
					let openBottom = openTop + bodyWidth - 1;
					// 若超出柱体范围则回退
					if (openBottom > bodyTop + bodyHeight - 1) {
						openBottom = bodyTop + bodyHeight - 1;
						openTop = openBottom - bodyWidth + 1;
					}
					// 绘制开盘价短横线
					ctx.fillRect(
						openLeft,
						openTop,
						bodyLeft - openLeft,
						openBottom - openTop + 1
					);
				}

				// 收盘价横线右侧位置
				const closeRight = bodyCenter + sideWidth;
				// 计算收盘价短横线顶部像素
				let closeTop = Math.max(bodyTop, Math.round(bar.closeY * verticalPixelRatio) - bodyWidthHalf);
				// 根据线宽推导底部像素
				let closeBottom = closeTop + bodyWidth - 1;
				// 若超出柱体范围则回退
				if (closeBottom > bodyTop + bodyHeight - 1) {
					closeBottom = bodyTop + bodyHeight - 1;
					closeTop = closeBottom - bodyWidth + 1;
				}

				// 绘制收盘价短横线
				ctx.fillRect(
					bodyRight + 1,
					closeTop,
					closeRight - bodyRight,
					closeBottom - closeTop + 1
				);
			}
		}
	}

	// 根据像素比计算柱宽
	private _calcBarWidth(pixelRatio: number): number {
		// 将像素比向下取整作为下限
		const limit = Math.floor(pixelRatio);
		// 结合最佳柱宽与下限取最大值
		return Math.max(limit, Math.floor(optimalBarWidth(ensureNotNull(this._data).barSpacing, pixelRatio)));
	}
}
