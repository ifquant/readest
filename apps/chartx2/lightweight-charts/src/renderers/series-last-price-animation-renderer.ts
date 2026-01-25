// 引入位图渲染作用域，提供 Canvas 上下文和像素比
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 点坐标类型
import { Point } from '../model/point';

// 位图坐标面板渲染器基类
import { BitmapCoordinatesPaneRenderer } from './bitmap-coordinates-pane-renderer';

// 最新价格动画圆形的数据结构
export interface LastPriceCircleRendererData {
	radius: number;
	fillColor: string;
	strokeColor: string;
	seriesLineColor: string;
	seriesLineWidth: number;
	center: Point;
}

export class SeriesLastPriceAnimationRenderer extends BitmapCoordinatesPaneRenderer {
	// 缓存当前绘制的数据
	private _data: LastPriceCircleRendererData | null = null;

	// 写入或清空数据
	public setData(data: LastPriceCircleRendererData | null): void {
		this._data = data;
	}

	// 获取当前数据
	public data(): LastPriceCircleRendererData | null {
		return this._data;
	}

	protected override _drawImpl({ context: ctx, horizontalPixelRatio, verticalPixelRatio }: BitmapCoordinatesRenderingScope): void {
		const data = this._data;
		if (data === null) {
			return;
		}

		// 线宽根据像素比向上取整，至少为 1
		const tickWidth = Math.max(1, Math.floor(horizontalPixelRatio));

		// 奇数线宽需要半像素矫正
		const correction = (tickWidth % 2) / 2;
		// 计算动画中心点的像素坐标
		const centerX = Math.round(data.center.x * horizontalPixelRatio) + correction; // correct x coordinate only
		const centerY = data.center.y * verticalPixelRatio;

		// 绘制中心实心点，与系列线颜色一致
		ctx.fillStyle = data.seriesLineColor;
		ctx.beginPath();
		// TODO: it is better to have different horizontal and vertical radii
		const centerPointRadius = Math.max(2, data.seriesLineWidth * 1.5) * horizontalPixelRatio;
		ctx.arc(centerX, centerY, centerPointRadius, 0, 2 * Math.PI, false);
		ctx.fill();

		// 绘制填充圆，表现动画主体
		ctx.fillStyle = data.fillColor;
		ctx.beginPath();
		ctx.arc(centerX, centerY, data.radius * horizontalPixelRatio, 0, 2 * Math.PI, false);
		ctx.fill();

		// 绘制外圈边框
		ctx.lineWidth = tickWidth;
		ctx.strokeStyle = data.strokeColor;
		ctx.beginPath();
		ctx.arc(centerX, centerY, data.radius * horizontalPixelRatio + tickWidth / 2, 0, 2 * Math.PI, false);
		ctx.stroke();
	}
}
