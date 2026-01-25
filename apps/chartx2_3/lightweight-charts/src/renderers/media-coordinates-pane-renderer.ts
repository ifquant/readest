// 引入媒体坐标渲染作用域与 Canvas 渲染目标
import { CanvasRenderingTarget2D, MediaCoordinatesRenderingScope } from 'fancy-canvas';

// 面板渲染器接口
import { IPaneRenderer } from './ipane-renderer';

export abstract class MediaCoordinatesPaneRenderer implements IPaneRenderer {
	// 在媒体坐标空间中绘制主图层
	public draw(target: CanvasRenderingTarget2D, isHovered: boolean, hitTestData?: unknown): void {
		target.useMediaCoordinateSpace(
			(scope: MediaCoordinatesRenderingScope) => this._drawImpl(scope, isHovered, hitTestData)
		);
	}

	// 在媒体坐标空间中绘制背景图层
	public drawBackground(target: CanvasRenderingTarget2D, isHovered: boolean, hitTestData?: unknown): void {
		target.useMediaCoordinateSpace(
			(scope: MediaCoordinatesRenderingScope) => this._drawBackgroundImpl(scope, isHovered, hitTestData)
		);
	}

	// 子类实现具体的绘制逻辑
	protected abstract _drawImpl(renderingScope: MediaCoordinatesRenderingScope, isHovered: boolean, hitTestData?: unknown): void;

	// 子类可根据需要覆写背景绘制，默认不做任何处理
	protected _drawBackgroundImpl(renderingScope: MediaCoordinatesRenderingScope, isHovered: boolean, hitTestData?: unknown): void {}
}
