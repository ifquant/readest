// fancy-canvas 鎻愪緵鐨勪綅鍥惧潗鏍囦綔鐢ㄥ煙涓?Canvas 缁戝畾宸ュ叿
import {
	BitmapCoordinatesRenderingScope,
	CanvasElementBitmapSizeBinding,
	CanvasRenderingTarget2D,
	equalSizes,
	Size,
	size,
	tryCreateCanvasRenderingTarget2D,
} from 'fancy-canvas';

import { ensureNotNull } from '../helpers/assertions';
import { clearRect, clearRectWithGradient } from '../helpers/canvas-helpers';
import { Delegate } from '../helpers/delegate';
import { IDestroyable } from '../helpers/idestroyable';
import { ISubscription } from '../helpers/isubscription';

import { IChartModelBase, TrackingModeExitMode } from '../model/chart-model';
import { Coordinate } from '../typings/coordinate';
import { IDataSourcePaneViews } from '../model/idata-source';
import { InvalidationLevel } from '../model/invalidate-mask';
import { KineticAnimation } from '../model/kinetic-animation';
import { Pane } from '../model/pane';
import { hitTestPane, HitTestResult } from '../model/pane-hit-test';
import { Point } from '../model/point';
import { TimePointIndex } from '../model/time-data';
import { TouchMouseEventData } from '../model/touch-mouse-event-data';
import { IPaneRenderer } from '../renderers/ipane-renderer';
import { IPaneView } from '../views/pane/ipane-view';

import { AttributionLogoWidget } from './attribution-logo-widget';
import { createBoundCanvas, releaseCanvas } from './canvas-utils';
import { IChartWidgetBase } from './chart-widget';
import { drawBackground, drawForeground, DrawFunction, drawSourceViews, ViewsGetter } from './draw-functions';
import { MouseEventHandler, MouseEventHandlerEventBase, MouseEventHandlerMouseEvent, MouseEventHandlers, MouseEventHandlerTouchEvent, Position, TouchMouseEvent } from './mouse-event-handler';
import { PriceAxisWidget, PriceAxisWidgetSide } from './price-axis-widget';

// 鎯€ф粴鍔ㄩ厤缃紝鎺у埗鍔ㄩ噺婊氬姩鐨勯€熷害涓庨槇鍊?
const enum KineticScrollConstants {
	MinScrollSpeed = 0.2,
	MaxScrollSpeed = 7,
	DumpingCoeff = 0.997,
	ScrollMinMove = 15,
}

// 浠ヤ笅甯姪鍑芥暟鐢ㄤ簬浠庢暟鎹簮鏀堕泦涓嶅悓灞傜骇鐨勮鍥?
function sourceBottomPaneViews(source: IDataSourcePaneViews, pane: Pane): readonly IPaneView[] {
	return source.bottomPaneViews?.(pane) ?? [];
}
function sourcePaneViews(source: IDataSourcePaneViews, pane: Pane): readonly IPaneView[] {
	return source.paneViews?.(pane) ?? [];
}
function sourceLabelPaneViews(source: IDataSourcePaneViews, pane: Pane): readonly IPaneView[] {
	return source.labelPaneViews?.(pane) ?? [];
}
function sourceTopPaneViews(source: IDataSourcePaneViews, pane: Pane): readonly IPaneView[] {
	return source.topPaneViews?.(pane) ?? [];
}

// 璁板綍寮€濮嬫粴鍔ㄦ椂鐨勬寚閽堜綅缃笌鏃堕棿鎴筹紝鐢ㄤ簬璁＄畻鎯€?
interface StartScrollPosition extends Point {
	timestamp: number;
	localX: Coordinate;
	localY: Coordinate;
}

export class PaneWidget implements IDestroyable, MouseEventHandlers {
	private readonly _chart: IChartWidgetBase;
	private _state: Pane | null;
	private _size: Size = size({ width: 0, height: 0 });
	private _leftPriceAxisWidget: PriceAxisWidget | null = null;
	private _rightPriceAxisWidget: PriceAxisWidget | null = null;
	private _attributionLogoWidget: AttributionLogoWidget | null = null;
	// pane 鎵€鍦ㄧ殑琛ㄦ牸鍗曞厓鏍间互鍙婂乏鍙充环鏍艰酱鍗曞厓鏍?
	private readonly _paneCell: HTMLElement;
	private readonly _leftAxisCell: HTMLElement;
	private readonly _rightAxisCell: HTMLElement;
	// 搴曞眰涓庨《灞?Canvas 缁戝畾锛堥《灞傜敤浜庝氦浜?鍙犲姞灞傦級
	private readonly _canvasBinding: CanvasElementBitmapSizeBinding;
	private readonly _topCanvasBinding: CanvasElementBitmapSizeBinding;
	private readonly _rowElement: HTMLElement;
	private readonly _mouseEventHandler: MouseEventHandler;
	// 鎷栨嫿婊氬姩鐘舵€佽褰?
	private _startScrollingPos: StartScrollPosition | null = null;
	private _isScrolling: boolean = false;
	// 瀵瑰鍙戝竷鐨勭偣鍑汇€佸弻鍑讳簨浠跺鎵?
	private _clicked: Delegate<TimePointIndex | null, Point, TouchMouseEventData> = new Delegate();
	private _dblClicked: Delegate<TimePointIndex | null, Point, TouchMouseEventData> = new Delegate();
	private _prevPinchScale: number = 0;
	private _longTap: boolean = false;
	// 杩借釜妯″紡鐩稿叧鐘舵€侊紝鐢ㄤ簬鎷栧姩鍗佸瓧绾?
	private _startTrackPoint: Point | null = null;
	private _exitTrackingModeOnNextTry: boolean = false;
	private _initCrosshairPosition: Point | null = null;

	private _scrollXAnimation: KineticAnimation | null = null;

	private _isSettingSize: boolean = false;

	public constructor(chart: IChartWidgetBase, state: Pane) {
		this._chart = chart;

		this._state = state;
		this._state.onDestroyed().subscribe(this._onStateDestroyed.bind(this), this, true);

		// pane 鍗曞厓鏍煎唴鍖呰９涓€涓粷瀵瑰畾浣嶇殑 div锛屾壙杞藉簳灞?椤跺眰 canvas
		this._paneCell = document.createElement('td');
		this._paneCell.style.padding = '0';
		this._paneCell.style.position = 'relative';

		const paneWrapper = document.createElement('div');
		paneWrapper.style.width = '100%';
		paneWrapper.style.height = '100%';
		paneWrapper.style.position = 'relative';
		paneWrapper.style.overflow = 'hidden';

		this._leftAxisCell = document.createElement('td');
		this._leftAxisCell.style.padding = '0';

		this._rightAxisCell = document.createElement('td');
		this._rightAxisCell.style.padding = '0';

		this._paneCell.appendChild(paneWrapper);

		// 搴曞眰 canvas 鐢ㄤ簬涓昏缁樺埗
		this._canvasBinding = createBoundCanvas(paneWrapper, size({ width: 16, height: 16 }));
		this._canvasBinding.subscribeSuggestedBitmapSizeChanged(this._canvasSuggestedBitmapSizeChangedHandler);
		const canvas = this._canvasBinding.canvasElement;
		canvas.style.position = 'absolute';
		canvas.style.zIndex = '1';
		canvas.style.left = '0';
		canvas.style.top = '0';

		// 椤跺眰 canvas 缁樺埗鍗佸瓧绾裤€乵arkers 绛夊彔鍔犲眰
		this._topCanvasBinding = createBoundCanvas(paneWrapper, size({ width: 16, height: 16 }));
		this._topCanvasBinding.subscribeSuggestedBitmapSizeChanged(this._topCanvasSuggestedBitmapSizeChangedHandler);
		const topCanvas = this._topCanvasBinding.canvasElement;
		topCanvas.style.position = 'absolute';
		topCanvas.style.zIndex = '2';
		topCanvas.style.left = '0';
		topCanvas.style.top = '0';

		this._rowElement = document.createElement('tr');
		this._rowElement.appendChild(this._leftAxisCell);
		this._rowElement.appendChild(this._paneCell);
		this._rowElement.appendChild(this._rightAxisCell);
		this.updatePriceAxisWidgetsStates();

		// MouseEventHandler 缁熶竴澶勭悊榧犳爣/瑙︽懜鎿嶄綔锛屼紶閫掕嚦褰撳墠瀹炰緥
		this._mouseEventHandler = new MouseEventHandler(
			this._topCanvasBinding.canvasElement,
			this,
			{
				treatVertTouchDragAsPageScroll: () => this._startTrackPoint === null && !this._chart.options()['handleScroll'].vertTouchDrag,
				treatHorzTouchDragAsPageScroll: () => this._startTrackPoint === null && !this._chart.options()['handleScroll'].horzTouchDrag,
			}
		);
	}

	public destroy(): void {
		// 閿€姣佸乏鍙充环鏍艰酱銆乴ogo 绛夐檮灞炵粍浠?
		if (this._leftPriceAxisWidget !== null) {
			this._leftPriceAxisWidget.destroy();
		}
		if (this._rightPriceAxisWidget !== null) {
			this._rightPriceAxisWidget.destroy();
		}
		this._attributionLogoWidget = null;

		// 閲婃斁 canvas锛岄伩鍏?iOS Safari 鍐呭瓨娉勯湶
		this._topCanvasBinding.unsubscribeSuggestedBitmapSizeChanged(this._topCanvasSuggestedBitmapSizeChangedHandler);
		releaseCanvas(this._topCanvasBinding.canvasElement);
		this._topCanvasBinding.dispose();

		this._canvasBinding.unsubscribeSuggestedBitmapSizeChanged(this._canvasSuggestedBitmapSizeChangedHandler);
		releaseCanvas(this._canvasBinding.canvasElement);
		this._canvasBinding.dispose();

		if (this._state !== null) {
			this._state.onDestroyed().unsubscribeAll(this);
			this._state.destroy();
		}

		this._mouseEventHandler.destroy();
	}

	public state(): Pane {
		return ensureNotNull(this._state);
	}

	public setState(pane: Pane | null): void {
		if (this._state !== null) {
			this._state.onDestroyed().unsubscribeAll(this);
		}

		this._state = pane;

		if (this._state !== null) {
			this._state.onDestroyed().subscribe(PaneWidget.prototype._onStateDestroyed.bind(this), this, true);
		}

		this.updatePriceAxisWidgetsStates();

		// 浠呮渶鍚庝竴涓?pane 鏄剧ず TV logo锛屼互绗﹀悎鎺堟潈瑕佹眰
		if (this._chart.paneWidgets().indexOf(this) === this._chart.paneWidgets().length - 1) {
			this._attributionLogoWidget = this._attributionLogoWidget ?? new AttributionLogoWidget(this._paneCell, this._chart);
			this._attributionLogoWidget.update();
		} else {
			this._attributionLogoWidget?.removeElement();
			this._attributionLogoWidget = null;
		}
	}

	public chart(): IChartWidgetBase {
		return this._chart;
	}

	public getElement(): HTMLElement {
		return this._rowElement;
	}

	public updatePriceAxisWidgetsStates(): void {
		if (this._state === null) {
			return;
		}

		this._recreatePriceAxisWidgets();
		if (this._model().serieses().length === 0) {
			// 娌℃湁搴忓垪鏃舵棤闇€缁戝畾浠锋牸杞?
			return;
		}

		if (this._leftPriceAxisWidget !== null) {
			const leftPriceScale = this._state.leftPriceScale();
			this._leftPriceAxisWidget.setPriceScale(ensureNotNull(leftPriceScale));
		}
		if (this._rightPriceAxisWidget !== null) {
			const rightPriceScale = this._state.rightPriceScale();
			this._rightPriceAxisWidget.setPriceScale(ensureNotNull(rightPriceScale));
		}
	}

	public updatePriceAxisWidgets(): void {
		// 鍒锋柊浠锋牸杞存爣绛?缃戞牸
		if (this._leftPriceAxisWidget !== null) {
			this._leftPriceAxisWidget.update();
		}
		if (this._rightPriceAxisWidget !== null) {
			this._rightPriceAxisWidget.update();
		}
	}

	public stretchFactor(): number {
		return this._state !== null ? this._state.stretchFactor() : 0;
	}

	public setStretchFactor(stretchFactor: number): void {
		// stretchFactor 鐢?chart-widget 鏍规嵁鎷栨嫿鍒嗛厤
		if (this._state) {
			this._state.setStretchFactor(stretchFactor);
		}
	}

	public mouseEnterEvent(event: MouseEventHandlerMouseEvent): void {
		if (!this._state) {
			return;
		}
		this._onMouseEvent();
		const x = event.localX;
		const y = event.localY;
		// 榧犳爣杩涘叆鏃剁珛鍗虫洿鏂板崄瀛楃嚎浣嶇疆
		this._setCrosshairPosition(x, y, event);
	}

	public mouseDownEvent(event: MouseEventHandlerMouseEvent): void {
		this._onMouseEvent();
		this._mouseTouchDownEvent();
		this._setCrosshairPosition(event.localX, event.localY, event);
	}

	public mouseMoveEvent(event: MouseEventHandlerMouseEvent): void {
		if (!this._state) {
			return;
		}
		this._onMouseEvent();
		const x = event.localX;
		const y = event.localY;
		this._setCrosshairPosition(x, y, event);
	}

	public mouseClickEvent(event: MouseEventHandlerMouseEvent): void {
		if (this._state === null) {
			return;
		}
		this._onMouseEvent();
		// 鍗曞嚮瑙﹀彂 crosshair 鏁版嵁鍥炶皟
		this._fireClickedDelegate(event);
	}

	public mouseDoubleClickEvent(event: MouseEventHandlerMouseEvent | MouseEventHandlerTouchEvent): void {
		if (this._state === null) {
			return;
		}
		this._fireMouseClickDelegate(this._dblClicked, event);
	}

	public doubleTapEvent(event: MouseEventHandlerTouchEvent): void {
		this.mouseDoubleClickEvent(event);
	}

	public pressedMouseMoveEvent(event: MouseEventHandlerMouseEvent): void {
		this._onMouseEvent();
		// 鎷栨嫿鏃舵棦澶勭悊婊氬姩涔熸洿鏂板崄瀛楃嚎
		this._pressedMouseTouchMoveEvent(event);
		this._setCrosshairPosition(event.localX, event.localY, event);
	}

	public mouseUpEvent(event: MouseEventHandlerMouseEvent): void {
		if (this._state === null) {
			return;
		}
		this._onMouseEvent();

		this._longTap = false;

		// 榧犳爣鏉惧紑鏃剁粨鏉熸儻鎬ф粴鍔?
		this._endScroll(event);
	}

	public tapEvent(event: MouseEventHandlerTouchEvent): void {
		if (this._state === null) {
			return;
		}
		// 杞昏Е绛夊悓鍗曞嚮
		this._fireClickedDelegate(event);
	}

	public longTapEvent(event: MouseEventHandlerTouchEvent): void {
		this._longTap = true;

		if (this._startTrackPoint === null) {
			const point: Point = { x: event.localX, y: event.localY };
			// 闀挎寜杩涘叆杩借釜妯″紡锛岄攣瀹氬崄瀛楃嚎
			this._startTrackingMode(point, point, event);
		}
	}

	public mouseLeaveEvent(event: MouseEventHandlerMouseEvent): void {
		if (this._state === null) {
			return;
		}
		this._onMouseEvent();

		this._state.model().setHoveredSource(null);
		this._clearCrosshairPosition();
	}

	public clicked(): ISubscription<TimePointIndex | null, Point, TouchMouseEventData> {
		return this._clicked;
	}

	public dblClicked(): ISubscription<TimePointIndex | null, Point, TouchMouseEventData> {
		return this._dblClicked;
	}

	public pinchStartEvent(): void {
		this._prevPinchScale = 1;
		this._model().stopTimeScaleAnimation();
	}

	public pinchEvent(middlePoint: Position, scale: number): void {
		if (!this._chart.options()['handleScale'].pinch) {
			return;
		}

		const zoomScale = (scale - this._prevPinchScale) * 5;
		this._prevPinchScale = scale;

		this._model().zoomTime(middlePoint.x as Coordinate, zoomScale);
	}

	public touchStartEvent(event: MouseEventHandlerTouchEvent): void {
		this._longTap = false;
		this._exitTrackingModeOnNextTry = this._startTrackPoint !== null;

		this._mouseTouchDownEvent();

		const crosshair = this._model().crosshairSource();
		if (this._startTrackPoint !== null && crosshair.visible()) {
			this._initCrosshairPosition = { x: crosshair.appliedX(), y: crosshair.appliedY() };
			this._startTrackPoint = { x: event.localX, y: event.localY };
		}
	}

	public touchMoveEvent(event: MouseEventHandlerTouchEvent): void {
		if (this._state === null) {
			return;
		}

		const x = event.localX;
		const y = event.localY;
		if (this._startTrackPoint !== null) {
			// tracking mode: move crosshair
			this._exitTrackingModeOnNextTry = false;
			const origPoint = ensureNotNull(this._initCrosshairPosition);
			const newX = origPoint.x + (x - this._startTrackPoint.x) as Coordinate;
			const newY = origPoint.y + (y - this._startTrackPoint.y) as Coordinate;
			// 杩借釜妯″紡锛氬崄瀛楃嚎璺熼殢鎵嬫寚鍋忕Щ
			this._setCrosshairPosition(newX, newY, event);
			return;
		}

		this._pressedMouseTouchMoveEvent(event);
	}

	public touchEndEvent(event: MouseEventHandlerTouchEvent): void {
		if (this.chart().options().trackingMode.exitMode === TrackingModeExitMode.OnTouchEnd) {
			this._exitTrackingModeOnNextTry = true;
		}
		this._tryExitTrackingMode();
		// 瑙︽帶鏉惧紑鍚庯紝鍚屾缁撴潫婊氬姩
		this._endScroll(event);
	}

	public hitTest(x: Coordinate, y: Coordinate): HitTestResult | null {
		const state = this._state;
		if (state === null) {
			return null;
		}

		// 鍒╃敤妯″瀷灞傜殑鍛戒腑娴嬭瘯锛岃繑鍥炴偓鍋滃璞?
		return hitTestPane(state, x, y);
	}

	public setPriceAxisSize(width: number, position: PriceAxisWidgetSide): void {
		const priceAxisWidget = position === 'left' ? this._leftPriceAxisWidget : this._rightPriceAxisWidget;
		ensureNotNull(priceAxisWidget).setSize(size({ width, height: this._size.height }));
	}

	public getSize(): Size {
		return this._size;
	}

	public setSize(newSize: Size): void {
		if (equalSizes(this._size, newSize)) {
			return;
		}

		this._size = newSize;
		this._isSettingSize = true;
		// 鏇存柊搴曞眰/椤跺眰 canvas 浣嶅浘灏哄
		this._canvasBinding.resizeCanvasElement(newSize);
		this._topCanvasBinding.resizeCanvasElement(newSize);
		this._isSettingSize = false;
		this._paneCell.style.width = newSize.width + 'px';
		this._paneCell.style.height = newSize.height + 'px';
	}

	public recalculatePriceScales(): void {
		const pane = ensureNotNull(this._state);
		pane.recalculatePriceScale(pane.leftPriceScale());
		pane.recalculatePriceScale(pane.rightPriceScale());

		// Overlay 鏁版嵁婧愪娇鐢ㄦ墍灞炰环鏍艰酱锛岄渶瑕侀€愪釜 recalculation
		for (const source of pane.dataSources()) {
			if (pane.isOverlay(source)) {
				const priceScale = source.priceScale();
				if (priceScale !== null) {
					pane.recalculatePriceScale(priceScale);
				}

				// for overlay drawings price scale is owner's price scale
				// however owner's price scale could not contain ds
				source.updateAllViews();
			}
		}
		for (const primitive of pane.primitives()) {
			primitive.updateAllViews();
		}
	}

	public getBitmapSize(): Size {
		return this._canvasBinding.bitmapSize;
	}

	public drawBitmap(ctx: CanvasRenderingContext2D, x: number, y: number, addTopLayer?: boolean): void {
		const bitmapSize = this.getBitmapSize();
		if (bitmapSize.width > 0 && bitmapSize.height > 0) {
			// 鐩存帴鎷疯礉搴曞眰浣嶅浘
			ctx.drawImage(this._canvasBinding.canvasElement, x, y);

			if (addTopLayer) {
				const topLayer = this._topCanvasBinding.canvasElement;
				if (ctx !== null) {
					// 椤跺眰鍙犲姞鍗佸瓧绾跨瓑涓存椂鍏冪礌
					ctx.drawImage(topLayer, x, y);
				}
			}
		}
	}

	public paint(type: InvalidationLevel): void {
		if (type === InvalidationLevel.None) {
			return;
		}

		if (this._state === null) {
			return;
		}

		if (type > InvalidationLevel.Cursor) {
			this.recalculatePriceScales();
		}

		if (this._leftPriceAxisWidget !== null) {
			this._leftPriceAxisWidget.paint(type);
		}
		if (this._rightPriceAxisWidget !== null) {
			this._rightPriceAxisWidget.paint(type);
		}

		const canvasOptions: CanvasRenderingContext2DSettings = {
			colorSpace: this._chart.options().layout.colorSpace,
		};

		if (type !== InvalidationLevel.Cursor) {
			this._canvasBinding.applySuggestedBitmapSize();
			const target = tryCreateCanvasRenderingTarget2D(this._canvasBinding, canvasOptions);
			if (target !== null) {
				target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
					this._drawBackground(scope);
				});
				if (this._state) {
					// 缁樺埗椤哄簭锛氬簳灞傝嚜瀹氫箟瑙嗗浘 -> 缃戞牸 -> series -> 鏍囩灞?
					this._drawSources(target, sourceBottomPaneViews);
					this._drawGrid(target);
					this._drawSources(target, sourcePaneViews);
					this._drawSources(target, sourceLabelPaneViews);
				}
			}
		}

		this._topCanvasBinding.applySuggestedBitmapSize();
		const topTarget = tryCreateCanvasRenderingTarget2D(this._topCanvasBinding, canvasOptions);
		if (topTarget !== null) {
			topTarget.useBitmapCoordinateSpace(({ context: ctx, bitmapSize }: BitmapCoordinatesRenderingScope) => {
				ctx.clearRect(0, 0, bitmapSize.width, bitmapSize.height);
			});
			this._drawCrosshair(topTarget);
			this._drawSources(topTarget, sourceTopPaneViews);
			this._drawSources(topTarget, sourceLabelPaneViews);
		}
	}

	public leftPriceAxisWidget(): PriceAxisWidget | null {
		return this._leftPriceAxisWidget;
	}

	public rightPriceAxisWidget(): PriceAxisWidget | null {
		return this._rightPriceAxisWidget;
	}

	public drawAdditionalSources(target: CanvasRenderingTarget2D, paneViewsGetter: ViewsGetter<IDataSourcePaneViews>): void {
		this._drawSources(target, paneViewsGetter);
	}

	private _onStateDestroyed(): void {
		if (this._state !== null) {
			this._state.onDestroyed().unsubscribeAll(this);
		}

		this._state = null;
	}

	private _fireClickedDelegate(event: MouseEventHandlerEventBase): void {
		this._fireMouseClickDelegate(this._clicked, event);
	}

	private _fireMouseClickDelegate(delegate: Delegate<TimePointIndex | null, Point, TouchMouseEventData>, event: MouseEventHandlerEventBase): void {
		const x = event.localX;
		const y = event.localY;
		if (delegate.hasListeners()) {
			delegate.fire(this._model().timeScale().coordinateToIndex(x), { x, y }, event);
		}
	}

	private _drawBackground({ context: ctx, bitmapSize }: BitmapCoordinatesRenderingScope): void {
		const { width, height } = bitmapSize;
		const model = this._model();
		const topColor = model.backgroundTopColor();
		const bottomColor = model.backgroundBottomColor();

		if (topColor === bottomColor) {
			clearRect(ctx, 0, 0, width, height, bottomColor);
		} else {
			clearRectWithGradient(ctx, 0, 0, width, height, topColor, bottomColor);
		}
	}

	private _drawGrid(target: CanvasRenderingTarget2D): void {
		const state = ensureNotNull(this._state);
		const paneView = state.grid().paneView();
		const renderer = paneView.renderer(state);

		if (renderer !== null) {
			renderer.draw(target, false);
		}
	}

	private _drawCrosshair(target: CanvasRenderingTarget2D): void {
		this._drawSourceImpl(target, sourcePaneViews, drawForeground, this._model().crosshairSource());
	}

	private _drawSources(target: CanvasRenderingTarget2D, paneViewsGetter: ViewsGetter<IDataSourcePaneViews>): void {
		const state = ensureNotNull(this._state);
		const sources = state.orderedSources();

		const panePrimitives = state.primitives();
		for (const panePrimitive of panePrimitives) {
			this._drawSourceImpl(target, paneViewsGetter, drawBackground, panePrimitive);
		}
		for (const source of sources) {
			this._drawSourceImpl(target, paneViewsGetter, drawBackground, source);
		}

		for (const panePrimitive of panePrimitives) {
			this._drawSourceImpl(target, paneViewsGetter, drawForeground, panePrimitive);
		}
		for (const source of sources) {
			this._drawSourceImpl(target, paneViewsGetter, drawForeground, source);
		}
	}

	private _drawSourceImpl(
		target: CanvasRenderingTarget2D,
		paneViewsGetter: ViewsGetter<IDataSourcePaneViews>,
		drawFn: DrawFunction,
		source: IDataSourcePaneViews
	): void {
		const state = ensureNotNull(this._state);
		const hoveredSource = state.model().hoveredSource();
		const isHovered = hoveredSource !== null && hoveredSource.source === source;
		const objecId = hoveredSource !== null && isHovered && hoveredSource.object !== undefined
			? hoveredSource.object.hitTestData
			: undefined;

		// drawFn 鍐冲畾娓叉煋灞傜骇锛堣儗鏅?鍓嶆櫙锛?
		const drawRendererFn = (renderer: IPaneRenderer) => drawFn(renderer, target, isHovered, objecId);
		drawSourceViews(paneViewsGetter, drawRendererFn, source, state);
	}

	private _recreatePriceAxisWidgets(): void {
		if (this._state === null) {
			return;
		}
		const chart = this._chart;
		const leftAxisVisible = this._state.leftPriceScale().options().visible;
		const rightAxisVisible = this._state.rightPriceScale().options().visible;
		if (!leftAxisVisible && this._leftPriceAxisWidget !== null) {
			this._leftAxisCell.removeChild(this._leftPriceAxisWidget.getElement());
			this._leftPriceAxisWidget.destroy();
			this._leftPriceAxisWidget = null;
		}
		if (!rightAxisVisible && this._rightPriceAxisWidget !== null) {
			this._rightAxisCell.removeChild(this._rightPriceAxisWidget.getElement());
			this._rightPriceAxisWidget.destroy();
			this._rightPriceAxisWidget = null;
		}
		const rendererOptionsProvider = chart.model().rendererOptionsProvider();
		if (leftAxisVisible && this._leftPriceAxisWidget === null) {
			this._leftPriceAxisWidget = new PriceAxisWidget(this, chart.options(), rendererOptionsProvider, 'left');
			this._leftAxisCell.appendChild(this._leftPriceAxisWidget.getElement());
		}
		if (rightAxisVisible && this._rightPriceAxisWidget === null) {
			this._rightPriceAxisWidget = new PriceAxisWidget(this, chart.options(), rendererOptionsProvider, 'right');
			this._rightAxisCell.appendChild(this._rightPriceAxisWidget.getElement());
		}
	}

	private _preventScroll(event: TouchMouseEvent): boolean {
		return event.isTouch && this._longTap || this._startTrackPoint !== null;
	}

	private _correctXCoord(x: Coordinate): Coordinate {
		return Math.max(0, Math.min(x, this._size.width - 1)) as Coordinate;
	}

	private _correctYCoord(y: Coordinate): Coordinate {
		return Math.max(0, Math.min(y, this._size.height - 1)) as Coordinate;
	}

	private _setCrosshairPosition(x: Coordinate, y: Coordinate, event: MouseEventHandlerEventBase): void {
		this._model().setAndSaveCurrentPosition(this._correctXCoord(x), this._correctYCoord(y), event, ensureNotNull(this._state));
	}

	private _clearCrosshairPosition(): void {
		this._model().clearCurrentPosition();
	}

	private _tryExitTrackingMode(): void {
		if (this._exitTrackingModeOnNextTry) {
			this._startTrackPoint = null;
			this._clearCrosshairPosition();
		}
	}

	private _startTrackingMode(startTrackPoint: Point, crossHairPosition: Point, event: MouseEventHandlerEventBase): void {
		this._startTrackPoint = startTrackPoint;
		this._exitTrackingModeOnNextTry = false;
		this._setCrosshairPosition(crossHairPosition.x, crossHairPosition.y, event);
		const crosshair = this._model().crosshairSource();
		this._initCrosshairPosition = { x: crosshair.appliedX(), y: crosshair.appliedY() };
	}

	private _model(): IChartModelBase {
		return this._chart.model();
	}

	private _endScroll(event: TouchMouseEvent): void {
		if (!this._isScrolling) {
			return;
		}

		// 榧犳爣/瑙﹀睆鏉惧紑鍚庯紝閫氱煡妯″瀷缁撴潫浠锋牸涓庢椂闂存粴鍔?
		const model = this._model();
		const state = this.state();

		model.endScrollPrice(state, state.defaultPriceScale());

		this._startScrollingPos = null;
		this._isScrolling = false;
		model.endScrollTime();

		if (this._scrollXAnimation !== null) {
			// 鎯€ф粴鍔ㄧ敱 kinetic animation 鎺ョ锛岀户缁笣婊戞粦鍔?
			const startAnimationTime = performance.now();
			const timeScale = model.timeScale();

			this._scrollXAnimation.start(timeScale.rightOffset() as Coordinate, startAnimationTime);

			if (!this._scrollXAnimation.finished(startAnimationTime)) {
				model.setTimeScaleAnimation(this._scrollXAnimation);
			}
		}
	}

	private _onMouseEvent(): void {
		this._startTrackPoint = null;
	}

	private _mouseTouchDownEvent(): void {
		if (!this._state) {
			return;
		}

		// 浠绘剰鎸変笅浜嬩欢闇€瑕佷腑鏂粛鍦ㄨ繘琛岀殑鏃堕棿杞村姩鐢?
		this._model().stopTimeScaleAnimation();

		if (document.activeElement !== document.body && document.activeElement !== document.documentElement) {
			// If any focusable element except the page itself is focused, remove the focus
			(ensureNotNull(document.activeElement) as HTMLElement).blur();
		} else {
			// Clear selection
			const selection = document.getSelection();
			if (selection !== null) {
				selection.removeAllRanges();
			}
		}

		const priceScale = this._state.defaultPriceScale();

		if (priceScale.isEmpty() || this._model().timeScale().isEmpty()) {
			return;
		}
	}

	// eslint-disable-next-line complexity
	private _pressedMouseTouchMoveEvent(event: TouchMouseEvent): void {
		if (this._state === null) {
			return;
		}

		const model = this._model();
		const timeScale = model.timeScale();

		if (timeScale.isEmpty()) {
			return;
		}

		const chartOptions = this._chart.options();
		const scrollOptions = chartOptions['handleScroll'];
		const kineticScrollOptions = chartOptions.kineticScroll;
		// 榧犳爣鎷栨嫿/瑙︽帶婊戝姩鏄惁鍏佽婊氬姩鐢遍厤缃帶鍒?
		if (
			(!scrollOptions.pressedMouseMove || event.isTouch) &&
			(!scrollOptions.horzTouchDrag && !scrollOptions.vertTouchDrag || !event.isTouch)
		) {
			return;
		}

		const priceScale = this._state.defaultPriceScale();

		const now = performance.now();

		if (this._startScrollingPos === null && !this._preventScroll(event)) {
			// 鍒濇绉诲姩璁板綍鎸囬拡璧风偣涓庢椂闂存埑锛岀敤浜庤Е鍙戞儻鎬у垽鏂?
			this._startScrollingPos = {
				x: event.clientX,
				y: event.clientY,
				timestamp: now,
				localX: event.localX,
				localY: event.localY,
			};
		}

		if (
			this._startScrollingPos !== null &&
			!this._isScrolling &&
			(this._startScrollingPos.x !== event.clientX || this._startScrollingPos.y !== event.clientY)
		) {
			// 鍒ゅ畾涓虹湡姝ｅ紑濮嬫粴鍔ㄦ椂锛屾牴鎹厤缃垱寤烘儻鎬у姩鐢?
			if (event.isTouch && kineticScrollOptions.touch || !event.isTouch && kineticScrollOptions.mouse) {
				const barSpacing = timeScale.barSpacing();
				this._scrollXAnimation = new KineticAnimation(
					KineticScrollConstants.MinScrollSpeed / barSpacing,
					KineticScrollConstants.MaxScrollSpeed / barSpacing,
					KineticScrollConstants.DumpingCoeff,
					KineticScrollConstants.ScrollMinMove / barSpacing
				);
				this._scrollXAnimation.addPosition(timeScale.rightOffset() as Coordinate, this._startScrollingPos.timestamp);
			} else {
				this._scrollXAnimation = null;
			}

			// 鍚姩榛樿浠锋牸杞村拰鏃堕棿杞寸殑婊氬姩鐘舵€?
			if (!priceScale.isEmpty()) {
				model.startScrollPrice(this._state, priceScale, event.localY);
			}

			model.startScrollTime(event.localX);
			this._isScrolling = true;
		}

		if (this._isScrolling) {
			// this allows scrolling not default price scales
			if (!priceScale.isEmpty()) {
				// 鏍规嵁鏈€鏂版寚閽堜綅缃洿鏂颁环鏍艰酱婊氬姩
				model.scrollPriceTo(this._state, priceScale, event.localY);
			}

			model.scrollTimeTo(event.localX);
			if (this._scrollXAnimation !== null) {
				// 杩藉姞鏈€鏂颁綅缃紝渚涙儻鎬у姩鐢昏绠楅€熷害
				this._scrollXAnimation.addPosition(timeScale.rightOffset() as Coordinate, now);
			}
		}
	}

	private readonly _canvasSuggestedBitmapSizeChangedHandler = () => {
		if (this._isSettingSize || this._state === null) {
			return;
		}

		// 搴曞眰 canvas 鑷€傚簲 DPR 鍚庯紝瑙﹀彂杞婚噺鏇存柊鍒锋柊瑙嗗浘
		this._model().lightUpdate();
	};

	private readonly _topCanvasSuggestedBitmapSizeChangedHandler = () => {
		if (this._isSettingSize || this._state === null) {
			return;
		}

		// 椤跺眰 canvas 鍚岀悊锛岃交閲忔洿鏂板嵆鍙埛鏂板崄瀛楃嚎绛変复鏃跺厓绱?
		this._model().lightUpdate();
	};
}

