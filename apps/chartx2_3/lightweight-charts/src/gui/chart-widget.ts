// fancy-canvas 鎻愪緵鐨勫昂瀵稿伐鍏凤紝鐢ㄤ簬澶勭悊 DPR 缂╂斁鍚庣殑瀹介珮
import { Size, size } from 'fancy-canvas';

import { ensureDefined, ensureNotNull } from '../helpers/assertions';
import { isChromiumBased, isWindows } from '../helpers/browsers';
import { Delegate } from '../helpers/delegate';
import { IDestroyable } from '../helpers/idestroyable';
import { ISubscription } from '../helpers/isubscription';
import { warn } from '../helpers/logger';
import { DeepPartial } from '../helpers/strict-type-checks';

import { ChartModel, ChartOptionsInternal, ChartOptionsInternalBase, IChartModelBase } from '../model/chart-model';
import { Coordinate } from '../typings/coordinate';
import { DefaultPriceScaleId } from '../model/default-price-scale';
import { IHorzScaleBehavior } from '../model/ihorz-scale-behavior';
import {
	InvalidateMask,
	InvalidationLevel,
	TimeScaleInvalidation,
	TimeScaleInvalidationType,
} from '../model/invalidate-mask';
import { Point } from '../model/point';
import { Series } from '../model/series';
import { SeriesPlotRow } from '../model/series-data';
import { SeriesType } from '../model/series-options';
import { TimePointIndex } from '../model/time-data';
import { TouchMouseEventData } from '../model/touch-mouse-event-data';

// 甯冨眬灏哄鎻愮ず鍑芥暟锛屽彲鏍规嵁 DPI/閰嶇疆浼扮畻鏈€缁堝昂瀵?
import { suggestChartSize, suggestPriceScaleWidth, suggestTimeScaleHeight } from './internal-layout-sizes-hints';
// Pane 鍒嗛殧鍣ㄤ笌闈㈡澘銆佹椂闂磋酱缁勪欢
import { PaneSeparator, SeparatorConstants } from './pane-separator';
import { PaneWidget } from './pane-widget';
import { TimeAxisWidget } from './time-axis-widget';

// 榧犳爣/瑙︽懜浜嬩欢浼犻€掔粰璁㈤槄鑰呯殑瀹屾暣涓婁笅鏂?
export interface MouseEventParamsImpl {
	// 瀵瑰簲鐨勫師濮嬫椂闂村埢搴︽暟鎹紙鍙兘鏄瓧绗︿覆/鏃ユ湡锛?
	originalTime?: unknown;
	index?: TimePointIndex;
	point?: Point;
	seriesData: Map<Series<SeriesType>, SeriesPlotRow<SeriesType>>;
	paneIndex?: number;
	hoveredSeries?: Series<SeriesType>;
	hoveredObject?: string;
	touchMouseEventData?: TouchMouseEventData;
}

export type MouseEventParamsImplSupplier = () => MouseEventParamsImpl;

// Windows + Chromium 缁勫悎瀛樺湪鐗规畩婊氳疆琛屼负锛岄渶瑕佸崟鐙鐞?
const windowsChrome = isChromiumBased() && isWindows();

export interface IChartWidgetBase {
	getPriceAxisWidth(position: DefaultPriceScaleId): number;
	model(): IChartModelBase;
	paneWidgets(): PaneWidget[];
	options(): ChartOptionsInternalBase;
	setCursorStyle(style: string | null): void;
}

export class ChartWidget<HorzScaleItem> implements IDestroyable, IChartWidgetBase {
	// 褰撳墠鍥捐〃鐨勯厤缃紙涓?ChartModel 鍏变韩寮曠敤锛?
	private readonly _options: ChartOptionsInternal<HorzScaleItem>;
	// 涓婚潰鏉垮垪琛紙姣忎釜 pane 瀵瑰簲涓€缁?series锛?
	private _paneWidgets: PaneWidget[] = [];
	// pane 涔嬮棿鐨勫垎闅旀潯锛屾敮鎸佹嫋鍔ㄨ皟鏁撮珮搴?
	private _paneSeparators: PaneSeparator[] = [];
	// 鏍稿績妯″瀷灞傦紝椹卞姩鐘舵€佹洿鏂?
	private readonly _model: ChartModel<HorzScaleItem>;
	// requestAnimationFrame 鐨勫彞鏌勶紝鐢ㄤ簬鍙栨秷鏈畬鎴愮殑閲嶇粯
	private _drawRafId: number = 0;
	private _height: number = 0;
	private _width: number = 0;
	private _leftPriceAxisWidth: number = 0;
	private _rightPriceAxisWidth: number = 0;
	// 鏍瑰鍣ㄥ厓绱狅紝鍖呭惈鎵€鏈?pane/timeAxis 琛ㄦ牸
	private _element: HTMLDivElement;
	private readonly _tableElement: HTMLElement;
	private _timeAxisWidget: TimeAxisWidget<HorzScaleItem>;
	// 缂撳瓨寰呭鐞嗙殑灞€閮ㄦ棤鏁堝寲鎺╃爜
	private _invalidateMask: InvalidateMask | null = null;
	private _drawPlanned: boolean = false;
	// 浜嬩欢濮旀墭锛氱偣鍑汇€佸弻鍑汇€佸崄瀛楃嚎绉诲姩
	private _clicked: Delegate<MouseEventParamsImplSupplier> = new Delegate();
	private _dblClicked: Delegate<MouseEventParamsImplSupplier> = new Delegate();
	private _crosshairMoved: Delegate<MouseEventParamsImplSupplier> = new Delegate();
	private _onWheelBound: (event: WheelEvent) => void;
	private _observer: ResizeObserver | null = null;

	private _container: HTMLElement;
	private _cursorStyleOverride: string | null = null;

	// 妯酱绛栫暐锛堟椂闂淬€佹敹鐩婄巼绛夎嚜瀹氫箟琛屼负锛?
	private readonly _horzScaleBehavior: IHorzScaleBehavior<HorzScaleItem>;

	public constructor(container: HTMLElement, options: ChartOptionsInternal<HorzScaleItem>, horzScaleBehavior: IHorzScaleBehavior<HorzScaleItem>) {
		// 淇濆瓨瀹夸富瀹瑰櫒涓庨厤缃紝妯酱绛栫暐鍏佽鑷畾涔夐€昏緫杞?
		this._container = container;
		this._options = options;
		this._horzScaleBehavior = horzScaleBehavior;

		// 鍒涘缓鏍瑰鍣ㄥ苟璁剧疆鍩虹鏍峰紡锛岀姝㈡枃鏈€変腑閬垮厤鎷栨嫿鍐茬獊
		this._element = document.createElement('div');
		this._element.classList.add('tv-lightweight-charts');
		this._element.style.overflow = 'hidden';
		this._element.style.direction = 'ltr';
		this._element.style.width = '100%';
		this._element.style.height = '100%';
		disableSelection(this._element);

		// 鍥捐〃鐢变竴涓?table 瀹炵幇甯冨眬锛歱ane 鍦ㄨ鍐咃紝浠锋牸杞?鏃堕棿杞村榻?
		this._tableElement = document.createElement('table');
		this._tableElement.setAttribute('cellspacing', '0');
		this._element.appendChild(this._tableElement);

		// 鏍规嵁閰嶇疆鍐冲畾鏄惁鐩戝惉婊氳疆浜嬩欢
		this._onWheelBound = this._onMousewheel.bind(this);
		if (shouldSubscribeMouseWheel(this._options)) {
			this._setMouseWheelEventListener(true);
		}
		// 鍒濆鍖栨ā鍨嬪眰锛屼紶鍏ユ棤鏁堝寲鍥炶皟涓庨€夐」
		this._model = new ChartModel(
			this._invalidateHandler.bind(this),
			this._options,
			horzScaleBehavior
		);
		// 杞彂鍗佸瓧绾跨Щ鍔ㄤ簨浠剁粰澶栭儴璁㈤槄鑰?
		this.model().crosshairMoved().subscribe(this._onPaneWidgetCrosshairMoved.bind(this), this);

		// 鍒涘缓鏃堕棿杞?widget 骞跺姞鍏ュ竷灞€
		this._timeAxisWidget = new TimeAxisWidget(this, this._horzScaleBehavior);
		this._tableElement.appendChild(this._timeAxisWidget.getElement());

		// autoSize 妯″紡涓嬪皾璇曞畨瑁?ResizeObserver
		const usedObserver = options.autoSize && this._installObserver();

		// Observer 鍙兘涓嶄細绔嬪嵆瑙﹀彂锛屽洜姝ら渶瑕佹墜鍔ㄥ彇鍒濆灏哄
		let width = this._options.width;
		let height = this._options.height;
		// 濡傛灉鍚敤浜?observer 鎴栨湭閰嶇疆鏄惧紡灏哄锛屽洖閫€鍒板鍣ㄥ昂瀵?
		if (usedObserver || width === 0 || height === 0) {
			const containerRect = container.getBoundingClientRect();
			width = width || containerRect.width;
			height = height || containerRect.height;
		}

		// 娉ㄦ剰锛氭瀯閫犳湡闂村繀椤诲厛 resize 鍐嶅悓姝ユā鍨嬶紝鍚﹀垯鏃堕棿杞翠笉浼氭纭皟鏁?
		this.resize(width, height);

		// 灏嗘ā鍨嬩腑鐨?pane 缁撴瀯鍚屾鍒?GUI 灞?
		this._syncGuiWithModel();

		// 灏嗗浘琛ㄦ牴鑺傜偣鎻掑叆瀹夸富瀹瑰櫒
		container.appendChild(this._element);
		this._updateTimeAxisVisibility();
		// 褰撴椂闂磋酱鎴栦环鏍艰酱閫夐」鍙樺寲鏃惰Е鍙戞暣鍥惧埛鏂?
		this._model.timeScale().optionsApplied().subscribe(this._model.fullUpdate.bind(this._model), this);
		this._model.priceScalesOptionsChanged().subscribe(this._model.fullUpdate.bind(this._model), this);
	}

	public model(): ChartModel<HorzScaleItem> {
		return this._model;
	}

	public options(): Readonly<ChartOptionsInternal<HorzScaleItem>> {
		return this._options;
	}

	public paneWidgets(): PaneWidget[] {
		return this._paneWidgets;
	}

	public timeAxisWidget(): TimeAxisWidget<HorzScaleItem> {
		return this._timeAxisWidget;
	}

	public destroy(): void {
		// 绉婚櫎浜嬩欢鐩戝惉銆侀槻姝㈤仐鐣欑殑 RAF
		this._setMouseWheelEventListener(false);
		if (this._drawRafId !== 0) {
			window.cancelAnimationFrame(this._drawRafId);
		}

		// 瑙ｉ櫎妯″瀷灞傝闃咃紝闃叉鍐呭瓨娉勬紡
		this._model.crosshairMoved().unsubscribeAll(this);
		this._model.timeScale().optionsApplied().unsubscribeAll(this);
		this._model.priceScalesOptionsChanged().unsubscribeAll(this);
		this._model.destroy();

		// 娓呯悊鎵€鏈?pane widget 涓庡垎闅斿櫒
		for (const paneWidget of this._paneWidgets) {
			this._tableElement.removeChild(paneWidget.getElement());
			paneWidget.clicked().unsubscribeAll(this);
			paneWidget.dblClicked().unsubscribeAll(this);
			paneWidget.destroy();
		}
		this._paneWidgets = [];

		for (const paneSeparator of this._paneSeparators) {
			this._destroySeparator(paneSeparator);
		}
		this._paneSeparators = [];

		ensureNotNull(this._timeAxisWidget).destroy();

		if (this._element.parentElement !== null) {
			this._element.parentElement.removeChild(this._element);
		}

		this._crosshairMoved.destroy();
		this._clicked.destroy();
		this._dblClicked.destroy();

		this._uninstallObserver();
	}

	public resize(width: number, height: number, forceRepaint: boolean = false): void {
		if (this._height === height && this._width === width) {
			return;
		}

		const sizeHint = suggestChartSize(size({ width, height }));

		// 鍚搁檮鍒板缓璁昂瀵革紙鑰冭檻 DPI/鏈€灏忛檺鍒讹級
		this._height = sizeHint.height;
		this._width = sizeHint.width;

		const heightStr = this._height + 'px';
		const widthStr = this._width + 'px';

		ensureNotNull(this._element).style.height = heightStr;
		ensureNotNull(this._element).style.width = widthStr;

		this._tableElement.style.height = heightStr;
		this._tableElement.style.width = widthStr;

		// 寮哄埗閲嶇粯浠呯敤浜庢埅鍥剧瓑鍦烘櫙锛屽惁鍒欎氦缁欐ā鍨嬭Е鍙戝閲忓埛鏂?
		if (forceRepaint) {
			this._drawImpl(InvalidateMask.full(), performance.now());
		} else {
			this._model.fullUpdate();
		}
	}

	public paint(invalidateMask?: InvalidateMask): void {
		if (invalidateMask === undefined) {
			invalidateMask = InvalidateMask.full();
		}

		for (let i = 0; i < this._paneWidgets.length; i++) {
			// Pane 鍚勮嚜浣跨敤瀵瑰簲鐨勬棤鏁堝寲绾у埆
			this._paneWidgets[i].paint(invalidateMask.invalidateForPane(i).level);
		}

		if (this._options.timeScale.visible) {
			// 鏃堕棿杞村崟鐙噸缁?
			this._timeAxisWidget.paint(invalidateMask.fullInvalidation());
		}
	}

	public applyOptions(options: DeepPartial<ChartOptionsInternal<HorzScaleItem>>): void {
		const currentlyHasMouseWheelListener = shouldSubscribeMouseWheel(this._options);

		// we don't need to merge options here because it's done in chart model
		// and since both model and widget share the same object it will be done automatically for widget as well
		// not ideal solution for sure, but it work's for now 炉\_(銉?_/炉
		this._model.applyOptions(options);

		const shouldHaveMouseWheelListener = shouldSubscribeMouseWheel(this._options);
		if (shouldHaveMouseWheelListener !== currentlyHasMouseWheelListener) {
			this._setMouseWheelEventListener(shouldHaveMouseWheelListener);
		}

		if (options['layout']?.panes) {
			// Pane 鐨勬媺浼告潈閲嶅彂鐢熷彉鍖栨椂鏇存柊鍒嗛殧绗︽牱寮?
			this._applyPanesOptions();
		}
		this._updateTimeAxisVisibility();

		this._applyAutoSizeOptions(options);
	}

	public clicked(): ISubscription<MouseEventParamsImplSupplier> {
		return this._clicked;
	}

	public dblClicked(): ISubscription<MouseEventParamsImplSupplier> {
		return this._dblClicked;
	}

	public crosshairMoved(): ISubscription<MouseEventParamsImplSupplier> {
		return this._crosshairMoved;
	}

	public takeScreenshot(addTopLayer: boolean = false): HTMLCanvasElement {
		if (this._invalidateMask !== null) {
			this._drawImpl(this._invalidateMask, performance.now());
			this._invalidateMask = null;
		}

		const screeshotBitmapSize = this._traverseLayout(null);
		const screenshotCanvas = document.createElement('canvas');
		screenshotCanvas.width = screeshotBitmapSize.width;
		screenshotCanvas.height = screeshotBitmapSize.height;

		const ctx = ensureNotNull(screenshotCanvas.getContext('2d'));
		this._traverseLayout(ctx, addTopLayer);

		return screenshotCanvas;
	}

	public getPriceAxisWidth(position: DefaultPriceScaleId): number {
		if (position === DefaultPriceScaleId.Left && !this._isLeftAxisVisible()) {
			return 0;
		}

		if (position === DefaultPriceScaleId.Right && !this._isRightAxisVisible()) {
			return 0;
		}

		if (this._paneWidgets.length === 0) {
			return 0;
		}

		// we don't need to worry about exactly pane widget here
		// because all pane widgets have the same width of price axis widget
		// see _adjustSizeImpl
		const priceAxisWidget = position === DefaultPriceScaleId.Left
			? this._paneWidgets[0].leftPriceAxisWidget()
			: this._paneWidgets[0].rightPriceAxisWidget();
		return ensureNotNull(priceAxisWidget).getWidth();
	}

	public autoSizeActive(): boolean {
		return this._options.autoSize && this._observer !== null;
	}

	public element(): HTMLDivElement {
		return this._element;
	}

	public setCursorStyle(style: string | null): void {
		this._cursorStyleOverride = style;
		if (this._cursorStyleOverride) {
			this.element().style.setProperty('cursor', style);
		} else {
			this.element().style.removeProperty('cursor');
		}
	}

	public getCursorOverrideStyle(): string | null {
		return this._cursorStyleOverride;
	}

	public paneSize(paneIndex: number): Size {
		return ensureDefined(this._paneWidgets[paneIndex]).getSize();
	}

	private _applyPanesOptions(): void {
		this._paneSeparators.forEach((separator: PaneSeparator) => {
			separator.update();
		});
	}

	// eslint-disable-next-line complexity
	private _applyAutoSizeOptions(options: DeepPartial<ChartOptionsInternal<HorzScaleItem>>): void {
		if (options.autoSize === undefined && this._observer && (options.width !== undefined || options.height !== undefined)) {
			warn(`You should turn autoSize off explicitly before specifying sizes; try adding options.autoSize: false to new options`);
			return;
		}
		if (options.autoSize && !this._observer) {
			// installing observer will override resize if successful
			this._installObserver();
		}

		if (options.autoSize === false && this._observer !== null) {
			this._uninstallObserver();
		}

		if (!options.autoSize && (options.width !== undefined || options.height !== undefined)) {
			this.resize(options.width || this._width, options.height || this._height);
		}
	}

	/**
	 * Traverses the widget's layout (pane and axis child widgets),
	 * draws the screenshot (if rendering context is passed) and returns the screenshot bitmap size
	 *
	 * @param ctx - if passed, used to draw the screenshot of widget
	 * @param addTopLayer - if true, the top layer with crosshair and primitives will be drawn
	 * @returns screenshot bitmap size
	 */
	private _traverseLayout(ctx: CanvasRenderingContext2D | null, addTopLayer?: boolean): Size {
		let totalWidth = 0;
		let totalHeight = 0;

		const firstPane = this._paneWidgets[0];

		// 鍦ㄦ埅鍥炬垨瀵煎嚭鏃讹紝闇€瑕佷緷娆＄粯鍒朵环鏍艰酱銆乸ane銆佸垎闅旀潯
		const drawPriceAxises = (position: 'left' | 'right', targetX: number) => {
			let targetY = 0;
			for (let paneIndex = 0; paneIndex < this._paneWidgets.length; paneIndex++) {
				const paneWidget = this._paneWidgets[paneIndex];
				const priceAxisWidget = ensureNotNull(position === 'left' ? paneWidget.leftPriceAxisWidget() : paneWidget.rightPriceAxisWidget());
				const bitmapSize = priceAxisWidget.getBitmapSize();
				if (ctx !== null) {
					// 灏嗕环鏍艰酱浣嶅浘鎷疯礉鍒扮洰鏍囩敾甯?
					priceAxisWidget.drawBitmap(ctx, targetX, targetY, addTopLayer);
				}
				targetY += bitmapSize.height;
				if (paneIndex < this._paneWidgets.length - 1) {
					const separator = this._paneSeparators[paneIndex];
					const separatorBitmapSize = separator.getBitmapSize();
					if (ctx !== null) {
						// 鍒嗛殧鏉＄揣闅忎环鏍艰酱缁樺埗锛屼繚璇侀珮搴︾疮绉竴鑷?
						separator.drawBitmap(ctx, targetX, targetY);
					}
					targetY += separatorBitmapSize.height;
				}
			}
		};

		// draw left price scale if exists
		if (this._isLeftAxisVisible()) {
			drawPriceAxises('left', 0);
			const leftAxisBitmapWidth = ensureNotNull(firstPane.leftPriceAxisWidget()).getBitmapSize().width;
			totalWidth += leftAxisBitmapWidth;
		}
		for (let paneIndex = 0; paneIndex < this._paneWidgets.length; paneIndex++) {
			const paneWidget = this._paneWidgets[paneIndex];
			const bitmapSize = paneWidget.getBitmapSize();
			if (ctx !== null) {
				// 渚濇缁樺埗姣忎釜 pane 鐨勪綅鍥?
				paneWidget.drawBitmap(ctx, totalWidth, totalHeight, addTopLayer);
			}
			totalHeight += bitmapSize.height;
			if (paneIndex < this._paneWidgets.length - 1) {
				const separator = this._paneSeparators[paneIndex];
				const separatorBitmapSize = separator.getBitmapSize();
				if (ctx !== null) {
					separator.drawBitmap(ctx, totalWidth, totalHeight);
				}
				totalHeight += separatorBitmapSize.height;
			}
		}
		const firstPaneBitmapWidth = firstPane.getBitmapSize().width;
		totalWidth += firstPaneBitmapWidth;

		// draw right price scale if exists
		if (this._isRightAxisVisible()) {
			drawPriceAxises('right', totalWidth);
			const rightAxisBitmapWidth = ensureNotNull(firstPane.rightPriceAxisWidget()).getBitmapSize().width;
			totalWidth += rightAxisBitmapWidth;
		}

		const drawStub = (position: 'left' | 'right', targetX: number, targetY: number) => {
			const stub = ensureNotNull(position === 'left' ? this._timeAxisWidget.leftStub() : this._timeAxisWidget.rightStub());
			stub.drawBitmap(ensureNotNull(ctx), targetX, targetY);
		};

		// draw time scale and stubs
		if (this._options.timeScale.visible) {
			const timeAxisBitmapSize = this._timeAxisWidget.getBitmapSize();

			if (ctx !== null) {
				let targetX = 0;
				if (this._isLeftAxisVisible()) {
					// 宸︿晶瀛樺湪浠锋牸杞存椂锛岃繕闇€缁樺埗鏃堕棿杞?stub
					drawStub('left', targetX, totalHeight);
					targetX = ensureNotNull(firstPane.leftPriceAxisWidget()).getBitmapSize().width;
				}

				this._timeAxisWidget.drawBitmap(ctx, targetX, totalHeight, addTopLayer);
				targetX += timeAxisBitmapSize.width;

				if (this._isRightAxisVisible()) {
					// 鍙充晶 stub 涓庢椂闂磋酱瀹藉害淇濇寔涓€鑷?
					drawStub('right', targetX, totalHeight);
				}
			}

			totalHeight += timeAxisBitmapSize.height;
		}

		return size({
			width: totalWidth,
			height: totalHeight,
		});
	}

	// eslint-disable-next-line complexity
	private _adjustSizeImpl(): void {
		// 閲嶆柊璁＄畻 pane 涓庝环鏍艰酱瀹藉害锛屾牴鎹?stretchFactor 鍒嗛厤楂樺害
		let totalStretch = 0;
		let leftPriceAxisWidth = 0;
		let rightPriceAxisWidth = 0;

		for (const paneWidget of this._paneWidgets) {
			if (this._isLeftAxisVisible()) {
				leftPriceAxisWidth = Math.max(
					leftPriceAxisWidth,
					ensureNotNull(paneWidget.leftPriceAxisWidget()).optimalWidth(),
					this._options.leftPriceScale.minimumWidth
				);
			}
			if (this._isRightAxisVisible()) {
				rightPriceAxisWidth = Math.max(
					rightPriceAxisWidth,
					ensureNotNull(paneWidget.rightPriceAxisWidget()).optimalWidth(),
					this._options.rightPriceScale.minimumWidth
				);
			}
			totalStretch += paneWidget.stretchFactor();
		}

		leftPriceAxisWidth = suggestPriceScaleWidth(leftPriceAxisWidth);
		rightPriceAxisWidth = suggestPriceScaleWidth(rightPriceAxisWidth);

		const width = this._width;
		const height = this._height;

		const paneWidth = Math.max(width - leftPriceAxisWidth - rightPriceAxisWidth, 0);

		const separatorCount = this._paneSeparators.length;
		const separatorHeight = SeparatorConstants.SeparatorHeight;
		const separatorsHeight = separatorHeight * separatorCount;
		const timeAxisVisible = this._options.timeScale.visible;
		let timeAxisHeight = timeAxisVisible ? Math.max(this._timeAxisWidget.optimalHeight(), this._options.timeScale.minimumHeight) : 0;
		timeAxisHeight = suggestTimeScaleHeight(timeAxisHeight);

		const otherWidgetHeight = separatorsHeight + timeAxisHeight;
		const totalPaneHeight = height < otherWidgetHeight ? 0 : height - otherWidgetHeight;
		const stretchPixels = totalPaneHeight / totalStretch;

		let accumulatedHeight = 0;

		const pixelRatio = window.devicePixelRatio || 1;

		for (let paneIndex = 0; paneIndex < this._paneWidgets.length; ++paneIndex) {
			const paneWidget = this._paneWidgets[paneIndex];
			paneWidget.setState(this._model.panes()[paneIndex]);

			let paneHeight = 0;
			let calculatePaneHeight = 0;

			if (paneIndex === this._paneWidgets.length - 1) {
				// 鏈€鍚庝竴琛屼娇鐢ㄥ墿浣欓珮搴︼紝閬垮厤鍍忕礌鑸嶅叆瀵艰嚧鎬婚珮搴︿笉涓€鑷?
				calculatePaneHeight = Math.ceil((totalPaneHeight - accumulatedHeight) * pixelRatio) / pixelRatio;
			} else {
				calculatePaneHeight = Math.round(paneWidget.stretchFactor() * stretchPixels * pixelRatio) / pixelRatio;
			}

			paneHeight = Math.max(calculatePaneHeight, 2);

			accumulatedHeight += paneHeight;

			paneWidget.setSize(size({ width: paneWidth, height: paneHeight }));
			if (this._isLeftAxisVisible()) {
				paneWidget.setPriceAxisSize(leftPriceAxisWidth, 'left');
			}
			if (this._isRightAxisVisible()) {
				paneWidget.setPriceAxisSize(rightPriceAxisWidth, 'right');
			}

			if (paneWidget.state()) {
				// 鍚屾楂樺害鍥炴ā鍨嬪眰锛屼緵 autoscale/mouse hit 浣跨敤
				this._model.setPaneHeight(paneWidget.state(), paneHeight);
			}
		}

		this._timeAxisWidget.setSizes(
			size({ width: timeAxisVisible ? paneWidth : 0, height: timeAxisHeight }),
			timeAxisVisible ? leftPriceAxisWidth : 0,
			timeAxisVisible ? rightPriceAxisWidth : 0
		);

		this._model.setWidth(paneWidth);
		if (this._leftPriceAxisWidth !== leftPriceAxisWidth) {
			this._leftPriceAxisWidth = leftPriceAxisWidth;
		}
		if (this._rightPriceAxisWidth !== rightPriceAxisWidth) {
			this._rightPriceAxisWidth = rightPriceAxisWidth;
		}
	}

	private _setMouseWheelEventListener(add: boolean): void {
		if (add) {
			// 鏌愪簺鍦烘櫙锛堢鐢ㄦ粴杞缉鏀?婊氬姩锛夊彲鍔ㄦ€佹挙閿€鐩戝惉
			this._element.addEventListener('wheel', this._onWheelBound, { passive: false });
			return;
		}
		this._element.removeEventListener('wheel', this._onWheelBound);
	}

	private _determineWheelSpeedAdjustment(event: WheelEvent): number {
		switch (event.deltaMode) {
			case event.DOM_DELTA_PAGE:
				// one screen at time scroll mode
				return 120;
			case event.DOM_DELTA_LINE:
				// one line at time scroll mode
				return 32;
		}

		if (!windowsChrome) {
			return 1;
		}

		// Chromium on Windows has a bug where the scroll speed isn't correctly
		// adjusted for high density displays. We need to correct for this so that
		// scroll speed is consistent between browsers.
		// https://bugs.chromium.org/p/chromium/issues/detail?id=1001735
		// https://bugs.chromium.org/p/chromium/issues/detail?id=1207308
		// 璋冩暣鍊间笌 DPR 鎴愬弽姣旓紝鎶垫秷绯荤粺缂╂斁褰卞搷
		return (1 / window.devicePixelRatio);
	}

	private _onMousewheel(event: WheelEvent): void {
		if ((event.deltaX === 0 || !this._options['handleScroll'].mouseWheel) &&
			(event.deltaY === 0 || !this._options['handleScale'].mouseWheel)) {
			return;
		}

		const scrollSpeedAdjustment = this._determineWheelSpeedAdjustment(event);

		const deltaX = scrollSpeedAdjustment * event.deltaX / 100;
		const deltaY = -(scrollSpeedAdjustment * event.deltaY / 100);

		if (event.cancelable) {
			event.preventDefault();
		}

		if (deltaY !== 0 && this._options['handleScale'].mouseWheel) {
			// deltaY 鍚戜笂/鍚戜笅缂╂斁锛孧ath.sign 鎺у埗缂╂斁鏂瑰悜
			const zoomScale = Math.sign(deltaY) * Math.min(1, Math.abs(deltaY));
			const scrollPosition = event.clientX - this._element.getBoundingClientRect().left;
			this.model().zoomTime(scrollPosition as Coordinate, zoomScale);
		}

		if (deltaX !== 0 && this._options['handleScroll'].mouseWheel) {
			// 婊氳疆姘村钩鍋忕Щ杞崲涓洪€昏緫婊氬姩璺濈锛岀郴鏁版簮浜庡巻鍙茬粡楠屽€?
			this.model().scrollChart(deltaX * -80 as Coordinate); // 80 is a made up coefficient, and minus is for the "natural" scroll
		}
	}

	private _drawImpl(invalidateMask: InvalidateMask, time: number): void {
		const invalidationType = invalidateMask.fullInvalidation();

		// actions for full invalidation ONLY (not shared with light)
		if (invalidationType === InvalidationLevel.Full) {
			// pane 鏁伴噺銆佷环鏍艰酱甯冨眬鍙兘鍙戠敓鍙樺寲锛岄渶瀹屽叏鍚屾
			this._updateGui();
		}

		// light or full invalidate actions
		if (
			invalidationType === InvalidationLevel.Full ||
			invalidationType === InvalidationLevel.Light
		) {
			// momentary auto-scale 鍙湪鐩爣 pane 鏍囪浜?autoScale 鏃舵墽琛?
			this._applyMomentaryAutoScale(invalidateMask);
			this._applyTimeScaleInvalidations(invalidateMask, time);

			this._timeAxisWidget.update();
			this._paneWidgets.forEach((pane: PaneWidget) => {
				pane.updatePriceAxisWidgets();
			});

			// In the case a full invalidation has been postponed during the draw, reapply
			// the timescale invalidations. A full invalidation would mean there is a change
			// in the timescale width (caused by price scale changes) that needs to be drawn
			// right away to avoid flickering.
			if (this._invalidateMask?.fullInvalidation() === InvalidationLevel.Full) {
				this._invalidateMask.merge(invalidateMask);

				this._updateGui();

				this._applyMomentaryAutoScale(this._invalidateMask);
				this._applyTimeScaleInvalidations(this._invalidateMask, time);

				invalidateMask = this._invalidateMask;
				this._invalidateMask = null;
			}
		}

		this.paint(invalidateMask);
	}

	private _applyTimeScaleInvalidations(invalidateMask: InvalidateMask, time: number): void {
		// 鎸夐『搴忔墽琛屾墍鏈夋椂闂磋酱鐨勬棤鏁堝寲浜嬩欢锛岀‘淇濆姩鐢?缂╂斁骞虫粦
		for (const tsInvalidation of invalidateMask.timeScaleInvalidations()) {
			this._applyTimeScaleInvalidation(tsInvalidation, time);
		}
	}

	private _applyMomentaryAutoScale(invalidateMask: InvalidateMask): void {
		const panes = this._model.panes();
		for (let i = 0; i < panes.length; i++) {
			if (invalidateMask.invalidateForPane(i).autoScale) {
				// 鏍规嵁褰撳墠鍙鏁版嵁璁＄畻涓存椂浠锋牸鑼冨洿
				panes[i].momentaryAutoScale();
			}
		}
	}

	private _applyTimeScaleInvalidation(invalidation: TimeScaleInvalidation, time: number): void {
		const timeScale = this._model.timeScale();
		switch (invalidation.type) {
			case TimeScaleInvalidationType.FitContent:
				timeScale.fitContent();
				break;
			case TimeScaleInvalidationType.ApplyRange:
				timeScale.setLogicalRange(invalidation.value);
				break;
			case TimeScaleInvalidationType.ApplyBarSpacing:
				timeScale.setBarSpacing(invalidation.value);
				break;
			case TimeScaleInvalidationType.ApplyRightOffset:
				timeScale.setRightOffset(invalidation.value);
				break;
			case TimeScaleInvalidationType.Reset:
				timeScale.restoreDefault();
				break;
			case TimeScaleInvalidationType.Animation:
				// 鍔ㄧ敾鏈粨鏉熸椂鏍规嵁鏃堕棿鎴虫彃鍊煎嚭褰撳墠浣嶇疆
				if (!invalidation.value.finished(time)) {
					timeScale.setRightOffset(invalidation.value.getPosition(time));
				}
				break;
		}
	}

	private _invalidateHandler(invalidateMask: InvalidateMask): void {
		// 澶氭 invalidation 鍚堝苟锛岄伩鍏嶉噸澶嶇粯鍒?
		if (this._invalidateMask !== null) {
			this._invalidateMask.merge(invalidateMask);
		} else {
			this._invalidateMask = invalidateMask;
		}

		if (!this._drawPlanned) {
			this._drawPlanned = true;
			this._drawRafId = window.requestAnimationFrame((time: number) => {
				this._drawPlanned = false;
				this._drawRafId = 0;

				if (this._invalidateMask !== null) {
					const mask = this._invalidateMask;
					this._invalidateMask = null;
					this._drawImpl(mask, time);

					for (const tsInvalidation of mask.timeScaleInvalidations()) {
						if (tsInvalidation.type === TimeScaleInvalidationType.Animation && !tsInvalidation.value.finished(time)) {
							// 鍔ㄧ敾浠嶆湭缁撴潫鏃讹紝缁х画浜ょ粰妯″瀷鐨勫姩鐢婚┍鍔ㄥ畾鏃跺櫒
							this.model().setTimeScaleAnimation(tsInvalidation.value);
							break;
						}
					}
				}
			});
		}
	}

	private _updateGui(): void {
		// 鍚屾 pane/state 鏁伴噺鍙婂昂瀵?
		this._syncGuiWithModel();
	}

	private _destroySeparator(separator: PaneSeparator): void {
		this._tableElement.removeChild(separator.getElement());
		separator.destroy();
	}

	private _syncGuiWithModel(): void {
		const panes = this._model.panes();
		const targetPaneWidgetsCount = panes.length;
		const actualPaneWidgetsCount = this._paneWidgets.length;

		// --- Step 1: 绉婚櫎澶氫綑 pane widget 涓庡垎闅旀潯 ---
		// Remove (if needed) pane widgets and separators
		for (let i = targetPaneWidgetsCount; i < actualPaneWidgetsCount; i++) {
			const paneWidget = ensureDefined(this._paneWidgets.pop());
			this._tableElement.removeChild(paneWidget.getElement());
			paneWidget.clicked().unsubscribeAll(this);
			paneWidget.dblClicked().unsubscribeAll(this);
			paneWidget.destroy();

			const paneSeparator = this._paneSeparators.pop();
			if (paneSeparator !== undefined) {
				this._destroySeparator(paneSeparator);
			}
		}

		// --- Step 2: 鍒涘缓缂哄け鐨?pane widget锛屽苟鍦ㄥ叾涓婃柟鎻掑叆鍒嗛殧鏉?---
		// Create (if needed) new pane widgets and separators
		for (let i = actualPaneWidgetsCount; i < targetPaneWidgetsCount; i++) {
			const paneWidget = new PaneWidget(this, panes[i]);
			paneWidget.clicked().subscribe(this._onPaneWidgetClicked.bind(this, paneWidget), this);
			paneWidget.dblClicked().subscribe(this._onPaneWidgetDblClicked.bind(this, paneWidget), this);

			this._paneWidgets.push(paneWidget);

			// create and insert separator
			if (i > 0) {
				// 鍒嗛殧鏉′綅浜?pane 琛屼箣闂达紝鎻掑叆鍦ㄦ椂闂磋酱涔嬪墠
				const paneSeparator = new PaneSeparator(this, i - 1, i);
				this._paneSeparators.push(paneSeparator);
				this._tableElement.insertBefore(paneSeparator.getElement(), this._timeAxisWidget.getElement());
			}

			// insert paneWidget
			// pane 琛岀揣璐存椂闂磋酱涔嬩笂锛屼繚鎸佸竷灞€椤哄簭锛歱ane -> separator -> time axis
			this._tableElement.insertBefore(paneWidget.getElement(), this._timeAxisWidget.getElement());
		}

		// --- Step 3: 纭繚 widget 涓?pane state 缁戝畾涓€鑷?---
		for (let i = 0; i < targetPaneWidgetsCount; i++) {
			const state = panes[i];
			const paneWidget = this._paneWidgets[i];
			if (paneWidget.state() !== state) {
				// pane 鏂板垱寤烘垨妯″瀷鏇挎崲鏃堕噸鏂版寕鎺ョ姸鎬?
				paneWidget.setState(state);
			} else {
				// 浠锋牸杞村彲瑙佹€у彲鑳芥敼鍙橈紝鍗充究 state 鏈浛鎹篃闇€鍒锋柊
				paneWidget.updatePriceAxisWidgetsStates();
			}
		}

		// --- Step 4: 鏍规嵁鏈€鏂扮粨鏋勬洿鏂版椂闂磋酱鍙鎬у苟閲嶇畻灏哄 ---
		this._updateTimeAxisVisibility();
		this._adjustSizeImpl();
	}

	private _getMouseEventParamsImpl(
		index: TimePointIndex | null,
		point: Point | null,
		event: TouchMouseEventData | null,
		pane?: PaneWidget
	): MouseEventParamsImpl {
		const seriesData = new Map<Series<SeriesType>, SeriesPlotRow<SeriesType>>();
		if (index !== null) {
			const serieses = this._model.serieses();
			serieses.forEach((s: Series<SeriesType>) => {
				// TODO: replace with search left
				// 鏍规嵁绱㈠紩鏌ユ壘瀵瑰簲搴忓垪鐨?plot 鏁版嵁锛屽～鍏呭埌浜嬩欢鍥炶皟涓?
				const data = s.bars().search(index);
				if (data !== null) {
					seriesData.set(s, data);
				}
			});
		}
		let clientTime: unknown;
		if (index !== null) {
			const timePoint = this._model.timeScale().indexToTimeScalePoint(index)?.originalTime;
			if (timePoint !== undefined) {
				clientTime = timePoint;
			}
		}

		const hoveredSource = this.model().hoveredSource();

		const hoveredSeries = hoveredSource !== null && hoveredSource.source instanceof Series
			? hoveredSource.source
			: undefined;

		const hoveredObject = hoveredSource !== null && hoveredSource.object !== undefined
			? hoveredSource.object.externalId
			: undefined;

		const paneIndex = this._getPaneIndex(pane);

		return {
			originalTime: clientTime,
			index: index ?? undefined,
			point: point ?? undefined,
			paneIndex: paneIndex !== -1 ? paneIndex : undefined,
			hoveredSeries,
			seriesData,
			hoveredObject,
			touchMouseEventData: event ?? undefined,
		};
	}

	private _getPaneIndex(pane?: PaneWidget): number {
		let paneIndex = -1;

		if (pane) {
			paneIndex = this._paneWidgets.indexOf(pane);
		} else {
			const crosshairPane = this.model().crosshairSource().pane();
			if (crosshairPane !== null) {
				paneIndex = this.model().panes().indexOf(crosshairPane);
			}
		}
		return paneIndex;
	}

	private _onPaneWidgetClicked(
		pane: PaneWidget,
		time: TimePointIndex | null,
		point: Point | null,
		event: TouchMouseEventData
	): void {
		// 浜嬩欢鍥炶皟寤惰繜鍙栧€硷細澶栭儴璁㈤槄鑰呰皟鐢?supplier 鏃跺啀缁勮鏁版嵁
		this._clicked.fire(() => this._getMouseEventParamsImpl(time, point, event, pane));
	}

	private _onPaneWidgetDblClicked(
		pane: PaneWidget,
		time: TimePointIndex | null,
		point: Point | null,
		event: TouchMouseEventData
	): void {
		this._dblClicked.fire(() => this._getMouseEventParamsImpl(time, point, event, pane));
	}

	private _onPaneWidgetCrosshairMoved(
		time: TimePointIndex | null,
		point: Point | null,
		event: TouchMouseEventData | null
	): void {
		// 鎸夋偓鍋滄簮鐨?cursorStyle 璁剧疆鍏夋爣锛屼繚鎸佷笌瑕嗙洊鍥惧舰涓€鑷?
		this.setCursorStyle(this.model().hoveredSource()?.cursorStyle ?? null);
		this._crosshairMoved.fire(() => this._getMouseEventParamsImpl(time, point, event));
	}

	private _updateTimeAxisVisibility(): void {
		// 闅愯棌鏃堕棿杞存椂涓嶅崰甯冨眬绌洪棿
		const display = this._options.timeScale.visible ? '' : 'none';
		this._timeAxisWidget.getElement().style.display = display;
	}

	private _isLeftAxisVisible(): boolean {
		// 浠锋牸杞村彲瑙佹€т互绗竴涓?pane 鐨勯厤缃负鍑嗭紙鎵€鏈?pane 鍚屾锛?
		return this._paneWidgets[0].state().leftPriceScale().options().visible;
	}

	private _isRightAxisVisible(): boolean {
		return this._paneWidgets[0].state().rightPriceScale().options().visible;
	}

	private _installObserver(): boolean {
		// eslint-disable-next-line no-restricted-syntax
		if (!('ResizeObserver' in window)) {
			warn('Options contains "autoSize" flag, but the browser does not support ResizeObserver feature. Please provide polyfill.');
			return false;
		} else {
			// 瑙傚療瀹瑰櫒灏哄鍙樺寲锛岃嚜鍔ㄨЕ鍙?resize
			this._observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
				// There is no need to check if entry.target === this._container since there is only
				// a single element being observed.
				// and we want to use the last entry (if multiple) because it would be most up to date
				// (since the browser may batch multiple updates).
				const containerEntry = entries[entries.length - 1];
				if (!containerEntry) {
					// this may be undefined if the entries array was empty.
					return;
				}
				this.resize(containerEntry.contentRect.width, containerEntry.contentRect.height);
			});
			this._observer.observe(this._container, { box: 'border-box' });
			return true;
		}
	}

	private _uninstallObserver(): void {
		if (this._observer !== null) {
			this._observer.disconnect();
		}
		this._observer = null;
	}
}

function disableSelection(element: HTMLElement): void {
	// 绂佺敤娴忚鍣ㄩ粯璁ょ殑鏂囨湰閫変腑锛屼互鍏嶆嫋鍔ㄥ浘琛ㄦ椂鍑虹幇钃濊壊閫夊尯
	element.style.userSelect = 'none';
	// eslint-disable-next-line deprecation/deprecation
	element.style.webkitUserSelect = 'none';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-member-access
	(element.style as any).msUserSelect = 'none';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-member-access
	(element.style as any).MozUserSelect = 'none';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-member-access
	(element.style as any).webkitTapHighlightColor = 'transparent';
}

function shouldSubscribeMouseWheel<HorzScaleItem>(options: ChartOptionsInternal<HorzScaleItem>): boolean {
	// handleScroll/handleScale 浠讳竴鍚敤婊氳疆锛屾墠闇€瑕佹敞鍐岀洃鍚?
	return Boolean(options['handleScroll'].mouseWheel || options['handleScale'].mouseWheel);
}

