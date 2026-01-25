import { CanvasRenderingTarget2D } from 'fancy-canvas';

import { IPaneRenderer } from '../renderers/ipane-renderer';
import { IPaneView } from '../views/pane/ipane-view';

import { Coordinate } from './coordinate';
import {
    IPanePrimitiveBase,
    IPrimitivePaneRenderer,
    IPrimitivePaneView,
    PrimitiveHoveredItem,
    PrimitivePaneViewZOrder,
} from './ipane-primitive';
import {
	ISeriesPrimitiveBase,
} from './iseries-primitive';

/**
 * 适配器：将 Primitive 的 renderer 包装为标准 `IPaneRenderer`。
 */
class PrimitiveRendererWrapper implements IPaneRenderer {
	private readonly _baseRenderer: IPrimitivePaneRenderer;

	public constructor(baseRenderer: IPrimitivePaneRenderer) {
		this._baseRenderer = baseRenderer;
	}

	/**
	 * Primitive 渲染器不关心 hover 状态与命中数据，这里简单转调。
	 */
	public draw(target: CanvasRenderingTarget2D, isHovered: boolean, hitTestData?: unknown): void {
		this._baseRenderer.draw(target);
	}

	public drawBackground?(target: CanvasRenderingTarget2D, isHovered: boolean, hitTestData?: unknown): void {
		this._baseRenderer.drawBackground?.(target);
	}
}

interface RendererCache<Base, Wrapper> {
	base: Base;
	wrapper: Wrapper;
}

export interface ISeriesPrimitivePaneViewWrapper extends IPaneView {
	zOrder(): PrimitivePaneViewZOrder;
}

/**
 * 将 Primitive 自定义视图包装为框架通用的 `IPaneView`。
 * 同时缓存 renderer，减少重复实例化。
 */
class PrimitivePaneViewWrapper implements IPaneView {
	private readonly _paneView: IPrimitivePaneView;
	private _cache: RendererCache<IPrimitivePaneRenderer, PrimitiveRendererWrapper> | null = null;

	public constructor(paneView: IPrimitivePaneView) {
		this._paneView = paneView;
	}

	/**
	 * 获取与缓存 Primitive renderer 的包装器。
	 */
	public renderer(): IPaneRenderer | null {
		const baseRenderer = this._paneView.renderer();
		if (baseRenderer === null) {
			return null;
		}
		if (this._cache?.base === baseRenderer) {
			return this._cache.wrapper;
		}
		const wrapper = new PrimitiveRendererWrapper(baseRenderer);
		this._cache = {
			base: baseRenderer,
			wrapper,
		};
		return wrapper;
	}

	public zOrder(): PrimitivePaneViewZOrder {
		return this._paneView.zOrder?.() ?? 'normal';
	}
}

/**
 * Primitive 包装器基类，对外暴露统一的 paneViews、hitTest 等接口。
 */
export abstract class PrimitiveWrapper<T extends ISeriesPrimitiveBase<TAttachedParameters> | IPanePrimitiveBase<TAttachedParameters>, TAttachedParameters = unknown> {
	protected readonly _primitive: T;
	private _paneViewsCache: RendererCache<readonly IPrimitivePaneView[], readonly PrimitivePaneViewWrapper[]> | null = null;

	public constructor(primitive: T) {
		this._primitive = primitive;
	}

	public primitive(): T {
		return this._primitive;
	}

	/**
	 * 通知 Primitive 刷新其所有视图（若实现）。
	 */
	public updateAllViews(): void {
		this._primitive.updateAllViews?.();
	}

	/**
	 * 返回包装后的 pane 视图列表，并维持缓存以避免重复创建。
	 */
	public paneViews(): readonly ISeriesPrimitivePaneViewWrapper[] | readonly PrimitivePaneViewWrapper[] {
		const base = this._primitive.paneViews?.() ?? [];
		if (this._paneViewsCache?.base === base) {
			return this._paneViewsCache.wrapper;
		}
		const wrapper = base.map((pw: IPrimitivePaneView) => new PrimitivePaneViewWrapper(pw));
		this._paneViewsCache = {
			base,
			wrapper,
		};
		return wrapper;
	}

	public hitTest(x: Coordinate, y: Coordinate): PrimitiveHoveredItem | null {
		return this._primitive.hitTest?.(x, y) ?? null;
	}
}

export class PanePrimitiveWrapper extends PrimitiveWrapper<IPanePrimitiveBase<unknown>> {
	/**
	 * Pane 级 Primitive 默认不参与标签绘制，返回空数组。
	 */
	public labelPaneViews(): readonly IPaneView[] {
		return [];
	}
}
