// 引入位图渲染作用域，提供 Canvas 上下文与像素比
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 可见索引范围类型
import { SeriesItemsIndexesRange } from '../model/time-data';

// 位图坐标面板渲染器基类
import { BitmapCoordinatesPaneRenderer } from './bitmap-coordinates-pane-renderer';
// 折线条目结构，用作标记点输入
import { LineItemBase } from './line-renderer-base';

// 标记渲染器的数据结构
export interface MarksRendererData {
	items: LineItemBase[];
	lineColor: string;
	lineWidth: number;
	backColor: string;
	radius: number;
	visibleRange: SeriesItemsIndexesRange | null;
}

export class PaneRendererMarks extends BitmapCoordinatesPaneRenderer {
	// 当前标记数据
	protected _data: MarksRendererData | null = null;

	// 设置数据
	public setData(data: MarksRendererData): void {
		this._data = data;
	}

	protected _drawImpl({ context: ctx, horizontalPixelRatio, verticalPixelRatio }: BitmapCoordinatesRenderingScope): void {
		// 无数据或不可见时不绘制
		if (this._data === null || this._data.visibleRange === null) {
			return;
		}

		const visibleRange = this._data.visibleRange;
		const data = this._data;

		// 计算线宽与半像素矫正值
		const tickWidth = Math.max(1, Math.floor(horizontalPixelRatio));
		const correction = (tickWidth % 2) / 2;

		// 内部函数，按给定半径绘制所有标记
		const draw = (radiusMedia: number) => {
			ctx.beginPath();

			for (let i = visibleRange.to - 1; i >= visibleRange.from; --i) {
				const point = data.items[i];
				const centerX = Math.round(point.x * horizontalPixelRatio) + correction; // correct x coordinate only
				const centerY = point.y * verticalPixelRatio;
				const radius = radiusMedia * verticalPixelRatio + correction;
				ctx.moveTo(centerX, centerY);
				ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
			}

			ctx.fill();
		};

		// 若设置描边宽度，先绘制背景圆
		if (data.lineWidth > 0) {
			ctx.fillStyle = data.backColor;
			draw(data.radius + data.lineWidth);
		}

		// 再绘制内层标记
		ctx.fillStyle = data.lineColor;
		draw(data.radius);
	}
}
