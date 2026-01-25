import {
	BitmapCoordinatesRenderingScope,
	CanvasElementBitmapSizeBinding,
	CanvasRenderingTarget2D,
	equalSizes,
	MediaCoordinatesRenderingScope,
	Size,
	size,
	tryCreateCanvasRenderingTarget2D,
} from 'fancy-canvas';

import { ensureNotNull } from '../helpers/assertions';
import { clearRect, clearRectWithGradient } from '../helpers/canvas-helpers';
import { IDestroyable } from '../helpers/idestroyable';
import { makeFont } from '../helpers/make-font';

import { ChartOptionsInternalBase } from '../model/chart-model';
import { Coordinate } from '../typings/coordinate';
import { CrosshairMode, CrosshairOptions } from '../model/crosshair';
import { IDataSource, IDataSourcePaneViews } from '../model/idata-source';
import { InvalidationLevel } from '../model/invalidate-mask';
import { PrimitivePaneViewZOrder } from '../model/ipane-primitive';
import { IPriceDataSource } from '../model/iprice-data-source';
import { LayoutOptions } from '../model/layout-options';
import { PriceScalePosition } from '../model/pane';
import { PriceMark, PriceScale } from '../model/price-scale';
import { TextWidthCache } from '../model/text-width-cache';
import { PriceAxisViewRendererOptions } from '../renderers/iprice-axis-view-renderer';
import { PriceAxisRendererOptionsProvider } from '../renderers/price-axis-renderer-options-provider';
import { IAxisView } from '../views/pane/iaxis-view';
import { IPriceAxisView } from '../views/price-axis/iprice-axis-view';

import { createBoundCanvas, releaseCanvas } from './canvas-utils';
import { ViewsGetter } from './draw-functions';
import { suggestPriceScaleWidth } from './internal-layout-sizes-hints';
import { MouseEventHandler, MouseEventHandlers, TouchMouseEvent } from './mouse-event-handler';
import { PaneWidget } from './pane-widget';

export type PriceAxisWidgetSide = Exclude<PriceScalePosition, 'overlay'>;

const enum CursorType {
	Default,
	NsResize,
}

const enum Constants {
	DefaultOptimalWidth = 34,
}

type IPriceAxisViewArray = readonly IPriceAxisView[];

const enum Constants {
	LabelOffset = 5,
}

function hasPriceScale(source: IDataSource | IDataSourcePaneViews): source is IDataSource {
	return (source as IDataSource).priceScale !== undefined;
}

function buildPriceAxisViewsGetter(
	zOrder: PrimitivePaneViewZOrder,
	priceScaleId: PriceAxisWidgetSide
): ViewsGetter<IDataSourcePaneViews> {
	return (source: IDataSource | IDataSourcePaneViews): readonly IAxisView[] => {
		if (!hasPriceScale(source)) {
			return [];
		}
		const psId = source.priceScale()?.id() ?? '';
		if (psId !== priceScaleId) {
			// exclude if source is using a different price scale.
			return [];
		}
		return source.pricePaneViews?.(zOrder) ?? [];
	};
}

function recalculateOverlapping(views: IPriceAxisView[], direction: 1 | -1, scaleHeight: number, rendererOptions: Readonly<PriceAxisViewRendererOptions>): void {
	if (!views.length) {
		return;
	}
	let currentGroupStart = 0;

	const initLabelHeight = views[0].height(rendererOptions, true);
	let spaceBeforeCurrentGroup = direction === 1
		? scaleHeight / 2 - (views[0].getFixedCoordinate() - initLabelHeight / 2)
		: views[0].getFixedCoordinate() - initLabelHeight / 2 - scaleHeight / 2;
	spaceBeforeCurrentGroup = Math.max(0, spaceBeforeCurrentGroup);

	for (let i = 1; i < views.length; i++) {
		const view = views[i];
		const prev = views[i - 1];
		const height = prev.height(rendererOptions, false);
		const coordinate = view.getFixedCoordinate();
		const prevFixedCoordinate = prev.getFixedCoordinate();

		const overlap = direction === 1
			? coordinate > prevFixedCoordinate - height
			: coordinate < prevFixedCoordinate + height;

		if (overlap) {
			const fixedCoordinate = prevFixedCoordinate - height * direction;
			view.setFixedCoordinate(fixedCoordinate);
			const edgePoint = fixedCoordinate - direction * height / 2;
			const outOfViewport = direction === 1 ? edgePoint < 0 : edgePoint > scaleHeight;
			if (outOfViewport && spaceBeforeCurrentGroup > 0) {
				// shift the whole group up or down
				const desiredGroupShift = direction === 1 ? -1 - edgePoint : edgePoint - scaleHeight;
				const possibleShift = Math.min(desiredGroupShift, spaceBeforeCurrentGroup);
				for (let k = currentGroupStart; k < views.length; k++) {
					views[k].setFixedCoordinate(views[k].getFixedCoordinate() + direction * possibleShift);
				}
				spaceBeforeCurrentGroup -= possibleShift;
			}
		} else {
			currentGroupStart = i;
			spaceBeforeCurrentGroup = direction === 1
				? prevFixedCoordinate - height - coordinate
				: coordinate - (prevFixedCoordinate + height);
		}
	}
}

function priceScaleCrosshairLabelVisible(crosshair: CrosshairOptions): boolean {
	return crosshair.mode !== CrosshairMode.Hidden && crosshair.horzLine.visible && crosshair.horzLine.labelVisible;
}

export class PriceAxisWidget implements IDestroyable {
	private readonly _pane: PaneWidget;
	private readonly _options: Readonly<ChartOptionsInternalBase>;
	private readonly _layoutOptions: Readonly<LayoutOptions>;
	private readonly _rendererOptionsProvider: PriceAxisRendererOptionsProvider;
	private readonly _isLeft: boolean;

	private _priceScale: PriceScale | null = null;

	private _size: Size | null = null;

	private readonly _cell: HTMLDivElement;
	private readonly _canvasBinding: CanvasElementBitmapSizeBinding;
	private readonly _topCanvasBinding: CanvasElementBitmapSizeBinding;

	private _mouseEventHandler: MouseEventHandler;
	private _mousedown: boolean = false;

	private readonly _widthCache: TextWidthCache = new TextWidthCache(200);

	private _font: string | null = null;
	private _prevOptimalWidth: number = 0;
	private _isSettingSize: boolean = false;

	private _sourcePaneViews: ViewsGetter<IDataSourcePaneViews>;
	private _sourceTopPaneViews: ViewsGetter<IDataSourcePaneViews>;
	private _sourceBottomPaneViews: ViewsGetter<IDataSourcePaneViews>;

	public constructor(pane: PaneWidget, options: Readonly<ChartOptionsInternalBase>, rendererOptionsProvider: PriceAxisRendererOptionsProvider, side: PriceAxisWidgetSide) {
		this._pane = pane;
		this._options = options;
		this._layoutOptions = options['layout'];
		this._rendererOptionsProvider = rendererOptionsProvider;
		this._isLeft = side === 'left';

		// 閽堝涓嶅悓 z-order 鏀堕泦浠锋牸杞磋鍥撅紝娓叉煋鏃舵寜灞傜骇缁樺埗
		this._sourcePaneViews = buildPriceAxisViewsGetter('normal', side);
		this._sourceTopPaneViews = buildPriceAxisViewsGetter('top', side);
		this._sourceBottomPaneViews = buildPriceAxisViewsGetter('bottom', side);

		// price axis 鑷韩浣跨敤缁濆瀹氫綅鐨勫弻灞?canvas锛岀粨鏋勪笌 pane canvas 淇濇寔涓€鑷?
		this._cell = document.createElement('div');
		this._cell.style.height = '100%';
		this._cell.style.overflow = 'hidden';
		this._cell.style.width = '25px';
		this._cell.style.left = '0';
		this._cell.style.position = 'relative';

		this._canvasBinding = createBoundCanvas(this._cell, size({ width: 16, height: 16 }));
		this._canvasBinding.subscribeSuggestedBitmapSizeChanged(this._canvasSuggestedBitmapSizeChangedHandler);
		const canvas = this._canvasBinding.canvasElement;
		canvas.style.position = 'absolute';
		canvas.style.zIndex = '1';
		canvas.style.left = '0';
		canvas.style.top = '0';

		this._topCanvasBinding = createBoundCanvas(this._cell, size({ width: 16, height: 16 }));
		this._topCanvasBinding.subscribeSuggestedBitmapSizeChanged(this._topCanvasSuggestedBitmapSizeChangedHandler);
		const topCanvas = this._topCanvasBinding.canvasElement;
		topCanvas.style.position = 'absolute';
		topCanvas.style.zIndex = '2';
		topCanvas.style.left = '0';
		topCanvas.style.top = '0';

		const handler: MouseEventHandlers = {
			mouseDownEvent: this._mouseDownEvent.bind(this),
			touchStartEvent: this._mouseDownEvent.bind(this),
			pressedMouseMoveEvent: this._pressedMouseMoveEvent.bind(this),
			touchMoveEvent: this._pressedMouseMoveEvent.bind(this),
			mouseDownOutsideEvent: this._mouseDownOutsideEvent.bind(this),
			mouseUpEvent: this._mouseUpEvent.bind(this),
			touchEndEvent: this._mouseUpEvent.bind(this),
			mouseDoubleClickEvent: this._mouseDoubleClickEvent.bind(this),
			doubleTapEvent: this._mouseDoubleClickEvent.bind(this),
			mouseEnterEvent: this._mouseEnterEvent.bind(this),
			mouseLeaveEvent: this._mouseLeaveEvent.bind(this),
		};
		this._mouseEventHandler = new MouseEventHandler(
			this._topCanvasBinding.canvasElement,
			handler,
			{
				// 妯悜鎷栧姩浜ょ敱椤甸潰婊氬姩锛屽瀭鐩存嫋鍔ㄧ敤浜庤酱缂╂斁
				treatVertTouchDragAsPageScroll: () => !this._options['handleScroll'].vertTouchDrag,
				treatHorzTouchDragAsPageScroll: () => true,
			}
		);
	}

	public destroy(): void {
		this._mouseEventHandler.destroy();

		this._topCanvasBinding.unsubscribeSuggestedBitmapSizeChanged(this._topCanvasSuggestedBitmapSizeChangedHandler);
		releaseCanvas(this._topCanvasBinding.canvasElement);
		this._topCanvasBinding.dispose();

		this._canvasBinding.unsubscribeSuggestedBitmapSizeChanged(this._canvasSuggestedBitmapSizeChangedHandler);
		releaseCanvas(this._canvasBinding.canvasElement);
		this._canvasBinding.dispose();

		if (this._priceScale !== null) {
			this._priceScale.onMarksChanged().unsubscribeAll(this);
		}

		this._priceScale = null;
	}

	public getElement(): HTMLElement {
		return this._cell;
	}

	public fontSize(): number {
		return this._layoutOptions.fontSize;
	}

	public rendererOptions(): Readonly<PriceAxisViewRendererOptions> {
		const options = this._rendererOptionsProvider.options();
		const isFontChanged = this._font !== options.font;

		if (isFontChanged) {
			this._widthCache.reset();
			this._font = options.font;
		}

		return options;
	}

	public optimalWidth(): number {
		if (this._priceScale === null) {
			return 0;
		}

		// 閫氳繃棣栧熬鍒诲害銆乻eries 鏍囩浠ュ強浜ゅ弶鍏夋爣瀹藉害浼扮畻杞村
		let tickMarkMaxWidth = 0;
		const rendererOptions = this.rendererOptions();

		const ctx = ensureNotNull(
			this._canvasBinding.canvasElement.getContext('2d', {
				colorSpace: this._pane.chart().options().layout.colorSpace,
			})
		);
		ctx.save();

		const tickMarks = this._priceScale.marks();

		ctx.font = this._baseFont();

		if (tickMarks.length > 0) {
			tickMarkMaxWidth = Math.max(
				this._widthCache.measureText(ctx, tickMarks[0].label),
				this._widthCache.measureText(ctx, tickMarks[tickMarks.length - 1].label)
			);
		}

		const views = this._backLabels();
		for (let j = views.length; j--;) {
			const width = this._widthCache.measureText(ctx, views[j].text());
			if (width > tickMarkMaxWidth) {
				tickMarkMaxWidth = width;
			}
		}

		const firstValue = this._priceScale.firstValue();
		if (
			firstValue !== null &&
			this._size !== null &&
			priceScaleCrosshairLabelVisible(this._options.crosshair)
		) {
			const topValue = this._priceScale.coordinateToPrice(1 as Coordinate, firstValue);
			const bottomValue = this._priceScale.coordinateToPrice(this._size.height - 2 as Coordinate, firstValue);

			tickMarkMaxWidth = Math.max(
				tickMarkMaxWidth,
				this._widthCache.measureText(ctx, this._priceScale.formatPrice(Math.floor(Math.min(topValue, bottomValue)) + 0.11111111111111, firstValue)),
				this._widthCache.measureText(ctx, this._priceScale.formatPrice(Math.ceil(Math.max(topValue, bottomValue)) - 0.11111111111111, firstValue))
			);
		}

		ctx.restore();

		const resultTickMarksMaxWidth = tickMarkMaxWidth || Constants.DefaultOptimalWidth;
		const res = Math.ceil(
			rendererOptions.borderSize +
			rendererOptions.tickLength +
			rendererOptions.paddingInner +
			rendererOptions.paddingOuter +
			Constants.LabelOffset +
			resultTickMarksMaxWidth
		);

		// make it even, remove this after migration to perfect fancy canvas
		// 瀹藉害闇€涓哄伓鏁帮紝渚夸簬鍍忕礌瀵归綈
		return suggestPriceScaleWidth(res);
	}

	public setSize(newSize: Size): void {
		if (this._size === null || !equalSizes(this._size, newSize)) {
			this._size = newSize;

			this._isSettingSize = true;
			// 璋冩暣浣嶅浘澶у皬浠ュ尮閰?CSS 灏哄锛岄伩鍏嶇缉鏀炬ā绯?
			this._canvasBinding.resizeCanvasElement(newSize);
			this._topCanvasBinding.resizeCanvasElement(newSize);
			this._isSettingSize = false;

			this._cell.style.width = `${newSize.width}px`;
			this._cell.style.height = `${newSize.height}px`;
		}
	}

	public getWidth(): number {
		return ensureNotNull(this._size).width;
	}

	public setPriceScale(priceScale: PriceScale): void {
		if (this._priceScale === priceScale) {
			return;
		}

		if (this._priceScale !== null) {
			this._priceScale.onMarksChanged().unsubscribeAll(this);
		}

		this._priceScale = priceScale;
		priceScale.onMarksChanged().subscribe(this._onMarksChanged.bind(this), this);
	}

	public priceScale(): PriceScale | null {
		return this._priceScale;
	}

	public reset(): void {
		const pane = this._pane.state();
		const model = this._pane.chart().model();
		model.resetPriceScale(pane, ensureNotNull(this.priceScale()));
	}

	public paint(type: InvalidationLevel): void {
		if (this._size === null) {
			return;
		}
		// 浠呭湪闈炲厜鏍囨洿鏂版椂閲嶇粯涓荤敾甯冿紝鍑忓皯鎬ц兘寮€閿€
		const canvasOptions: CanvasRenderingContext2DSettings = {
			colorSpace: this._pane.chart().options().layout.colorSpace,
		};
		if (type !== InvalidationLevel.Cursor) {
			// 閲嶇畻鏍囩浣嶇疆鍚庣粯鍒惰儗鏅€佸埢搴︺€佸簳灞傛暟鎹簮
			this._alignLabels();
			this._canvasBinding.applySuggestedBitmapSize();
			const target = tryCreateCanvasRenderingTarget2D(this._canvasBinding, canvasOptions);
			if (target !== null) {
				target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
					this._drawBackground(scope);
					this._drawBorder(scope);
				});
				this._pane.drawAdditionalSources(target, this._sourceBottomPaneViews);
				this._drawTickMarks(target);
				this._pane.drawAdditionalSources(target, this._sourcePaneViews);
				this._drawBackLabels(target);
			}
		}

		this._topCanvasBinding.applySuggestedBitmapSize();
		const topTarget = tryCreateCanvasRenderingTarget2D(this._topCanvasBinding, canvasOptions);
		if (topTarget !== null) {
			// 椤跺眰浠呬繚鐣欏姩鎬佸厓绱狅細鍗佸瓧绾夸环鏍兼爣绛俱€乷verlay 瑙嗗浘
			topTarget.useBitmapCoordinateSpace(({ context: ctx, bitmapSize }: BitmapCoordinatesRenderingScope) => {
				ctx.clearRect(0, 0, bitmapSize.width, bitmapSize.height);
			});
			this._drawCrosshairLabel(topTarget);
			this._pane.drawAdditionalSources(topTarget, this._sourceTopPaneViews);
		}
	}

	public getBitmapSize(): Size {
		return this._canvasBinding.bitmapSize;
	}

	public drawBitmap(ctx: CanvasRenderingContext2D, x: number, y: number, addTopLayer?: boolean): void {
		const bitmapSize = this.getBitmapSize();
		if (bitmapSize.width > 0 && bitmapSize.height > 0) {
			ctx.drawImage(this._canvasBinding.canvasElement, x, y);

			if (addTopLayer) {
				const topLayer = this._topCanvasBinding.canvasElement;
				ctx.drawImage(topLayer, x, y);
			}
		}
	}

	public update(): void {
		// this call has side-effect - it regenerates marks on the price scale
		this._priceScale?.marks();
	}

	private _mouseDownEvent(e: TouchMouseEvent): void {
		if (this._priceScale === null || this._priceScale.isEmpty() || !this._options['handleScale'].axisPressedMouseMove.price) {
			return;
		}

		// 璁板綍鎸変笅鐘舵€佸苟閫氱煡妯″瀷杩涘叆缂╂斁妯″紡
		const model = this._pane.chart().model();
		const pane = this._pane.state();
		this._mousedown = true;
		model.startScalePrice(pane, this._priceScale, e.localY);
	}

	private _pressedMouseMoveEvent(e: TouchMouseEvent): void {
		if (this._priceScale === null || !this._options['handleScale'].axisPressedMouseMove.price) {
			return;
		}

		// 鎸変綇鎷栧姩鏃舵寔缁缉鏀句环鏍艰酱鑼冨洿
		const model = this._pane.chart().model();
		const pane = this._pane.state();
		const priceScale = this._priceScale;
		model.scalePriceTo(pane, priceScale, e.localY);
	}

	private _mouseDownOutsideEvent(): void {
		if (this._priceScale === null || !this._options['handleScale'].axisPressedMouseMove.price) {
			return;
		}

		const model = this._pane.chart().model();
		const pane = this._pane.state();

		const priceScale = this._priceScale;
		if (this._mousedown) {
			this._mousedown = false;
			// 鍦ㄥ閮ㄦ澗寮€涔熼渶瑕佺粨鏉熺缉鏀撅紝閬垮厤杞村仠鐣欏湪鍗婇€旂姸鎬?
			model.endScalePrice(pane, priceScale);
		}
	}

	private _mouseUpEvent(e: TouchMouseEvent): void {
		if (this._priceScale === null || !this._options['handleScale'].axisPressedMouseMove.price) {
			return;
		}
		const model = this._pane.chart().model();
		const pane = this._pane.state();
		this._mousedown = false;
		// 鏉惧紑鍚庣粨鏉熺缉鏀炬祦绋?
		model.endScalePrice(pane, this._priceScale);
	}

	private _mouseDoubleClickEvent(e: TouchMouseEvent): void {
		if (this._options['handleScale'].axisDoubleClickReset.price) {
			this.reset();
		}
	}

	private _mouseEnterEvent(e: TouchMouseEvent): void {
		if (this._priceScale === null) {
			return;
		}

		const model = this._pane.chart().model();
		if (model.options()['handleScale'].axisPressedMouseMove.price && !this._priceScale.isPercentage() && !this._priceScale.isIndexedTo100()) {
			// 鏄剧ず涓婁笅鎷栨嫿鍏夋爣锛屾彁绀哄彲浠ョ缉鏀?
			this._setCursor(CursorType.NsResize);
		}
	}

	private _mouseLeaveEvent(e: TouchMouseEvent): void {
		this._setCursor(CursorType.Default);
	}

	private _backLabels(): IPriceAxisView[] {
		const res: IPriceAxisView[] = [];

		const priceScale = (this._priceScale === null) ? undefined : this._priceScale;

		const addViewsForSources = (sources: readonly IDataSource[]) => {
			for (let i = 0; i < sources.length; ++i) {
				const source = sources[i];
				const views = source.priceAxisViews(this._pane.state(), priceScale);
				for (let j = 0; j < views.length; j++) {
					res.push(views[j]);
				}
			}
		};

		// calculate max and min coordinates for views on selection
		// crosshair individually
		addViewsForSources(this._pane.state().orderedSources());

		return res;
	}

	private _drawBackground({ context: ctx, bitmapSize }: BitmapCoordinatesRenderingScope): void {
		const { width, height } = bitmapSize;
		const model = this._pane.state().model();
		const topColor = model.backgroundTopColor();
		const bottomColor = model.backgroundBottomColor();

		if (topColor === bottomColor) {
			clearRect(ctx, 0, 0, width, height, topColor);
		} else {
			clearRectWithGradient(ctx, 0, 0, width, height, topColor, bottomColor);
		}
	}

	private _drawBorder({ context: ctx, bitmapSize, horizontalPixelRatio }: BitmapCoordinatesRenderingScope): void {
		if (this._size === null || this._priceScale === null || !this._priceScale.options().borderVisible) {
			return;
		}

		ctx.fillStyle = this._priceScale.options().borderColor;

		const borderSize = Math.max(1, Math.floor(this.rendererOptions().borderSize * horizontalPixelRatio));

		let left: number;
		if (this._isLeft) {
			left = bitmapSize.width - borderSize;
		} else {
			left = 0;
		}

		ctx.fillRect(left, 0, borderSize, bitmapSize.height);
	}

	private _drawTickMarks(target: CanvasRenderingTarget2D): void {
		if (this._size === null || this._priceScale === null) {
			return;
		}

		// 鍒诲害绾夸笌鏂囨湰鍒嗕袱姝ョ粯鍒讹紝鍒嗗埆浣跨敤浣嶅浘/濯掍綋鍧愭爣绌洪棿
		const tickMarks = this._priceScale.marks();
		const priceScaleOptions = this._priceScale.options();
		const rendererOptions = this.rendererOptions();
		const tickMarkLeftX = this._isLeft ?
			(this._size.width - rendererOptions.tickLength) :
			0;

		if (priceScaleOptions.borderVisible && priceScaleOptions.ticksVisible) {
			target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio, verticalPixelRatio }: BitmapCoordinatesRenderingScope) => {
				ctx.fillStyle = priceScaleOptions.borderColor;

				const tickHeight = Math.max(1, Math.floor(verticalPixelRatio));
				const tickOffset = Math.floor(verticalPixelRatio * 0.5);
				const tickLength = Math.round(rendererOptions.tickLength * horizontalPixelRatio);

				// 浣跨敤鐭╁舰鎵归噺缁樺埗锛屽噺灏?fill 璋冪敤娆℃暟
				ctx.beginPath();
				for (const tickMark of tickMarks) {
					ctx.rect(
						Math.floor(tickMarkLeftX * horizontalPixelRatio),
						Math.round(tickMark.coord * verticalPixelRatio) - tickOffset,
						tickLength,
						tickHeight
					);
				}
				ctx.fill();
			});
		}

		target.useMediaCoordinateSpace(({ context: ctx }: MediaCoordinatesRenderingScope) => {
			ctx.font = this._baseFont();
			ctx.fillStyle = priceScaleOptions.textColor ?? this._layoutOptions.textColor;
			ctx.textAlign = this._isLeft ? 'right' : 'left';
			ctx.textBaseline = 'middle';

			const textLeftX = this._isLeft ?
				Math.round(tickMarkLeftX - rendererOptions.paddingInner) :
				Math.round(tickMarkLeftX + rendererOptions.tickLength + rendererOptions.paddingInner);

			const yMidCorrections = tickMarks.map((mark: PriceMark) => this._widthCache.yMidCorrection(ctx, mark.label));

			for (let i = tickMarks.length; i--;) {
				// yMidCorrection 鏍规嵁瀛椾綋 ascender/descender 绾犲亸锛屼繚璇佽瑙夊眳涓?
				const tickMark = tickMarks[i];
				ctx.fillText(tickMark.label, textLeftX, tickMark.coord + yMidCorrections[i]);
			}
		});
	}

	private _alignLabels(): void {
		if (this._size === null || this._priceScale === null) {
			return;
		}
		let center = this._size.height / 2;

		// 鏀堕泦鎵€鏈夊彲瑙佹爣绛撅紝绋嶅悗鐢ㄤ簬鍒ゅ畾閲嶅彔
		const views: IPriceAxisView[] = [];
		const orderedSources = this._priceScale.orderedSources().slice(); // Copy of array
		const pane = this._pane;
		const paneState = pane.state();
		const rendererOptions = this.rendererOptions();

		// if we are default price scale, append labels from no-scale
		const isDefault = this._priceScale === paneState.defaultVisiblePriceScale();

		if (isDefault) {
			this._pane.state().orderedSources().forEach((source: IPriceDataSource) => {
				if (paneState.isOverlay(source)) {
					orderedSources.push(source);
				}
			});
		}

		// we can use any, but let's use the first source as "center" one
		const centerSource = this._priceScale.dataSources()[0];
		const priceScale = this._priceScale;

		const updateForSources = (sources: IDataSource[]) => {
			sources.forEach((source: IDataSource) => {
				const sourceViews = source.priceAxisViews(paneState, priceScale);
				// never align selected sources
				sourceViews.forEach((view: IPriceAxisView) => {
					view.setFixedCoordinate(null);
					if (view.isVisible()) {
						// 鏆傚瓨鍘熷鍧愭爣锛屽悗缁牴鎹腑蹇冪嚎寰皟
						views.push(view);
					}
				});
				if (centerSource === source && sourceViews.length > 0) {
					// 浣跨敤棣栦釜瑙嗗浘鐨勫潗鏍囦綔涓轰笂涓嬪垎鐣?
					center = sourceViews[0].coordinate();
				}
			});
		};

		// crosshair individually
		updateForSources(orderedSources);

		views.forEach((view: IPriceAxisView) => view.setFixedCoordinate(view.coordinate()));

		const options = this._priceScale.options();
		if (!options.alignLabels) {
			return;
		}

		this._fixLabelOverlap(views, rendererOptions, center);
	}

	private _fixLabelOverlap(views: IPriceAxisView[], rendererOptions: Readonly<PriceAxisViewRendererOptions>, center: number): void {
		if (this._size === null) {
			return;
		}

		// 鎸夌収涓績绾挎媶鍒嗕负涓婁笅涓ょ粍锛岄槻姝㈣皟鏁存椂浜掔浉褰卞搷
		const top = views.filter((view: IPriceAxisView) => view.coordinate() <= center);
		const bottom = views.filter((view: IPriceAxisView) => view.coordinate() > center);

		// 涓婂崐鍖轰粠涓績鍚戦《閮ㄦ帓搴忥紝浼樺厛澶勭悊绂讳腑蹇冩渶杩戠殑鏍囩
		top.sort((l: IPriceAxisView, r: IPriceAxisView) => r.coordinate() - l.coordinate());

		// share center label
		if (top.length && bottom.length) {
			// 涓績鏍囩涓庝笅鍗婂尯鍏变韩锛岀‘淇濆眳涓」淇濇寔涓嶅姩
			bottom.push(top[0]);
		}

		// 涓嬪崐鍖轰粠涓績鍚戝簳閮ㄦ帓搴忥紝閫愪釜鎺ㄨ繘
		bottom.sort((l: IPriceAxisView, r: IPriceAxisView) => l.coordinate() - r.coordinate());

		for (const view of views) {
			const halfHeight = Math.floor(view.height(rendererOptions) / 2);
			const coordinate = view.coordinate();
			if (coordinate > -halfHeight && coordinate < halfHeight) {
				// 椤堕儴瓒婄晫鏃跺皢鏍囩鍥炴媺鑷冲彲瑙佽寖鍥村唴
				view.setFixedCoordinate(halfHeight);
			}

			if (coordinate > (this._size.height - halfHeight) && coordinate < this._size.height + halfHeight) {
				// 搴曢儴瓒婄晫鍚岀悊
				view.setFixedCoordinate(this._size.height - halfHeight);
			}
		}

		// 鑷腑蹇冨悜涓ょ鎺ㄨ繘锛屽埄鐢?recalculateOverlapping 鍒嗛厤鍓╀綑绌洪棿
		recalculateOverlapping(top, 1, this._size.height, rendererOptions);
		recalculateOverlapping(bottom, -1, this._size.height, rendererOptions);
	}

	private _drawBackLabels(target: CanvasRenderingTarget2D): void {
		if (this._size === null) {
			return;
		}

		// 鑳屾櫙鏍囩鍖呭惈绯诲垪涓庤鐩栧眰鐨勮嚜瀹氫箟娓叉煋缁撴灉
		const views = this._backLabels();

		const rendererOptions = this.rendererOptions();
		const align = this._isLeft ? 'right' : 'left';

		views.forEach((view: IPriceAxisView) => {
			if (view.isAxisLabelVisible()) {
				const renderer = view.renderer(ensureNotNull(this._priceScale));
				renderer.draw(target, rendererOptions, this._widthCache, align);
			}
		});
	}

	private _drawCrosshairLabel(target: CanvasRenderingTarget2D): void {
		if (this._size === null || this._priceScale === null) {
			return;
		}

		// 浜ゅ弶鍏夋爣鏍囩鍦ㄩ《灞傜嫭绔嬫覆鏌擄紝鎸佹湁澶氱粍瑙嗗浘
		const model = this._pane.chart().model();

		const views: IPriceAxisViewArray[] = []; // array of arrays
		const pane = this._pane.state();

		const v = model.crosshairSource().priceAxisViews(pane, this._priceScale);
		if (v.length) {
			views.push(v);
		}

		const ro = this.rendererOptions();
		const align = this._isLeft ? 'right' : 'left';

		views.forEach((arr: IPriceAxisViewArray) => {
			arr.forEach((view: IPriceAxisView) => {
				view.renderer(ensureNotNull(this._priceScale)).draw(target, ro, this._widthCache, align);
			});
		});
	}

	private _setCursor(type: CursorType): void {
		this._cell.style.cursor = type === CursorType.NsResize ? 'ns-resize' : 'default';
	}

	private _onMarksChanged(): void {
		const width = this.optimalWidth();

		// avoid price scale is shrunk
		// using < instead !== to avoid infinite changes
		if (this._prevOptimalWidth < width) {
			this._pane.chart().model().fullUpdate();
		}

		this._prevOptimalWidth = width;
	}

	private readonly _canvasSuggestedBitmapSizeChangedHandler = () => {
		if (this._isSettingSize) {
			return;
		}

		this._pane.chart().model().lightUpdate();
	};

	private readonly _topCanvasSuggestedBitmapSizeChangedHandler = () => {
		if (this._isSettingSize) {
			return;
		}

		this._pane.chart().model().lightUpdate();
	};

	private _baseFont(): string {
		return makeFont(this._layoutOptions.fontSize, this._layoutOptions.fontFamily);
	}
}

