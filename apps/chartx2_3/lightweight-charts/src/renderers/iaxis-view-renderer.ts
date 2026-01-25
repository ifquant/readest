// 引入 Canvas 渲染目标类型
import { CanvasRenderingTarget2D } from 'fancy-canvas';

// 轴渲染器接口，定义正向与背景绘制方法
export interface IAxisRenderer {
	draw(target: CanvasRenderingTarget2D, isHovered: boolean, hitTestData?: unknown): void;
	drawBackground?(target: CanvasRenderingTarget2D, isHovered: boolean, hitTestData?: unknown): void;
}
