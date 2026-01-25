/// <reference types="_build-time-constants" />

import { assert, ensureNotNull } from '../helpers/assertions';
import { Delegate } from '../helpers/delegate';
import { IDestroyable } from '../helpers/idestroyable';
import { ISubscription } from '../helpers/isubscription';
import { DeepPartial, merge } from '../helpers/strict-type-checks';

import { PriceAxisViewRendererOptions } from '../renderers/iprice-axis-view-renderer';
import { PriceAxisRendererOptionsProvider } from '../renderers/price-axis-renderer-options-provider';

import { ColorParser } from './colors';
import { Coordinate } from './coordinate';
import { Crosshair, CrosshairOptions } from './crosshair';
import { DefaultPriceScaleId, isDefaultPriceScale } from './default-price-scale';
import { GridOptions } from './grid';
import { IPrimitiveHitTestSource } from './idata-source';
import { IHorzScaleBehavior, InternalHorzScaleItem } from './ihorz-scale-behavior';
import { InvalidateMask, InvalidationLevel, ITimeScaleAnimation } from './invalidate-mask';
import { IPriceDataSource } from './iprice-data-source';
import { ISeries } from './iseries';
import { ColorType, LayoutOptions } from './layout-options';
import { LocalizationOptions, LocalizationOptionsBase } from './localization-options';
import { Magnet } from './magnet';
import { DEFAULT_STRETCH_FACTOR, MIN_PANE_HEIGHT, Pane } from './pane';
import { hitTestPane } from './pane-hit-test';
import { Point } from './point';
import { PriceScale, PriceScaleOptions } from './price-scale';
import { Series } from './series';
import { SeriesType } from './series-options';
import { LogicalRange, TimePointIndex, TimeScalePoint } from './time-data';
import { HorzScaleOptions, ITimeScale, TimeScale } from './time-scale';
import { TouchMouseEventData } from './touch-mouse-event-data';

/**
 * Represents options for how the chart is scrolled by the mouse and touch gestures.
 */
export interface HandleScrollOptions {
	/**
	 * Enable scrolling with the mouse wheel.
	 *
	 * @defaultValue `true`
	 */
	mouseWheel: boolean;

	/**
	 * Enable scrolling by holding down the left mouse button and moving the mouse.
	 *
	 * @defaultValue `true`
	 */
	pressedMouseMove: boolean;

	/**
	 * Enable horizontal touch scrolling.
	 *
	 * When enabled the chart handles touch gestures that would normally scroll the webpage horizontally.
	 *
	 * @defaultValue `true`
	 */
	horzTouchDrag: boolean;

	/**
	 * Enable vertical touch scrolling.
	 *
	 * When enabled the chart handles touch gestures that would normally scroll the webpage vertically.
	 *
	 * @defaultValue `true`
	 */
	vertTouchDrag: boolean;
}

/**
 * Represents options for how the chart is scaled by the mouse and touch gestures.
 */
export interface HandleScaleOptions {
	/**
	 * Enable scaling with the mouse wheel.
	 *
	 * @defaultValue `true`
	 */
	mouseWheel: boolean;

	/**
	 * Enable scaling with pinch/zoom gestures.
	 *
	 * @defaultValue `true`
	 */
	pinch: boolean;

	/**
	 * Enable scaling the price and/or time scales by holding down the left mouse button and moving the mouse.
	 */
	axisPressedMouseMove: AxisPressedMouseMoveOptions | boolean;

	/**
	 * Enable resetting scaling by double-clicking the left mouse button.
	 */
	axisDoubleClickReset: AxisDoubleClickOptions | boolean;
}

/**
 * Represents options for enabling or disabling kinetic scrolling with mouse and touch gestures.
 */
export interface KineticScrollOptions {
	/**
	 * Enable kinetic scroll with touch gestures.
	 *
	 * @defaultValue `true`
	 */
	touch: boolean;

	/**
	 * Enable kinetic scroll with the mouse.
	 *
	 * @defaultValue `false`
	 */
	mouse: boolean;
}

type HandleScaleOptionsInternal =
	Omit<HandleScaleOptions, 'axisPressedMouseMove' | 'axisDoubleClickReset'>
	& {
		/** @public */
		axisPressedMouseMove: AxisPressedMouseMoveOptions;

		/** @public */
		axisDoubleClickReset: AxisDoubleClickOptions;
	};

/**
 * Represents options for how the time and price axes react to mouse movements.
 */
export interface AxisPressedMouseMoveOptions {
	/**
	 * Enable scaling the time axis by holding down the left mouse button and moving the mouse.
	 *
	 * @defaultValue `true`
	 */
	time: boolean;

	/**
	 * Enable scaling the price axis by holding down the left mouse button and moving the mouse.
	 *
	 * @defaultValue `true`
	 */
	price: boolean;
}

/**
 * Represents options for how the time and price axes react to mouse double click.
 */
export interface AxisDoubleClickOptions {
	/**
	 * Enable resetting scaling the time axis by double-clicking the left mouse button.
	 *
	 * @defaultValue `true`
	 */
	time: boolean;

	/**
	 * Enable reseting scaling the price axis by by double-clicking the left mouse button.
	 *
	 * @defaultValue `true`
	 */
	price: boolean;
}

export interface HoveredObject {
	hitTestData?: unknown;
	externalId?: string;
}

export interface HoveredSource {
	source: IPriceDataSource | IPrimitiveHitTestSource;
	object?: HoveredObject;
	cursorStyle?: string | null;
}

export interface PriceScaleOnPane {
	priceScale: PriceScale;
	pane: Pane;
}

const enum BackgroundColorSide {
	Top,
	Bottom,
}

type InvalidateHandler = (mask: InvalidateMask) => void;

/**
 * Represents a visible price scale's options.
 *
 * @see {@link PriceScaleOptions}
 */
export type VisiblePriceScaleOptions = PriceScaleOptions;

/**
 * Represents overlay price scale options.
 */
export type OverlayPriceScaleOptions = Omit<PriceScaleOptions, 'visible' | 'autoScale'>;

/**
 * Determine how to exit the tracking mode.
 *
 * By default, mobile users will long press to deactivate the scroll and have the ability to check values and dates.
 * Another press is required to activate the scroll, be able to move left/right, zoom, etc.
 */
export const enum TrackingModeExitMode {
	/**
	 * Tracking Mode will be deactivated on touch end event.
	 */
	OnTouchEnd,
	/**
	 * Tracking Mode will be deactivated on the next tap event.
	 */
	OnNextTap,
}

/**
 * Represent options for the tracking mode's behavior.
 *
 * Mobile users will not have the ability to see the values/dates like they do on desktop.
 * To see it, they should enter the tracking mode. The tracking mode will deactivate the scrolling
 * and make it possible to check values and dates.
 */
export interface TrackingModeOptions {
	// eslint-disable-next-line tsdoc/syntax
	/** @inheritDoc TrackingModeExitMode
	 *
	 * @defaultValue {@link TrackingModeExitMode.OnNextTap}
	 */
	exitMode: TrackingModeExitMode;
}

/**
 * Represents common chart options
 */
export interface ChartOptionsBase {
	/**
	 * Width of the chart in pixels
	 *
	 * @defaultValue If `0` (default) or none value provided, then a size of the widget will be calculated based its container's size.
	 */
	width: number;

	/**
	 * Height of the chart in pixels
	 *
	 * @defaultValue If `0` (default) or none value provided, then a size of the widget will be calculated based its container's size.
	 */
	height: number;

	/**
	 * Setting this flag to `true` will make the chart watch the chart container's size and automatically resize the chart to fit its container whenever the size changes.
	 *
	 * This feature requires [`ResizeObserver`](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver) class to be available in the global scope.
	 * Note that calling code is responsible for providing a polyfill if required. If the global scope does not have `ResizeObserver`, a warning will appear and the flag will be ignored.
	 *
	 * Please pay attention that `autoSize` option and explicit sizes options `width` and `height` don't conflict with one another.
	 * If you specify `autoSize` flag, then `width` and `height` options will be ignored unless `ResizeObserver` has failed. If it fails then the values will be used as fallback.
	 *
	 * The flag `autoSize` could also be set with and unset with `applyOptions` function.
	 * ```js
	 * const chart = LightweightCharts.createChart(document.body, {
	 *     autoSize: true,
	 * });
	 * ```
	 */
	autoSize: boolean;

	/**
	 * Layout options
	 */
	layout: LayoutOptions;

	/**
	 * Left price scale options
	 */
	leftPriceScale: VisiblePriceScaleOptions;
	/**
	 * Right price scale options
	 */
	rightPriceScale: VisiblePriceScaleOptions;
	/**
	 * Overlay price scale options
	 */
	overlayPriceScales: OverlayPriceScaleOptions;

	/**
	 * Time scale options
	 */
	timeScale: HorzScaleOptions;

	/**
	 * The crosshair shows the intersection of the price and time scale values at any point on the chart.
	 *
	 */
	crosshair: CrosshairOptions;

	/**
	 * A grid is represented in the chart background as a vertical and horizontal lines drawn at the levels of visible marks of price and the time scales.
	 */
	grid: GridOptions;

	/**
	 * Scroll options, or a boolean flag that enables/disables scrolling
	 */
	handleScroll: HandleScrollOptions | boolean;

	/**
	 * Scale options, or a boolean flag that enables/disables scaling
	 */
	handleScale: HandleScaleOptions | boolean;

	/**
	 * Kinetic scroll options
	 */
	kineticScroll: KineticScrollOptions;

	// eslint-disable-next-line tsdoc/syntax
	/** @inheritDoc TrackingModeOptions
	 */
	trackingMode: TrackingModeOptions;

	/**
	 * Basic localization options
	 */
	localization: LocalizationOptionsBase;

	/**
	 * Whether to add a default pane to the chart
	 * Disable this option when you want to create a chart with no panes and add them manually
	 * @defaultValue `true`
	 */
	addDefaultPane: boolean;
}

/**
 * Structure describing options of the chart. Series options are to be set separately
 */
export interface ChartOptionsImpl<HorzScaleItem> extends ChartOptionsBase {

	/**
	 * Localization options.
	 */
	localization: LocalizationOptions<HorzScaleItem>;
}

/**
 * These properties should not be renamed by `ts-transformer-properties-rename`.
 * To ensure that this is respected in all places, please only use the
 * ['name'] syntax to read or write these properties.
 */
interface ChartOptionsInternalFixedNames {
	/**
	 * **Only access using ['handleScroll']**
	 * @public
	 */
	handleScroll: HandleScrollOptions;
	/**
	 * **Only access using ['handleScale']**
	 * @public
	 */
	handleScale: HandleScaleOptionsInternal;
	/**
	 * **Only access using ['layout']**
	 * @public
	 */
	layout: LayoutOptions;
}

export type ChartOptionsInternalBase =
	Omit<ChartOptionsBase, 'handleScroll' | 'handleScale' | 'layout'>
	& ChartOptionsInternalFixedNames;

export type ChartOptionsInternal<HorzScaleItem> =
	Omit<ChartOptionsImpl<HorzScaleItem>, 'handleScroll' | 'handleScale' | 'layout'>
	& ChartOptionsInternalFixedNames;

interface GradientColorsCache {
	topColor: string;
	bottomColor: string;
	colors: Map<number, string>;
}

export interface IChartModelBase {
	applyPriceScaleOptions(priceScaleId: string, options: DeepPartial<PriceScaleOptions>, paneIndex?: number): void;
	findPriceScale(priceScaleId: string, paneIndex: number): PriceScaleOnPane | null;
	options(): Readonly<ChartOptionsInternalBase>;
	timeScale(): ITimeScale;
	serieses(): readonly Series<SeriesType>[];

	updateSource(source: IPriceDataSource): void;
	updateCrosshair(): void;
	cursorUpdate(): void;
	clearCurrentPosition(): void;
	setAndSaveCurrentPosition(x: Coordinate, y: Coordinate, event: TouchMouseEventData | null, pane: Pane): void;

	recalculatePane(pane: Pane | null): void;

	lightUpdate(): void;
	fullUpdate(): void;

	backgroundBottomColor(): string;
	backgroundTopColor(): string;
	backgroundColorAtYPercentFromTop(percent: number): string;

	paneForSource(source: IPriceDataSource): Pane | null;
	moveSeriesToScale(series: ISeries<SeriesType>, targetScaleId: string): void;

	priceAxisRendererOptions(): Readonly<PriceAxisViewRendererOptions>;
	rendererOptionsProvider(): PriceAxisRendererOptionsProvider;

	priceScalesOptionsChanged(): ISubscription;

	hoveredSource(): HoveredSource | null;
	setHoveredSource(source: HoveredSource | null): void;

	crosshairSource(): Crosshair;

	startScrollPrice(pane: Pane, priceScale: PriceScale, x: number): void;
	scrollPriceTo(pane: Pane, priceScale: PriceScale, x: number): void;
	endScrollPrice(pane: Pane, priceScale: PriceScale): void;
	resetPriceScale(pane: Pane, priceScale: PriceScale): void;

	startScalePrice(pane: Pane, priceScale: PriceScale, x: number): void;
	scalePriceTo(pane: Pane, priceScale: PriceScale, x: number): void;
	endScalePrice(pane: Pane, priceScale: PriceScale): void;

	zoomTime(pointX: Coordinate, scale: number): void;
	startScrollTime(x: Coordinate): void;
	scrollTimeTo(x: Coordinate): void;
	endScrollTime(): void;

	setTimeScaleAnimation(animation: ITimeScaleAnimation): void;

	stopTimeScaleAnimation(): void;
	moveSeriesToPane(series: Series<SeriesType>, newPaneIndex: number): void;
	panes(): readonly Pane[];
	getPaneIndex(pane: Pane): number;
	swapPanes(first: number, second: number): void;
	movePane(from: number, to: number): void;
	removePane(index: number): void;
	changePanesHeight(paneIndex: number, height: number): void;

	colorParser(): ColorParser;
}

function isPanePrimitive(source: IPriceDataSource | IPrimitiveHitTestSource): source is IPrimitiveHitTestSource | Pane {
	return source instanceof Pane;
}

// ChartModel 作为模型层核心协调者：维护 pane 列表、时间轴/十字线状态，并向 GUI 层发出 Invalidate 命令
// 泛型 HorzScaleItem 允许外部自定义时间轴的刻度类型（例如时间戳、字符串标签等）
export class ChartModel<HorzScaleItem> implements IDestroyable, IChartModelBase {
	private readonly _options: ChartOptionsInternal<HorzScaleItem>;
	private readonly _invalidateHandler: InvalidateHandler;

	private readonly _rendererOptionsProvider: PriceAxisRendererOptionsProvider;

	private readonly _timeScale: TimeScale<HorzScaleItem>;
	private readonly _panes: Pane[] = [];
	private readonly _crosshair: Crosshair;
	private readonly _magnet: Magnet;

	private _serieses: Series<SeriesType>[] = [];

	private _width: number = 0;
	private _hoveredSource: HoveredSource | null = null;
	private readonly _priceScalesOptionsChanged: Delegate = new Delegate();
	private _crosshairMoved: Delegate<TimePointIndex | null, Point | null, TouchMouseEventData | null> = new Delegate();

	private _backgroundTopColor: string;
	private _backgroundBottomColor: string;
	private _gradientColorsCache: GradientColorsCache | null = null;

	private readonly _horzScaleBehavior: IHorzScaleBehavior<HorzScaleItem>;

	private _colorParser: ColorParser;

	public constructor(invalidateHandler: InvalidateHandler, options: ChartOptionsInternal<HorzScaleItem>, horzScaleBehavior: IHorzScaleBehavior<HorzScaleItem>) {
		// GUI 层会传入 invalidateHandler，模型在任何状态变化时调用它以触发重绘
		this._invalidateHandler = invalidateHandler;
		this._options = options;
		this._horzScaleBehavior = horzScaleBehavior;
		this._colorParser = new ColorParser(this._options.layout.colorParsers);

		this._rendererOptionsProvider = new PriceAxisRendererOptionsProvider(this);

		// TimeScale 负责时间坐标 -> 像素的映射；Crosshair/Magnet 则处理交互辅助
		this._timeScale = new TimeScale(this, options.timeScale, this._options.localization, horzScaleBehavior);
		this._crosshair = new Crosshair(this, options.crosshair);
		this._magnet = new Magnet(options.crosshair);

		if (options.addDefaultPane) {
			// 默认情况下创建一个主 pane，并把 stretchFactor 调高两倍保证初始可视区域
			this._getOrCreatePane(0);
			this._panes[0].setStretchFactor(DEFAULT_STRETCH_FACTOR * 2);
		}

		// 布局背景色会根据布局配置计算一次并缓存
		this._backgroundTopColor = this._getBackgroundColor(BackgroundColorSide.Top);
		this._backgroundBottomColor = this._getBackgroundColor(BackgroundColorSide.Bottom);
	}

	// fullUpdate 通知 GUI 进行完整无效化：pane 尺寸、轴、图形均重新计算
	public fullUpdate(): void {
		this._invalidate(InvalidateMask.full());
	}

	// lightUpdate 仅触发轻量级刷新（例如数据刷新但不需要重算布局）
	public lightUpdate(): void {
		this._invalidate(InvalidateMask.light());
	}

	// cursorUpdate 用于仅刷新鼠标光标相关的视图（十字线、hover 样式）
	public cursorUpdate(): void {
		this._invalidate(new InvalidateMask(InvalidationLevel.Cursor));
	}

	// updateSource 会根据数据源所在 pane 构造对应的 mask，触发目标 pane 的重新绘制
	public updateSource(source: IPriceDataSource | IPrimitiveHitTestSource): void {
		const inv = this._invalidationMaskForSource(source);
		this._invalidate(inv);
	}

	public hoveredSource(): HoveredSource | null {
		return this._hoveredSource;
	}

	public setHoveredSource(source: HoveredSource | null): void {
		// 避免同源重复更新：只有指向的数据源或外部 ID 发生变化时才刷新
		if (this._hoveredSource?.source === source?.source && this._hoveredSource?.object?.externalId === source?.object?.externalId) {
			return;
		}
		const prevSource = this._hoveredSource;
		this._hoveredSource = source;
		if (prevSource !== null) {
			this.updateSource(prevSource.source);
		}
		// additional check to prevent unnecessary updates of same source
		if (source !== null && source.source !== prevSource?.source) {
			this.updateSource(source.source);
		}
	}

	public options(): Readonly<ChartOptionsInternal<HorzScaleItem>> {
		return this._options;
	}

	public applyOptions(options: DeepPartial<ChartOptionsInternal<HorzScaleItem>>): void {
		// 所有 ChartOptions 会 merge 回内部缓存，并逐项刷新依赖：pane 价格轴、时间轴、本地化等
		merge(this._options, options);

		this._panes.forEach((p: Pane) => p.applyScaleOptions(options));

		if (options.timeScale !== undefined) {
			this._timeScale.applyOptions(options.timeScale);
		}

		if (options.localization !== undefined) {
			this._timeScale.applyLocalizationOptions(options.localization);
		}

		if (options.leftPriceScale || options.rightPriceScale) {
			this._priceScalesOptionsChanged.fire();
		}

		this._backgroundTopColor = this._getBackgroundColor(BackgroundColorSide.Top);
		this._backgroundBottomColor = this._getBackgroundColor(BackgroundColorSide.Bottom);

		this.fullUpdate();
	}

	public applyPriceScaleOptions(priceScaleId: string, options: DeepPartial<PriceScaleOptions>, paneIndex: number = 0): void {
		const pane = this._panes[paneIndex];
		if (pane === undefined) {
			if (process.env.NODE_ENV === 'development') {
				throw new Error(`Trying to apply price scale options with incorrect pane index: ${paneIndex}`);
			}
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
		if (priceScaleId === DefaultPriceScaleId.Left) {
			// 左侧默认轴直接 merge 到全局配置，随后广播选项已变化
			merge(this._options, {
				leftPriceScale: options,
			});
			pane.applyScaleOptions({
				leftPriceScale: options,
			});

			this._priceScalesOptionsChanged.fire();
			this.fullUpdate();
			return;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
		} else if (priceScaleId === DefaultPriceScaleId.Right) {
			// 右侧默认轴与左侧处理一致
			merge(this._options, {
				rightPriceScale: options,
			});
			pane.applyScaleOptions({
				rightPriceScale: options,
			});

			this._priceScalesOptionsChanged.fire();
			this.fullUpdate();
			return;
		}

		const res = this.findPriceScale(priceScaleId, paneIndex);

		if (res === null) {
			if (process.env.NODE_ENV === 'development') {
				throw new Error(`Trying to apply price scale options with incorrect ID: ${priceScaleId}`);
			}

			return;
		}

		// 自定义价格轴只需直接应用新配置并通知订阅者
		res.priceScale.applyOptions(options);
		this._priceScalesOptionsChanged.fire();
	}

	public findPriceScale(priceScaleId: string, paneIndex: number): PriceScaleOnPane | null {
		// 根据 paneIndex 查找对应 pane，并在其价格轴集合中匹配 ID
		const pane = this._panes[paneIndex];
		if (pane === undefined) {
			return null;
		}

		const priceScale = pane.priceScaleById(priceScaleId);
		if (priceScale !== null) {
			return {
				pane,
				priceScale,
			};
		}
		return null;
	}

	public timeScale(): TimeScale<HorzScaleItem> {
		return this._timeScale;
	}

	public panes(): readonly Pane[] {
		return this._panes;
	}

	public crosshairSource(): Crosshair {
		// Crosshair 作为特殊的数据源，需要暴露给 GUI 控制其位置
		return this._crosshair;
	}

	public crosshairMoved(): ISubscription<TimePointIndex | null, Point | null, TouchMouseEventData | null> {
		return this._crosshairMoved;
	}

	public setPaneHeight(pane: Pane, height: number): void {
		// 直接写入像素高度，并触发所有 pane 重算以保持比例
		pane.setHeight(height);
		this.recalculateAllPanes();
	}

	public setWidth(width: number): void {
		// 图表宽度变化需同步时间轴及所有 pane 的 canvas 宽度
		this._width = width;
		this._timeScale.setWidth(this._width);
		this._panes.forEach((pane: Pane) => pane.setWidth(width));
		this.recalculateAllPanes();
	}

	public removePane(index: number): void {
		// 最少保留一个 pane；其余情况删除后触发全量刷新
		if (this._panes.length === 1) {
			return;
		}

		assert(index >= 0 && index < this._panes.length, 'Invalid pane index');

		this._panes.splice(index, 1);
		this.fullUpdate();
	}

	public changePanesHeight(paneIndex: number, height: number): void {
		// 拖拽分隔条时进入：根据总 stretchFactor 分摊其它 pane 的高度变化
		if (this._panes.length < 2) {
			return;
		}

		assert(paneIndex >= 0 && paneIndex < this._panes.length, 'Invalid pane index');
		const targetPane = this._panes[paneIndex];

		const totalStretch = this._panes.reduce((prevValue: number, pane: Pane) => prevValue + pane.stretchFactor(), 0);
		const totalHeight = this._panes.reduce((prevValue: number, pane: Pane) => prevValue + pane.height(), 0);
		const maxPaneHeight = totalHeight - MIN_PANE_HEIGHT * (this._panes.length - 1);
		height = Math.min(maxPaneHeight, Math.max(MIN_PANE_HEIGHT, height));
		const pixelStretchFactor = totalStretch / totalHeight;

		const oldHeight = targetPane.height();
		targetPane.setStretchFactor(height * pixelStretchFactor);

		let otherPanesChange = height - oldHeight;
		let panesCount = this._panes.length - 1;

		for (const pane of this._panes) {
			if (pane !== targetPane) {
				const newPaneHeight = Math.min(maxPaneHeight, Math.max(30, pane.height() - otherPanesChange / panesCount));
				otherPanesChange -= (pane.height() - newPaneHeight);
				panesCount -= 1;
				const newStretchFactor = newPaneHeight * pixelStretchFactor;
				pane.setStretchFactor(newStretchFactor);
			}
		}

		this.fullUpdate();
	}

	public swapPanes(first: number, second: number): void {
		// 交换 pane 顺序，通常用于自定义布局
		assert(first >= 0 && first < this._panes.length && second >= 0 && second < this._panes.length, 'Invalid pane index');
		const firstPane = this._panes[first];
		const secondPane = this._panes[second];
		this._panes[first] = secondPane;
		this._panes[second] = firstPane;
		this.fullUpdate();
	}

	public movePane(from: number, to: number): void {
		// 将 from 位置的 pane 插入到 to 位置，实现排序调整
		assert(from >= 0 && from < this._panes.length && to >= 0 && to < this._panes.length, 'Invalid pane index');
		if (from === to) {
			return;
		}

		const [paneToMove] = this._panes.splice(from, 1);
		this._panes.splice(to, 0, paneToMove);
		this.fullUpdate();
	}

	public startScalePrice(pane: Pane, priceScale: PriceScale, x: number): void {
		// 记录起始坐标，由 pane 内部处理拖拽缩放逻辑
		pane.startScalePrice(priceScale, x);
	}

	public scalePriceTo(pane: Pane, priceScale: PriceScale, x: number): void {
		// 拖拽过程持续回写十字线，刷新轻量 mask 以实时更新刻度
		pane.scalePriceTo(priceScale, x);
		this.updateCrosshair();
		this._invalidate(this._paneInvalidationMask(pane, InvalidationLevel.Light));
	}

	public endScalePrice(pane: Pane, priceScale: PriceScale): void {
		// 缩放结束后仍触发一次刷新，确保刻度对齐
		pane.endScalePrice(priceScale);
		this._invalidate(this._paneInvalidationMask(pane, InvalidationLevel.Light));
	}

	public startScrollPrice(pane: Pane, priceScale: PriceScale, x: number): void {
		// 自动缩放开启时禁止拖拽；否则 pane 记录滚动起点
		if (priceScale.isAutoScale()) {
			return;
		}
		pane.startScrollPrice(priceScale, x);
	}

	public scrollPriceTo(pane: Pane, priceScale: PriceScale, x: number): void {
		// 非自动轴跟随鼠标拖动，实时刷新十字线与 pane
		if (priceScale.isAutoScale()) {
			return;
		}
		pane.scrollPriceTo(priceScale, x);
		this.updateCrosshair();
		this._invalidate(this._paneInvalidationMask(pane, InvalidationLevel.Light));
	}

	public endScrollPrice(pane: Pane, priceScale: PriceScale): void {
		// 释放拖拽时收尾一次轻量刷新
		if (priceScale.isAutoScale()) {
			return;
		}
		pane.endScrollPrice(priceScale);
		this._invalidate(this._paneInvalidationMask(pane, InvalidationLevel.Light));
	}

	public resetPriceScale(pane: Pane, priceScale: PriceScale): void {
		// Pane 内部根据数据重置可视区，再触发轻量刷新
		pane.resetPriceScale(priceScale);
		this._invalidate(this._paneInvalidationMask(pane, InvalidationLevel.Light));
	}

	public startScaleTime(position: Coordinate): void {
		this._timeScale.startScale(position);
	}

	/**
	 * Zoom in/out the chart (depends on scale value).
	 *
	 * @param pointX - X coordinate of the point to apply the zoom (the point which should stay on its place)
	 * @param scale - Zoom value. Negative value means zoom out, positive - zoom in.
	 */
	public zoomTime(pointX: Coordinate, scale: number): void {
		// 缩放围绕 pointX，保持该像素对应的时间不变；完成后重新计算所有 pane
		const timeScale = this.timeScale();
		if (timeScale.isEmpty() || scale === 0) {
			return;
		}

		const timeScaleWidth = timeScale.width();
		pointX = Math.max(1, Math.min(pointX, timeScaleWidth)) as Coordinate;

		timeScale.zoom(pointX, scale);

		this.recalculateAllPanes();
	}

	public scrollChart(x: Coordinate): void {
		// 对外暴露的滚动入口：调用 start/scroll/end 以复用惯性逻辑
		this.startScrollTime(0 as Coordinate);
		this.scrollTimeTo(x);
		this.endScrollTime();
	}

	public scaleTimeTo(x: Coordinate): void {
		// 由 GUI 直接驱动 scaleTo 后需重算 pane，保持价格坐标同步
		this._timeScale.scaleTo(x);
		this.recalculateAllPanes();
	}

	public endScaleTime(): void {
		this._timeScale.endScale();
		this.lightUpdate();
	}

	public startScrollTime(x: Coordinate): void {
		this._timeScale.startScroll(x);
	}

	public scrollTimeTo(x: Coordinate): void {
		this._timeScale.scrollTo(x);
		this.recalculateAllPanes();
	}

	public endScrollTime(): void {
		this._timeScale.endScroll();
		this.lightUpdate();
	}

	public serieses(): readonly Series<SeriesType>[] {
		return this._serieses;
	}

	public setAndSaveCurrentPosition(x: Coordinate, y: Coordinate, event: TouchMouseEventData | null, pane: Pane, skipEvent?: boolean): void {
		// 将像素坐标转换为时间索引与价格，并保存在 Crosshair 中，供 GUI 绘制十字线
		this._crosshair.saveOriginCoord(x, y);
		let price = NaN;
		let index = this._timeScale.coordinateToIndex(x, true);

		const visibleBars = this._timeScale.visibleStrictRange();
		if (visibleBars !== null) {
			index = Math.min(Math.max(visibleBars.left(), index), visibleBars.right()) as TimePointIndex;
		}

		const priceScale = pane.defaultPriceScale();
		const firstValue = priceScale.firstValue();
		if (firstValue !== null) {
			price = priceScale.coordinateToPrice(y, firstValue);
		}
		price = this._magnet.align(price, index, pane);

		this._crosshair.setPosition(index, price, pane);

		this.cursorUpdate();
		if (!skipEvent) {
			const hitTest = hitTestPane(pane, x, y);
			this.setHoveredSource(hitTest && { source: hitTest.source, object: hitTest.object, cursorStyle: hitTest.cursorStyle || null });
			this._crosshairMoved.fire(this._crosshair.appliedIndex(), { x, y }, event);
		}
	}

	// A position provided external (not from an internal event listener)
	public setAndSaveSyntheticPosition(price: number, horizontalPosition: HorzScaleItem, pane: Pane): void {
		// 外部调用可以直接以价格 + 横轴值定位十字线，不依赖已有像素坐标
		const priceScale = pane.defaultPriceScale();
		const firstValue = priceScale.firstValue();
		const y = priceScale.priceToCoordinate(price, ensureNotNull(firstValue));
		const index = this._timeScale.timeToIndex(horizontalPosition as InternalHorzScaleItem, true);
		const x = this._timeScale.indexToCoordinate(ensureNotNull(index));
		this.setAndSaveCurrentPosition(x, y, null, pane, true);
	}

	public clearCurrentPosition(skipEvent?: boolean): void {
		// 清空十字线位置并通知订阅者
		const crosshair = this.crosshairSource();
		crosshair.clearPosition();
		this.cursorUpdate();
		if (!skipEvent) {
			this._crosshairMoved.fire(null, null, null);
		}
	}

	public updateCrosshair(): void {
		// apply magnet
		// Magnet 会将当前价格吸附至最近的数据点，确保十字线落在有效位置
		const pane = this._crosshair.pane();
		if (pane !== null) {
			const x = this._crosshair.originCoordX();
			const y = this._crosshair.originCoordY();
			this.setAndSaveCurrentPosition(x, y, null, pane);
		}

		// 更新所有与十字线相关的视图（价格轴标签、时间轴标签等）
		this._crosshair.updateAllViews();
	}

	public updateTimeScale(newBaseIndex: TimePointIndex | null, newPoints?: readonly TimeScalePoint[], firstChangedPointIndex?: number): void {
		// newPoints 表示历史数据更新，firstChangedPointIndex 指定变动起点
		const oldFirstTime = this._timeScale.indexToTime(0 as TimePointIndex);

		if (newPoints !== undefined && firstChangedPointIndex !== undefined) {
			this._timeScale.update(newPoints, firstChangedPointIndex);
		}

		const newFirstTime = this._timeScale.indexToTime(0 as TimePointIndex);

		const currentBaseIndex = this._timeScale.baseIndex();
		const visibleBars = this._timeScale.visibleStrictRange();

		// 处理新增点导致的右侧偏移补偿，确保当用户锁定最后一根时视口保持在末尾
		// if time scale cannot return current visible bars range (e.g. time scale has zero-width)
		// then we do not need to update right offset to shift visible bars range to have the same right offset as we have before new bar
		// (and actually we cannot)
		if (visibleBars !== null && oldFirstTime !== null && newFirstTime !== null) {
			const isLastSeriesBarVisible = visibleBars.contains(currentBaseIndex);
			const isLeftBarShiftToLeft = this._horzScaleBehavior.key(oldFirstTime) > this._horzScaleBehavior.key(newFirstTime);
			const isSeriesPointsAdded = newBaseIndex !== null && newBaseIndex > currentBaseIndex;
			const isSeriesPointsAddedToRight = isSeriesPointsAdded && !isLeftBarShiftToLeft;

			const allowShiftWhenReplacingWhitespace = this._timeScale.options().allowShiftVisibleRangeOnWhitespaceReplacement;
			const replacedExistingWhitespace = firstChangedPointIndex === undefined;
			const needShiftVisibleRangeOnNewBar = isLastSeriesBarVisible && (!replacedExistingWhitespace || allowShiftWhenReplacingWhitespace) && this._timeScale.options().shiftVisibleRangeOnNewBar;
			if (isSeriesPointsAddedToRight && !needShiftVisibleRangeOnNewBar) {
				const compensationShift = newBaseIndex - currentBaseIndex;
				this._timeScale.setRightOffset(this._timeScale.rightOffset() - compensationShift);
			}
		}

		this._timeScale.setBaseIndex(newBaseIndex);
	}

	public recalculatePane(pane: Pane | null): void {
		// 仅对单个 pane 触发指标/价格轴重算
		if (pane !== null) {
			pane.recalculate();
		}
	}

	public paneForSource(source: IPriceDataSource | IPrimitiveHitTestSource): Pane | null {
		// 数据源可能是 Pane 本身（图形 primitive），否则在各 pane 的 orderedSources 中查找
		if (isPanePrimitive(source)) {
			return source as Pane;
		}
		const pane = this._panes.find((p: Pane) => p.orderedSources().includes(source));
		return pane === undefined ? null : pane;
	}

	public recalculateAllPanes(): void {
		// 遍历所有 pane，重新计算价格区间，再同步十字线
		this._panes.forEach((p: Pane) => p.recalculate());
		this.updateCrosshair();
	}

	public destroy(): void {
		// 销毁所有 pane，以释放事件订阅及 canvas 资源
		this._panes.forEach((p: Pane) => p.destroy());
		this._panes.length = 0;

		// to avoid memleaks
		// 清理本地化缓存的格式化函数，便于 GC 回收
		this._options.localization.priceFormatter = undefined;
		this._options.localization.percentageFormatter = undefined;
		this._options.localization.timeFormatter = undefined;
	}

	public rendererOptionsProvider(): PriceAxisRendererOptionsProvider {
		return this._rendererOptionsProvider;
	}

	public priceAxisRendererOptions(): Readonly<PriceAxisViewRendererOptions> {
		return this._rendererOptionsProvider.options();
	}

	public priceScalesOptionsChanged(): ISubscription {
		return this._priceScalesOptionsChanged;
	}

	public addSeriesToPane<T extends SeriesType>(
		series: Series<T>,
		paneIndex: number
	): void {
		// 创建或获取目标 pane，将 series 注册到 pane，并维护全局 series 列表
		const pane = this._getOrCreatePane(paneIndex);
		this._addSeriesToPane(series, pane);

		this._serieses.push(series);
		if (this._serieses.length === 1) {
			// call fullUpdate to recalculate chart's parts geometry
			// 第一条 series 会影响 chart 的所有布局，必须进行全量刷新
			this.fullUpdate();
		} else {
			this.lightUpdate();
		}
	}

	public removeSeries(series: Series<SeriesType>): void {
		// 从 pane 移除 series，并在 series 列表中删除对应元素
		const pane = this.paneForSource(series);

		const seriesIndex = this._serieses.indexOf(series);
		assert(seriesIndex !== -1, 'Series not found');
		const paneImpl = ensureNotNull(pane);
		this._serieses.splice(seriesIndex, 1);
		paneImpl.removeDataSource(series);
		if (series.destroy) {
			series.destroy();
		}

		this._timeScale.recalculateIndicesWithData();

		// 若 pane 已经空了且不需要保留，清理 pane
		this._cleanupIfPaneIsEmpty(paneImpl);
	}

	public moveSeriesToScale(series: ISeries<SeriesType>, targetScaleId: string): void {
		// 先从原轴解绑，再根据目标价格轴 ID 添加到 pane
		const pane = ensureNotNull(this.paneForSource(series));
		pane.removeDataSource(series, true);
		pane.addDataSource(series, targetScaleId, true);
	}

	public fitContent(): void {
		// 通过 invalidate mask 通知时间轴自适应可见数据范围
		const mask = InvalidateMask.light();
		mask.setFitContent();
		this._invalidate(mask);
	}

	public setTargetLogicalRange(range: LogicalRange): void {
		// GUI 请求定位到指定 LogicalRange
		const mask = InvalidateMask.light();
		mask.applyRange(range);
		this._invalidate(mask);
	}

	public resetTimeScale(): void {
		// 重置时间轴到默认位置（通常是全部数据）
		const mask = InvalidateMask.light();
		mask.resetTimeScale();
		this._invalidate(mask);
	}

	public setBarSpacing(spacing: number): void {
		// 修改条目间距，主要影响时间轴转换系数
		const mask = InvalidateMask.light();
		mask.setBarSpacing(spacing);
		this._invalidate(mask);
	}

	public setRightOffset(offset: number): void {
		// 调整时间轴右偏移，通常用于保持最后一根在视口右侧
		const mask = InvalidateMask.light();
		mask.setRightOffset(offset);
		this._invalidate(mask);
	}

	public setTimeScaleAnimation(animation: ITimeScaleAnimation): void {
		// 启动时间轴动画（惯性、平滑过渡等），通过 mask 通知 GUI
		const mask = InvalidateMask.light();
		mask.setTimeScaleAnimation(animation);
		this._invalidate(mask);
	}

	public stopTimeScaleAnimation(): void {
		// 停止所有时间轴动画
		const mask = InvalidateMask.light();
		mask.stopTimeScaleAnimation();
		this._invalidate(mask);
	}

	public defaultVisiblePriceScaleId(): string {
		// 如果右轴可见，优先使用右轴作为默认 overlay 目标，否则退回左轴
		return this._options.rightPriceScale.visible ? DefaultPriceScaleId.Right : DefaultPriceScaleId.Left;
	}

	public moveSeriesToPane(series: Series<SeriesType>, newPaneIndex: number): void {
		// 将 series 从旧 pane 移至新 pane，必要时创建 pane 并清理空 pane
		assert(newPaneIndex >= 0, 'Index should be greater or equal to 0');
		const fromPaneIndex = this._seriesPaneIndex(series);
		if (newPaneIndex === fromPaneIndex) {
			return;
		}

		const previousPane = ensureNotNull(this.paneForSource(series));
		previousPane.removeDataSource(series);
		const newPane = this._getOrCreatePane(newPaneIndex);
		this._addSeriesToPane(series, newPane);
		if (previousPane.dataSources().length === 0) {
			this._cleanupIfPaneIsEmpty(previousPane);
		}
		this.fullUpdate();
	}

	public backgroundBottomColor(): string {
		return this._backgroundBottomColor;
	}

	public backgroundTopColor(): string {
		return this._backgroundTopColor;
	}

	public backgroundColorAtYPercentFromTop(percent: number): string {
		const bottomColor = this._backgroundBottomColor;
		const topColor = this._backgroundTopColor;

		if (bottomColor === topColor) {
			// solid background
			return bottomColor;
		}

		// gradient background

		// percent should be from 0 to 100 (we're using only integer values to make cache more efficient)
		percent = Math.max(0, Math.min(100, Math.round(percent * 100)));

		if (this._gradientColorsCache === null ||
			this._gradientColorsCache.topColor !== topColor || this._gradientColorsCache.bottomColor !== bottomColor) {
			this._gradientColorsCache = {
				topColor: topColor,
				bottomColor: bottomColor,
				colors: new Map(),
			};
		} else {
			const cachedValue = this._gradientColorsCache.colors.get(percent);
			if (cachedValue !== undefined) {
				return cachedValue;
			}
		}

		const result = this._colorParser.gradientColorAtPercent(topColor, bottomColor, percent / 100);
		this._gradientColorsCache.colors.set(percent, result);
		return result;
	}

	public getPaneIndex(pane: Pane): number {
		return this._panes.indexOf(pane);
	}

	public colorParser(): ColorParser {
		return this._colorParser;
	}

	public addPane(): Pane {
		// 对外暴露的新增 pane 方法，内部复用 _addPane
		return this._addPane();
	}

	private _addPane(index?: number): Pane {
		// Pane 构造时立即注册到列表并触发一次 autoscale，无论当前 autoscale 选项如何
		const pane = new Pane(this._timeScale, this);
		this._panes.push(pane);
		const idx = index ?? this._panes.length - 1;
		// we always do autoscaling on the creation
		// if autoscale option is true, it is ok, just recalculate by invalidation mask
		// if autoscale option is false, autoscale anyway on the first draw
		// also there is a scenario when autoscale is true in constructor and false later on applyOptions
		const mask = InvalidateMask.full();
		mask.invalidatePane(idx, {
			level: InvalidationLevel.None,
			autoScale: true,
		});
		this._invalidate(mask);
		return pane;
	}

	private _getOrCreatePane(index: number): Pane {
		// 若 index 在现有范围内则直接复用，否则创建新 pane
		assert(index >= 0, 'Index should be greater or equal to 0');
		index = Math.min(this._panes.length, index);
		if (index < this._panes.length) {
			return this._panes[index];
		}

		return this._addPane(index);
	}

	private _seriesPaneIndex(series: Series<SeriesType>): number {
		// 在 panes 中查找包含该 series 的 pane 索引
		return this._panes.findIndex((pane: Pane) => pane.series().includes(series));
	}

	private _paneInvalidationMask(pane: Pane | null, level: InvalidationLevel): InvalidateMask {
		// 构造仅针对指定 pane 的 InvalidateMask，其他 pane 不受影响
		const inv = new InvalidateMask(level);
		if (pane !== null) {
			const index = this._panes.indexOf(pane);
			inv.invalidatePane(index, {
				level,
			});
		}
		return inv;
	}

	private _invalidationMaskForSource(source: IPriceDataSource | IPrimitiveHitTestSource, invalidateType?: InvalidationLevel): InvalidateMask {
		// 先定位数据源所在 pane，再创建对应的 mask；默认采用 Light 等级
		if (invalidateType === undefined) {
			invalidateType = InvalidationLevel.Light;
		}

		return this._paneInvalidationMask(this.paneForSource(source), invalidateType);
	}

	private _invalidate(mask: InvalidateMask): void {
		// 所有无效化最终汇聚于此：调用 GUI 回调并让网格视图更新
		if (this._invalidateHandler) {
			this._invalidateHandler(mask);
		}

		this._panes.forEach((pane: Pane) => pane.grid().paneView().update());
	}

	private _addSeriesToPane(series: Series<SeriesType>, pane: Pane): void {
		// 根据 priceScaleId 决定挂载目标价格轴，若为 overlay 自定义轴则复用该 ID
		const priceScaleId = series.options().priceScaleId;
		const targetScaleId: string = priceScaleId !== undefined ? priceScaleId : this.defaultVisiblePriceScaleId();
		pane.addDataSource(series, targetScaleId);

		if (!isDefaultPriceScale(targetScaleId)) {
			// let's apply that options again to apply margins
			// 对自定义价格轴重新应用 options，确保上下边距立即生效
			series.applyOptions(series.options());
		}
	}

	private _getBackgroundColor(side: BackgroundColorSide): string {
		// 支持纯色与纵向渐变两种背景，缓存上/下颜色便于快速插值
		const layoutOptions = this._options['layout'];

		if (layoutOptions.background.type === ColorType.VerticalGradient) {
			return side === BackgroundColorSide.Top ?
				layoutOptions.background.topColor :
				layoutOptions.background.bottomColor;
		}

		return layoutOptions.background.color;
	}

	private _cleanupIfPaneIsEmpty(pane: Pane): void {
		// 若 pane 不需要保留且已无数据源，则将其移除，避免占用布局空间
		if (!pane.preserveEmptyPane() && (pane.dataSources().length === 0 && this._panes.length > 1)) {
			this._panes.splice(this.getPaneIndex(pane), 1);
		}
	}
}
