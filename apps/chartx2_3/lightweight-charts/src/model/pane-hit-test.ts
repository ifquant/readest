import { IPaneView } from '../views/pane/ipane-view';

import { HoveredObject } from './chart-model';
import { Coordinate } from './coordinate';
import { IDataSource, IPrimitiveHitTestSource } from './idata-source';
import { PrimitiveHoveredItem, PrimitivePaneViewZOrder } from './ipane-primitive';
import { Pane } from './pane';

/**
 * 命中测试结果，描述命中对象所属的数据源、视图与鼠标指针样式。
 */
export interface HitTestResult {
	source: IPrimitiveHitTestSource;
	object?: HoveredObject;
	view?: IPaneView;
	cursorStyle?: string;
}

/**
 * 面板视图命中测试的中间结果。
 */
export interface HitTestPaneViewResult {
	view: IPaneView;
	object?: HoveredObject;
}

interface BestPrimitiveHit {
	hit: PrimitiveHoveredItem;
	source: IPrimitiveHitTestSource;
}

// 若 item 的层级在 reference 之上，则返回 true。
function comparePrimitiveZOrder(
	item: PrimitivePaneViewZOrder,
	reference?: PrimitivePaneViewZOrder
): boolean {
	return (
		!reference ||
		(item === 'top' && reference !== 'top') ||
		(item === 'normal' && reference === 'bottom')
	);
}

/**
 * 遍历所有 Primitive 数据源，挑选层级最高的命中结果。
 */
function findBestPrimitiveHitTest(
	sources: readonly IPrimitiveHitTestSource[],
	x: Coordinate,
	y: Coordinate
): BestPrimitiveHit | null {
	let bestPrimitiveHit: PrimitiveHoveredItem | undefined;
	let bestHitSource: IPrimitiveHitTestSource | undefined;
	for (const source of sources) {
		const primitiveHitResults = source.primitiveHitTest?.(x, y) ?? [];
		for (const hitResult of primitiveHitResults) {
			if (comparePrimitiveZOrder(hitResult.zOrder, bestPrimitiveHit?.zOrder)) {
				bestPrimitiveHit = hitResult;
				bestHitSource = source;
			}
		}
	}
	if (!bestPrimitiveHit || !bestHitSource) {
		return null;
	}
	return {
		hit: bestPrimitiveHit,
		source: bestHitSource,
	};
}

/**
 * 将 Primitive 命中结果转换为通用的 `HitTestResult`。
 */
function convertPrimitiveHitResult(
	primitiveHit: BestPrimitiveHit
): HitTestResult {
	return {
		source: primitiveHit.source,
		object: {
			externalId: primitiveHit.hit.externalId,
		},
		cursorStyle: primitiveHit.hit.cursorStyle,
	};
}

/**
 * 对 pane 中的视图执行命中测试，返回命中的视图与对象信息。
 */
function hitTestPaneView(
	paneViews: readonly IPaneView[],
	x: Coordinate,
	y: Coordinate,
	pane: Pane
): HitTestPaneViewResult | null {
	for (const paneView of paneViews) {
		const renderer = paneView.renderer(pane);
		if (renderer !== null && renderer.hitTest) {
			const result = renderer.hitTest(x, y);
			if (result !== null) {
				return {
					view: paneView,
					object: result,
				};
			}
		}
	}

	return null;
}

function isDataSource(source: IPrimitiveHitTestSource): source is IDataSource {
	return (source as IDataSource).paneViews !== undefined;
}

// eslint-disable-next-line complexity
export function hitTestPane(
	pane: Pane,
	x: Coordinate,
	y: Coordinate
): HitTestResult | null {
	const sources: IPrimitiveHitTestSource[] = [pane, ...pane.orderedSources()];
	const bestPrimitiveHit = findBestPrimitiveHitTest(sources, x, y);
	if (bestPrimitiveHit?.hit.zOrder === 'top') {
		// 顶层 Primitive 命中优先级最高，可直接返回。
		return convertPrimitiveHitResult(bestPrimitiveHit);
	}
	for (const source of sources) {
		if (bestPrimitiveHit && bestPrimitiveHit.source === source && bestPrimitiveHit.hit.zOrder !== 'bottom' && !bestPrimitiveHit.hit.isBackground) {
			// 非底层且非背景的 Primitive 位于内置元素之上，优先返回。
			return convertPrimitiveHitResult(bestPrimitiveHit);
		}
		if (isDataSource(source)) {
			const sourceResult = hitTestPaneView(source.paneViews(pane), x, y, pane);
			if (sourceResult !== null) {
				return {
					source: source,
					view: sourceResult.view,
					object: sourceResult.object,
				};
			}
		}
		if (bestPrimitiveHit && bestPrimitiveHit.source === source && bestPrimitiveHit.hit.zOrder !== 'bottom' && bestPrimitiveHit.hit.isBackground) {
			return convertPrimitiveHitResult(bestPrimitiveHit);
		}
	}
	if (bestPrimitiveHit?.hit) {
		// 底层 Primitive 命中结果在此返回。
		return convertPrimitiveHitResult(bestPrimitiveHit);
	}

	return null;
}
