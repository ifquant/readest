// 引入位图渲染作用域，便于获取 Canvas 上下文与像素比
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 断言工具，确保值存在
import { ensureNotNull } from '../helpers/assertions';

// 价格轴标记数据结构
import { PriceMark } from '../model/price-scale';

// 位图坐标面板渲染器基类
import { BitmapCoordinatesPaneRenderer } from './bitmap-coordinates-pane-renderer';
// 网格线使用的线段工具和样式函数
import { LineStyle, setLineStyle, strokeInPixel } from './draw-line';

// 表示单个网格标记位置
export interface GridMarks {
	coord: number;
}
// 网格渲染配置与数据
export interface GridRendererData {
	vertLinesVisible: boolean;
	vertLinesColor: string;
	vertLineStyle: LineStyle;
	timeMarks: GridMarks[];

	horzLinesVisible: boolean;
	horzLinesColor: string;
	horzLineStyle: LineStyle;
	priceMarks: PriceMark[];
}

export class GridRenderer extends BitmapCoordinatesPaneRenderer {
	// 保存当前网格数据
	private _data: GridRendererData | null = null;

	// 更新网格数据
	public setData(data: GridRendererData | null): void {
		this._data = data;
	}

	// 绘制网格线
	protected override _drawImpl({ context: ctx, bitmapSize, horizontalPixelRatio, verticalPixelRatio }: BitmapCoordinatesRenderingScope): void {
		// 没有数据时不绘制
		if (this._data === null) {
			return;
		}

		// 线宽至少为 1，并按像素比缩放
		const lineWidth = Math.max(1, Math.floor(horizontalPixelRatio));
		ctx.lineWidth = lineWidth;

		// strokeInPixel 可以在奇数像素时避免模糊
		strokeInPixel(ctx, () => {
			const data = ensureNotNull(this._data);
			// 绘制垂直网格线
			if (data.vertLinesVisible) {
				ctx.strokeStyle = data.vertLinesColor;
				setLineStyle(ctx, data.vertLineStyle);
				ctx.beginPath();
				for (const timeMark of data.timeMarks) {
					const x = Math.round(timeMark.coord * horizontalPixelRatio);
					ctx.moveTo(x, -lineWidth);
					ctx.lineTo(x, bitmapSize.height + lineWidth);
				}
				ctx.stroke();
			}
			// 绘制水平网格线
			if (data.horzLinesVisible) {
				ctx.strokeStyle = data.horzLinesColor;
				setLineStyle(ctx, data.horzLineStyle);
				ctx.beginPath();
				for (const priceMark of data.priceMarks) {
					const y = Math.round(priceMark.coord * verticalPixelRatio);
					ctx.moveTo(-lineWidth, y);
					ctx.lineTo(bitmapSize.width + lineWidth, y);
				}
				ctx.stroke();
			}
		});
	}
}
