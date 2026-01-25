// 引入 Canvas 渲染目标类型
import { CanvasRenderingTarget2D } from 'fancy-canvas';

// 面板渲染器接口
import { IPaneRenderer } from './ipane-renderer';

export class CompositeRenderer implements IPaneRenderer {
	// 内部保存的渲染器列表
	private _renderers: readonly IPaneRenderer[] = [];

	// 写入需要组合的渲染器
	public setRenderers(renderers: readonly IPaneRenderer[]): void {
		this._renderers = renderers;
	}

	// 遍历所有子渲染器并执行绘制
	public draw(target: CanvasRenderingTarget2D, isHovered: boolean, hitTestData?: unknown): void {
		this._renderers.forEach((r: IPaneRenderer) => {
			r.draw(target, isHovered, hitTestData);
		});
	}
}
