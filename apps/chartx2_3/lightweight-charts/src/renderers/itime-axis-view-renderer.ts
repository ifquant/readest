// 引入 Canvas 渲染目标类型
import { CanvasRenderingTarget2D } from 'fancy-canvas';

// 文本宽度缓存，避免重复测量
import { TextWidthCache } from '../model/text-width-cache';

// 时间轴渲染所需的样式与尺寸配置
export interface TimeAxisViewRendererOptions {
	baselineOffset: number;
	borderSize: number;
	font: string;
	fontSize: number;
	paddingBottom: number;
	paddingTop: number;
	tickLength: number;
	paddingHorizontal: number;
	widthCache: TextWidthCache;
	labelBottomOffset: number;
}

// 时间轴渲染器接口
export interface ITimeAxisViewRenderer {
	draw(target: CanvasRenderingTarget2D, rendererOptions: TimeAxisViewRendererOptions): void;
}
