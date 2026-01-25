import { CanvasRenderingTarget2D } from 'fancy-canvas';

/**
 * 用于在 canvas 上绘制自定义元素的渲染器接口。
 */
export interface IPrimitivePaneRenderer {
	/**
	 * 绘制主体内容。
	 */
	draw(target: CanvasRenderingTarget2D): void;

	/**
	 * 可选的背景绘制钩子，例如水印或时间区间高亮。
	 */
	drawBackground?(target: CanvasRenderingTarget2D): void;
}

/**
 * 指定渲染所在的视觉层级：
 * - `bottom`：除背景外的最底层
 * - `normal`：与常规序列同层
 * - `top`：最顶层（高于十字光标）
 */
export type PrimitivePaneViewZOrder = 'bottom' | 'normal' | 'top';

/**
 * 自定义 Primitive 视图接口，可覆盖主图/时间轴/价格轴。
 */
export interface IPrimitivePaneView {
	/** 返回希望绘制的层级，默认为 `normal`。 */
	zOrder?(): PrimitivePaneViewZOrder;
	/** 返回渲染器实例，当无内容可绘制时返回 `null`。 */
	renderer(): IPrimitivePaneRenderer | null;
}

/**
 * Pane 级别 Primitive 的渲染器接口（语义同 `IPrimitivePaneRenderer`）。
 */
export interface IPanePrimitivePaneRenderer extends IPrimitivePaneRenderer {}

/**
 * Pane 级别 Primitive 视图接口（与 `IPrimitivePaneView` 相同语义）。
 */
export interface IPanePrimitivePaneView {
	/** 返回希望绘制的层级，默认为 `normal`。 */
	zOrder?(): PrimitivePaneViewZOrder;
	/** 返回渲染器实例，当无内容可绘制时返回 `null`。 */
	renderer(): IPrimitivePaneRenderer | null;
}

/**
 * 命中测试的结果数据，用于描述当前 hover 的 Primitive。
 */
export interface PrimitiveHoveredItem {
	/** 自定义光标样式（若返回 `undefined` 则沿用默认）。 */
	cursorStyle?: string;
	/** 外部自定义的对象 ID，用于事件识别。 */
	externalId: string;
	/** 当前项目所属的层级。 */
	zOrder: PrimitivePaneViewZOrder;
	/** 若使用 `drawBackground` 绘制则为 true。 */
	isBackground?: boolean;
}

/**
 * Pane Primitive 基类接口，可挂载在图表主区域或轴面板。
 */
export interface IPanePrimitiveBase<TPaneAttachedParameters = unknown> {
	/** 视口变更时被调用，用于重新计算或失效缓存。 */
	updateAllViews?(): void;

	/**
	 * 返回绘制在主图区域的视图列表。
	 * 为了配合内部缓存，如果集合无变化应尽量返回同一数组实例。
	 */
	paneViews?(): readonly IPanePrimitivePaneView[];

	/**
	 * 生命周期：挂载时回调，可接收上下文参数。
	 */
	attached?(param: TPaneAttachedParameters): void;
	/** 生命周期：卸载时回调。 */
	detached?(): void;

	/**
	 * 命中测试，返回当前 hover 的对象及自定义光标。
	 */
	hitTest?(x: number, y: number): PrimitiveHoveredItem | null;
}
