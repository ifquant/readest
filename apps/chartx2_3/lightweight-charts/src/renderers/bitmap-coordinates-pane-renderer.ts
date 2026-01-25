// 引入位图坐标渲染作用域和二维渲染目标
import { BitmapCoordinatesRenderingScope, CanvasRenderingTarget2D } from 'fancy-canvas';

// 面板渲染器接口定义
import { IPaneRenderer } from './ipane-renderer';

export abstract class BitmapCoordinatesPaneRenderer implements IPaneRenderer {
	// 主绘制入口，使用位图坐标空间执行绘制实现
	public draw(target: CanvasRenderingTarget2D, isHovered: boolean, hitTestData?: unknown): void {
		target.useBitmapCoordinateSpace(
			(scope: BitmapCoordinatesRenderingScope) => this._drawImpl(scope, isHovered, hitTestData)
		);
	}

	// public drawBackground(target: CanvasRenderingTarget2D, isHovered: boolean, hitTestData?: unknown): void {
	// 	target.useBitmapCoordinateSpace(
	// 		(scope: BitmapCoordinatesRenderingScope) => this._drawBackgroundImpl(scope, isHovered, hitTestData)
	// 	);
	// }

	// 子类实现实际的绘制逻辑
	protected abstract _drawImpl(renderingScope: BitmapCoordinatesRenderingScope, isHovered: boolean, hitTestData?: unknown): void;

	// protected _drawBackgroundImpl(renderingScope: BitmapCoordsRenderingScope, isHovered: boolean, hitTestData?: unknown): void {}
}
