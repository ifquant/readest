// 引入位图渲染作用域，提供 Canvas 上下文与像素缩放
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 价格数据类型
import { PricedValue } from '../model/price-scale';
// 序列时间范围和时间戳类型
import { SeriesItemsIndexesRange, TimedValue } from '../model/time-data';

// 位图坐标面板渲染器基类
import { BitmapCoordinatesPaneRenderer } from './bitmap-coordinates-pane-renderer';
// 折线绘制所需的数据结构与工具函数
import { LinePoint, LineStyle, LineType, LineWidth, setLineStyle } from './draw-line';
// 绘制折线上的点标记
import { drawSeriesPointMarkers } from './draw-series-point-markers';
// 遍历折线并处理样式切换
import { walkLine } from './walk-line';

// 折线条目的基础结构，包含价格、时间和坐标
export type LineItemBase = TimedValue & PricedValue & LinePoint;

// 折线渲染器的数据定义
export interface PaneRendererLineDataBase<TItem extends LineItemBase = LineItemBase> {
	lineType?: LineType;

	items: TItem[];

	barWidth: number;

	lineWidth: LineWidth;
	lineStyle: LineStyle;

	visibleRange: SeriesItemsIndexesRange | null;

	pointMarkersRadius?: number;
}

// 样式完成后提交描边
function finishStyledArea(scope: BitmapCoordinatesRenderingScope, style: CanvasRenderingContext2D['strokeStyle']): void {
	const ctx = scope.context;
	ctx.strokeStyle = style;
	ctx.stroke();
}

export abstract class PaneRendererLineBase<TData extends PaneRendererLineDataBase> extends BitmapCoordinatesPaneRenderer {
	// 当前折线数据
	protected _data: TData | null = null;

	// 写入折线数据
	public setData(data: TData): void {
		this._data = data;
	}

	// 实际绘制逻辑
	protected _drawImpl(renderingScope: BitmapCoordinatesRenderingScope): void {
		// 无数据时不绘制
		if (this._data === null) {
			return;
		}

		// 解构绘制所需字段
		const { items, visibleRange, barWidth, lineType, lineWidth, lineStyle, pointMarkersRadius } = this._data;

		// 无可见范围则不绘制
		if (visibleRange === null) {
			return;
		}

		// 获取 Canvas 上下文
		const ctx = renderingScope.context;

		// 线段端点使用平直收尾
		ctx.lineCap = 'butt';
		// 根据像素比缩放线宽
		ctx.lineWidth = lineWidth * renderingScope.verticalPixelRatio;

		// 应用线型配置
		setLineStyle(ctx, lineStyle);

		// 设置线段连接处为圆角
		ctx.lineJoin = 'round';

		// 获取样式函数
		const styleGetter = this._strokeStyle.bind(this);

		// 绘制折线
		if (lineType !== undefined) {
			walkLine(renderingScope, items, lineType, visibleRange, barWidth, styleGetter, finishStyledArea);
		}

		// 根据需要绘制点标记
		if (pointMarkersRadius) {
			drawSeriesPointMarkers(renderingScope, items, pointMarkersRadius, visibleRange, styleGetter);
		}
	}

	protected abstract _strokeStyle(renderingScope: BitmapCoordinatesRenderingScope, item: TData['items'][0]): CanvasRenderingContext2D['strokeStyle'];
}
