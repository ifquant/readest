import { CanvasRenderingTarget2D } from 'fancy-canvas';

import { IDataSource, IDataSourcePaneViews } from '../model/idata-source';
import { Pane } from '../model/pane';
import { IPaneRenderer } from '../renderers/ipane-renderer';
import { IAxisView } from '../views/pane/iaxis-view';
import { IPaneView } from '../views/pane/ipane-view';

import { IAxisViewsGetter } from './iaxis-view-getters';
import { IPaneViewsGetter } from './ipane-view-getter';

// draw-functions 统一封装了 pane/axis 视图的渲染流程，方便在不同 widget 内复用

export type DrawFunction = (
	renderer: IPaneRenderer,
	target: CanvasRenderingTarget2D,
	isHovered: boolean,
	hitTestData?: unknown
) => void;

export function drawBackground(
	renderer: IPaneRenderer,
	target: CanvasRenderingTarget2D,
	isHovered: boolean,
	hitTestData?: unknown
): void {
	// 如果 renderer 实现了背景绘制接口，则在主渲染前先画背景
	if (renderer.drawBackground) {
		renderer.drawBackground(target, isHovered, hitTestData);
	}
}

export function drawForeground(
	renderer: IPaneRenderer,
	target: CanvasRenderingTarget2D,
	isHovered: boolean,
	hitTestData?: unknown
): void {
	// 前景绘制直接调用 renderer.draw
	renderer.draw(target, isHovered, hitTestData);
}

type DrawRendererFn = (renderer: IPaneRenderer) => void;

export type ViewsGetter<T> = T extends IDataSource
	? IAxisViewsGetter
	: IPaneViewsGetter;

export function drawSourceViews<T extends IDataSource | IDataSourcePaneViews>(
	paneViewsGetter: ViewsGetter<T>,
	drawRendererFn: DrawRendererFn,
	source: T,
	pane: Pane
): void {
	// 先通过 getter 收集当前数据源在 pane 上的所有视图
	const views = (
		paneViewsGetter as (s: T, p: Pane) => readonly (IAxisView | IPaneView)[]
	)(source, pane);
	for (const view of views) {
		// 每个视图提供 renderer，再交给 drawRendererFn 控制绘制层级
		const renderer = view.renderer(pane);
		if (renderer !== null) {
			drawRendererFn(renderer);
		}
	}
}
