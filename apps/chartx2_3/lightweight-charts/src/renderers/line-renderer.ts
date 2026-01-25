// 引入媒体坐标渲染作用域，提供 Canvas 上下文
import { MediaCoordinatesRenderingScope } from 'fancy-canvas';

// 折线描边颜色样式
import { LineStrokeColorerStyle } from '../model/series-bar-colorer';

// 折线渲染基类以及数据结构
import { LineItemBase, PaneRendererLineBase, PaneRendererLineDataBase } from './line-renderer-base';

// 线条描边数据项
export type LineStrokeItem = LineItemBase & LineStrokeColorerStyle;
export interface PaneRendererLineData extends PaneRendererLineDataBase<LineStrokeItem> {
}

export class PaneRendererLine extends PaneRendererLineBase<PaneRendererLineData> {
	// 返回当前数据项的描边颜色
	protected override _strokeStyle(renderingScope: MediaCoordinatesRenderingScope, item: LineStrokeItem): CanvasRenderingContext2D['strokeStyle'] {
		return item.lineColor;
	}
}
