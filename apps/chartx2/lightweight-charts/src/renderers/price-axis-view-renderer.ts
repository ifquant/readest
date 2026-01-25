// 引入位图与媒体坐标渲染作用域，以及 Canvas 渲染目标
import { BitmapCoordinatesRenderingScope, CanvasRenderingTarget2D, MediaCoordinatesRenderingScope } from 'fancy-canvas';

// 绘制带圆角边框的矩形工具
import { drawRoundRectWithBorder } from '../helpers/canvas-helpers';

// 文本宽度缓存，避免重复测量
import { TextWidthCache } from '../model/text-width-cache';

import {
	IPriceAxisViewRenderer,
	PriceAxisViewRendererCommonData,
	PriceAxisViewRendererData,
	PriceAxisViewRendererOptions,
} from './iprice-axis-view-renderer';

// 几何结构描述标签在不同坐标空间中的位置与尺寸
interface Geometry {
	alignRight: boolean;

	// bitmap coordinate space geometry
	bitmap: {
		yTop: number;
		yMid: number;
		yBottom: number;
		totalWidth: number;
		totalHeight: number;
		radius: number;
		horzBorder: number;
		xOutside: number;
		xInside: number;
		xTick: number;
		tickHeight: number;
		right: number;
	};

	// media coordinate space geometry
	media: {
		yTop: number;
		yBottom: number;
		xText: number;
		textMidCorrection: number;
	};
}

export class PriceAxisViewRenderer implements IPriceAxisViewRenderer {
	// 当前标签数据
	private _data!: PriceAxisViewRendererData;
	// 当前标签的通用配置
	private _commonData!: PriceAxisViewRendererCommonData;

	// 构造时直接设置数据
	public constructor(data: PriceAxisViewRendererData, commonData: PriceAxisViewRendererCommonData) {
		this.setData(data, commonData);
	}

	// 写入标签数据与通用配置
	public setData(data: PriceAxisViewRendererData, commonData: PriceAxisViewRendererCommonData): void {
		this._data = data;
		this._commonData = commonData;
	}

	// 计算标签高度
	public height(rendererOptions: PriceAxisViewRendererOptions, useSecondLine: boolean): number {
		if (!this._data.visible) {
			return 0;
		}

		return rendererOptions.fontSize + rendererOptions.paddingTop + rendererOptions.paddingBottom;
	}

	public draw(
		target: CanvasRenderingTarget2D,
		rendererOptions: PriceAxisViewRendererOptions,
		textWidthCache: TextWidthCache,
		align: 'left' | 'right'
	): void {
		// 若标签不可见或无文本则无需绘制
		if (!this._data.visible || this._data.text.length === 0) {
			return;
		}

		// 文本颜色与背景色
		const textColor = this._data.color;
		const backgroundColor = this._commonData.background;

		// 在位图坐标空间绘制背景框与分隔线
		const geometry = target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
			const ctx = scope.context;
			ctx.font = rendererOptions.font;
			const geom = this._calculateGeometry(scope, rendererOptions, textWidthCache, align);
			const gb = geom.bitmap;

			/*
			 draw label. backgroundColor will always be a solid color (no alpha) [see generateContrastColors in color.ts].
			 Therefore we can draw the rounded label using simplified code (drawRoundRectWithBorder) that doesn't need to ensure the background and the border don't overlap.
			*/
			// 根据对齐方式绘制不同圆角的标签
			if (geom.alignRight) {
				drawRoundRectWithBorder(
					ctx,
					gb.xOutside,
					gb.yTop,
					gb.totalWidth,
					gb.totalHeight,
					backgroundColor,
					gb.horzBorder,
					[gb.radius, 0, 0, gb.radius],
					backgroundColor
				);
			} else {
				drawRoundRectWithBorder(
					ctx,
					gb.xInside,
					gb.yTop,
					gb.totalWidth,
					gb.totalHeight,
					backgroundColor,
					gb.horzBorder,
					[0, gb.radius, gb.radius, 0],
					backgroundColor
				);
			}
			// draw tick
			// 绘制价格轴上的小刻度
			if (this._data.tickVisible) {
				ctx.fillStyle = textColor;
				ctx.fillRect(gb.xInside, gb.yMid, gb.xTick - gb.xInside, gb.tickHeight);
			}

			// draw separator
			// 绘制与主图之间的分隔条
			if (this._data.borderVisible) {
				ctx.fillStyle = rendererOptions.paneBackgroundColor;
				ctx.fillRect(
					geom.alignRight ? gb.right - gb.horzBorder : 0,
					gb.yTop,
					gb.horzBorder,
					gb.yBottom - gb.yTop
				);
			}

			return geom;
		});

		// 在媒体坐标空间绘制文字，保证 DPI 缩放正确
		target.useMediaCoordinateSpace(({ context: ctx }: MediaCoordinatesRenderingScope) => {
			const gm = geometry.media;
			ctx.font = rendererOptions.font;
			ctx.textAlign = geometry.alignRight ? 'right' : 'left';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = textColor;
			ctx.fillText(this._data.text, gm.xText, (gm.yTop + gm.yBottom) / 2 + gm.textMidCorrection);
		});
	}

	private _calculateGeometry(
		scope: BitmapCoordinatesRenderingScope,
		rendererOptions: PriceAxisViewRendererOptions,
		textWidthCache: TextWidthCache,
		align: 'left' | 'right'
	): Geometry {
		// 解构作用域参数，获取尺寸与像素比
		const { context: ctx, bitmapSize, mediaSize, horizontalPixelRatio, verticalPixelRatio } = scope;
		// 刻度长度根据配置决定
		const tickSize = (this._data.tickVisible || !this._data.moveTextToInvisibleTick) ? rendererOptions.tickLength : 0;
		// 若需要分隔线，则绘制边框
		const horzBorder = this._data.separatorVisible ? rendererOptions.borderSize : 0;
		// 计算上下 padding（包含额外的补偿）
		const paddingTop = rendererOptions.paddingTop + this._commonData.additionalPaddingTop;
		const paddingBottom = rendererOptions.paddingBottom + this._commonData.additionalPaddingBottom;
		const paddingInner = rendererOptions.paddingInner;
		const paddingOuter = rendererOptions.paddingOuter;
		const text = this._data.text;
		const actualTextHeight = rendererOptions.fontSize;
		// yMid 修正用于更准确地居中渲染字体
		const textMidCorrection = textWidthCache.yMidCorrection(ctx, text);

		// 文本宽度取整，以像素为单位
		const textWidth = Math.ceil(textWidthCache.measureText(ctx, text));

		// 标签总高度 = 字体高度 + 上下 padding
		const totalHeight = actualTextHeight + paddingTop + paddingBottom;

		// 标签总宽度 = 边框 + 内外 padding + 文本宽度 + 刻度宽度
		const totalWidth = rendererOptions.borderSize + paddingInner + paddingOuter + textWidth + tickSize;

		// 刻度在位图空间的高度至少为 1 像素
		const tickHeightBitmap = Math.max(1, Math.floor(verticalPixelRatio));
		let totalHeightBitmap = Math.round(totalHeight * verticalPixelRatio);
		// 确保刻度和圆角高度奇偶一致，避免半像素
		if (totalHeightBitmap % 2 !== tickHeightBitmap % 2) {
			totalHeightBitmap += 1;
		}
		// 边框在位图空间的宽度
		const horzBorderBitmap = horzBorder > 0 ? Math.max(1, Math.floor(horzBorder * horizontalPixelRatio)) : 0;
		// 标签在位图空间的总宽度
		const totalWidthBitmap = Math.round(totalWidth * horizontalPixelRatio);
		// tick overlaps scale border
		// 刻度在位图空间的长度
		const tickSizeBitmap = Math.round(tickSize * horizontalPixelRatio);

		// 使用固定坐标或动态坐标确定 y 轴位置
		const yMid = this._commonData.fixedCoordinate ?? this._commonData.coordinate;
		const yMidBitmap = Math.round(yMid * verticalPixelRatio) - Math.floor(verticalPixelRatio * 0.5);
		const yTopBitmap = Math.floor(yMidBitmap + tickHeightBitmap / 2 - totalHeightBitmap / 2);
		const yBottomBitmap = yTopBitmap + totalHeightBitmap;

		// 根据对齐方向计算 x 坐标
		const alignRight = align === 'right';

		const xInside = alignRight ? mediaSize.width - horzBorder : horzBorder;
		const xInsideBitmap = alignRight ? bitmapSize.width - horzBorderBitmap : horzBorderBitmap;

		let xOutsideBitmap: number;
		let xTickBitmap: number;
		let xText: number;

		if (alignRight) {
			// 2               1
			//
			//              6  5
			//
			// 3               4
			// 右侧对齐时，外边界在内部边界左侧
			xOutsideBitmap = xInsideBitmap - totalWidthBitmap;
			xTickBitmap = xInsideBitmap - tickSizeBitmap;
			xText = xInside - tickSize - paddingInner - horzBorder;
		} else {
			// 1               2
			//
			// 6  5
			//
			// 4               3
			// 左侧对齐时，外边界在内部边界右侧
			xOutsideBitmap = xInsideBitmap + totalWidthBitmap;
			xTickBitmap = xInsideBitmap + tickSizeBitmap;
			xText = xInside + tickSize + paddingInner;
		}

		return {
			alignRight,
			bitmap: {
				yTop: yTopBitmap,
				yMid: yMidBitmap,
				yBottom: yBottomBitmap,
				totalWidth: totalWidthBitmap,
				totalHeight: totalHeightBitmap,
				// TODO: it is better to have different horizontal and vertical radii
				radius: 2 * horizontalPixelRatio,
				horzBorder: horzBorderBitmap,
				xOutside: xOutsideBitmap,
				xInside: xInsideBitmap,
				xTick: xTickBitmap,
				tickHeight: tickHeightBitmap,
				right: bitmapSize.width,
			},
			media: {
				yTop: yTopBitmap / verticalPixelRatio,
				yBottom: yBottomBitmap / verticalPixelRatio,
				xText,
				textMidCorrection,
			},
		};
	}
}
