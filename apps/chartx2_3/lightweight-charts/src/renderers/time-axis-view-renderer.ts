// 引入位图与媒体坐标渲染作用域和 Canvas 渲染目标
import { BitmapCoordinatesRenderingScope, CanvasRenderingTarget2D, MediaCoordinatesRenderingScope } from 'fancy-canvas';

// 断言工具，确保数据存在
import { ensureNotNull } from '../helpers/assertions';

// 时间轴渲染器接口和配置
import { ITimeAxisViewRenderer, TimeAxisViewRendererOptions } from './itime-axis-view-renderer';

// 时间轴标签的输入数据
export interface TimeAxisViewRendererData {
	width: number;
	text: string;
	coordinate: number;
	color: string;
	background: string;
	visible: boolean;
	tickVisible: boolean;
}

const optimizationReplacementRe = /[1-9]/g;

const radius = 2;

export class TimeAxisViewRenderer implements ITimeAxisViewRenderer {
	// 当前渲染数据
	private _data: TimeAxisViewRendererData | null;

	// 初始化为空数据
	public constructor() {
		this._data = null;
	}

	// 写入时间轴标记数据
	public setData(data: TimeAxisViewRendererData): void {
		this._data = data;
	}

	public draw(target: CanvasRenderingTarget2D, rendererOptions: TimeAxisViewRendererOptions): void {
		// 无数据或不可见时不绘制
		if (this._data === null || this._data.visible === false || this._data.text.length === 0) {
			return;
		}

		// 在媒体坐标空间测量文本宽度
		const textWidth = target.useMediaCoordinateSpace(({ context: ctx }: MediaCoordinatesRenderingScope) => {
			ctx.font = rendererOptions.font;
			return Math.round(rendererOptions.widthCache.measureText(ctx, ensureNotNull(this._data).text, optimizationReplacementRe));
		});
		if (textWidth <= 0) {
			return;
		}

		// 标签总宽度与位置
		const horzMargin = rendererOptions.paddingHorizontal;
		const labelWidth = textWidth + 2 * horzMargin;
		const labelWidthHalf = labelWidth / 2;
		const timeScaleWidth = this._data.width;
		let coordinate = this._data.coordinate;
		let x1 = Math.floor(coordinate - labelWidthHalf) + 0.5;

		// 防止标签超出左边界
		if (x1 < 0) {
			coordinate = coordinate + Math.abs(0 - x1);
			x1 = Math.floor(coordinate - labelWidthHalf) + 0.5;
		} else if (x1 + labelWidth > timeScaleWidth) {
			// 防止超出右边界
			coordinate = coordinate - Math.abs(timeScaleWidth - (x1 + labelWidth));
			x1 = Math.floor(coordinate - labelWidthHalf) + 0.5;
		}

		const x2 = x1 + labelWidth;

		const y1 = 0;
		const y2 = Math.ceil(
			y1 +
			rendererOptions.borderSize +
			rendererOptions.tickLength +
			rendererOptions.paddingTop +
			rendererOptions.fontSize +
			rendererOptions.paddingBottom
		);

		// 在位图坐标空间绘制背景与刻度线
		target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio, verticalPixelRatio }: BitmapCoordinatesRenderingScope) => {
			const data = ensureNotNull(this._data);

			ctx.fillStyle = data.background;

			const x1scaled = Math.round(x1 * horizontalPixelRatio);
			const y1scaled = Math.round(y1 * verticalPixelRatio);
			const x2scaled = Math.round(x2 * horizontalPixelRatio);
			const y2scaled = Math.round(y2 * verticalPixelRatio);
			const radiusScaled = Math.round(radius * horizontalPixelRatio);
			ctx.beginPath();
			ctx.moveTo(x1scaled, y1scaled);
			ctx.lineTo(x1scaled, y2scaled - radiusScaled);
			ctx.arcTo(x1scaled, y2scaled, x1scaled + radiusScaled, y2scaled, radiusScaled);
			ctx.lineTo(x2scaled - radiusScaled, y2scaled);
			ctx.arcTo(x2scaled, y2scaled, x2scaled, y2scaled - radiusScaled, radiusScaled);
			ctx.lineTo(x2scaled, y1scaled);
			ctx.fill();

			// 根据配置绘制刻度
			if (data.tickVisible) {
				const tickX = Math.round(data.coordinate * horizontalPixelRatio);
				const tickTop = y1scaled;
				const tickBottom = Math.round((tickTop + rendererOptions.tickLength) * verticalPixelRatio);

				ctx.fillStyle = data.color;
				const tickWidth = Math.max(1, Math.floor(horizontalPixelRatio));
				const tickOffset = Math.floor(horizontalPixelRatio * 0.5);
				ctx.fillRect(tickX - tickOffset, tickTop, tickWidth, tickBottom - tickTop);
			}
		});

		// 在媒体坐标空间绘制文本
		target.useMediaCoordinateSpace(({ context: ctx }: MediaCoordinatesRenderingScope) => {
			const data = ensureNotNull(this._data);

			const yText =
				y1 +
				rendererOptions.borderSize +
				rendererOptions.tickLength +
				rendererOptions.paddingTop +
				rendererOptions.fontSize / 2;

			ctx.font = rendererOptions.font;
			ctx.textAlign = 'left';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = data.color;

			// 预估中线校正，避免字体下沉
			const textYCorrection = rendererOptions.widthCache.yMidCorrection(ctx, 'Apr0');

			ctx.translate(x1 + horzMargin, yText + textYCorrection);
			ctx.fillText(data.text, 0, 0);
		});
	}
}
