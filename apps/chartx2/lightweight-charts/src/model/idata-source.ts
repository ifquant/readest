import { IAxisView } from '../views/pane/iaxis-view';
import { IPaneView } from '../views/pane/ipane-view';
import { IPriceAxisView } from '../views/price-axis/iprice-axis-view';
import { ITimeAxisView } from '../views/time-axis/itime-axis-view';

import { Coordinate } from './coordinate';
import { PrimitiveHoveredItem, PrimitivePaneViewZOrder } from './ipane-primitive';
import { Pane } from './pane';
import { PriceScale } from './price-scale';

/**
 * 支持命中测试的绘制源，返回与坐标相交的 Primitive。
 */
export interface IPrimitiveHitTestSource {
	primitiveHitTest?(x: Coordinate, y: Coordinate): PrimitiveHoveredItem[];
}

/**
 * 具有 z-order 概念的对象。
 */
export interface ZOrdered {
	zorder(): number;
}
/**
 * 约定前缀含义：
 * - bottom：绘制在底层（背景之上、网格之下）的 pane 视图
 * - top：绘制在最顶层（十字光标之上）的 pane 视图
 */
interface IPluginPaneViews extends IPrimitiveHitTestSource {
	bottomPaneViews?(pane: Pane): readonly IPaneView[];
	pricePaneViews?(zOrder: PrimitivePaneViewZOrder): readonly IAxisView[];
	timePaneViews?(zOrder: PrimitivePaneViewZOrder): readonly IAxisView[];
}

export interface IDataSourcePaneViews extends IPluginPaneViews {
	paneViews(pane: Pane): readonly IPaneView[];
	labelPaneViews(pane?: Pane): readonly IPaneView[];

	/** 绘制在最顶层的 pane 视图。 */
	topPaneViews?(pane: Pane): readonly IPaneView[];
}

export type DataSourcePaneViewGetterNames = keyof IDataSourcePaneViews;

/**
 * 图表数据源统一接口，封装与 pane/轴视图、缩放绑定及生命周期相关的行为。
 */
export interface IDataSource extends IDataSourcePaneViews, ZOrdered {
	setZorder(value: number): void;
	priceScale(): PriceScale | null;
	setPriceScale(scale: PriceScale | null): void;

	updateAllViews(): void;

	priceAxisViews(pane?: Pane, priceScale?: PriceScale): readonly IPriceAxisView[];
	paneViews(pane: Pane): readonly IPaneView[];
	labelPaneViews(pane?: Pane): readonly IPaneView[];

	/** 绘制在最顶层的 pane 视图。 */
	topPaneViews?(pane: Pane): readonly IPaneView[];
	timeAxisViews(): readonly ITimeAxisView[];

	visible(): boolean;

	destroy?(): void;
}
