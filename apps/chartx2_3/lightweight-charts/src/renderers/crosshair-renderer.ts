// 引入位图渲染作用域，用于访问 Canvas 上下文
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 位图坐标面板渲染器基类
import { BitmapCoordinatesPaneRenderer } from './bitmap-coordinates-pane-renderer';
// 绘制直线及相关样式的工具函数
import { drawHorizontalLine, drawVerticalLine, LineStyle, LineWidth, setLineStyle } from './draw-line';

// 十字光标的线样式配置
export interface CrosshairLineStyle {
	lineStyle: LineStyle;
	lineWidth: LineWidth;
	color: string;
	visible: boolean;
}

// 十字光标渲染所需的数据
export interface CrosshairRendererData {
	vertLine: CrosshairLineStyle;
	horzLine: CrosshairLineStyle;
	x: number;
	y: number;
}

export class CrosshairRenderer extends BitmapCoordinatesPaneRenderer {
	// 十字光标数据
	private readonly _data: CrosshairRendererData | null;

	// 构造函数，注入数据
	public constructor(data: CrosshairRendererData | null) {
		super();
		this._data = data;
	}

	// 绘制十字光标
	protected override _drawImpl({ context: ctx, bitmapSize, horizontalPixelRatio, verticalPixelRatio }: BitmapCoordinatesRenderingScope): void {
		// 无数据时无需绘制
		if (this._data === null) {
			return;
		}

		// 判断垂直线和水平线是否需要绘制
		const vertLinesVisible = this._data.vertLine.visible;
		const horzLinesVisible = this._data.horzLine.visible;

		// 两条线都隐藏则直接返回
		if (!vertLinesVisible && !horzLinesVisible) {
			return;
		}

		// 将数据坐标转换为像素坐标
		const x = Math.round(this._data.x * horizontalPixelRatio);
		const y = Math.round(this._data.y * verticalPixelRatio);

		// 光标线两端采用平直收尾
		ctx.lineCap = 'butt';

		// 绘制垂直光标线
		if (vertLinesVisible && x >= 0) {
			// 根据像素比缩放线宽
			ctx.lineWidth = Math.floor(this._data.vertLine.lineWidth * horizontalPixelRatio);
			// 设置描边和填充颜色
			ctx.strokeStyle = this._data.vertLine.color;
			ctx.fillStyle = this._data.vertLine.color;
			// 应用线型（实线/虚线）
			setLineStyle(ctx, this._data.vertLine.lineStyle);
			// 实际绘制垂直线段
			drawVerticalLine(ctx, x, 0, bitmapSize.height);
		}

		// 绘制水平光标线
		if (horzLinesVisible && y >= 0) {
			// 根据像素比缩放线宽
			ctx.lineWidth = Math.floor(this._data.horzLine.lineWidth * verticalPixelRatio);
			// 设置描边和填充颜色
			ctx.strokeStyle = this._data.horzLine.color;
			ctx.fillStyle = this._data.horzLine.color;
			// 应用线型
			setLineStyle(ctx, this._data.horzLine.lineStyle);
			// 实际绘制水平线段
			drawHorizontalLine(ctx, y, 0, bitmapSize.width);
		}
	}
}
