import { IPriceFormatter } from '../formatters/iprice-formatter';
import { PercentageFormatter } from '../formatters/percentage-formatter';
import { PriceFormatter } from '../formatters/price-formatter';

import { ensureDefined, ensureNotNull } from '../helpers/assertions';
import { Delegate } from '../helpers/delegate';
import { ISubscription } from '../helpers/isubscription';
import { DeepPartial, merge } from '../helpers/strict-type-checks';

import { BarCoordinates, BarPrice, BarPrices } from './bar';
import { ColorParser } from './colors';
import { Coordinate } from './coordinate';
import { FirstValue, IPriceDataSource } from './iprice-data-source';
import { LayoutOptions } from './layout-options';
import { LocalizationOptionsBase } from './localization-options';
import { PriceFormatterFn, TickmarksPriceFormatterFn } from './price-formatter-fn';
import { PriceRangeImpl } from './price-range-impl';
import {
	canConvertPriceRangeFromLog,
	convertPriceRangeFromLog,
	convertPriceRangeToLog,
	fromIndexedTo100,
	fromLog,
	fromPercent,
	LogFormula,
	logFormulaForPriceRange,
	logFormulasAreSame,
	toIndexedTo100,
	toIndexedTo100Range,
	toLog,
	toPercent,
	toPercentRange,
} from './price-scale-conversions';
import { PriceTickMarkBuilder } from './price-tick-mark-builder';
import { RangeImpl } from './range-impl';
import { sortSources } from './sort-sources';
import { SeriesItemsIndexesRange, TimePointIndex } from './time-data';

/**
 * Represents the price scale mode.
 */
export const enum PriceScaleMode {
	/**
	 * Price scale shows prices. Price range changes linearly.
	 */
	Normal,
	/**
	 * Price scale shows prices. Price range changes logarithmically.
	 */
	Logarithmic,
	/**
	 * Price scale shows percentage values according the first visible value of the price scale.
	 * The first visible value is 0% in this mode.
	 */
	Percentage,
	/**
	 * The same as percentage mode, but the first value is moved to 100.
	 */
	IndexedTo100,
}

export interface PriceScaleState {
	autoScale: boolean;
	isInverted: boolean;
	mode: PriceScaleMode;
}

export interface PriceMark {
	coord: Coordinate;
	label: string;
	logical: number;
}

export interface PricedValue {
	price: BarPrice;
	y: Coordinate;
}

/** Defines margins of the price scale. */
export interface PriceScaleMargins {
	/**
	 * Top margin in percentages. Must be greater or equal to 0 and less than 1.
	 */
	top: number;
	/**
	 * Bottom margin in percentages. Must be greater or equal to 0 and less than 1.
	 */
	bottom: number;
}

/** Structure that describes price scale options */
export interface PriceScaleOptions {
	/**
	 * Autoscaling is a feature that automatically adjusts a price scale to fit the visible range of data.
	 * Note that overlay price scales are always auto-scaled.
	 *
	 * @defaultValue `true`
	 */
	autoScale: boolean;

	/**
	 * Price scale mode.
	 *
	 * @defaultValue {@link PriceScaleMode.Normal}
	 */
	mode: PriceScaleMode;

	/**
	 * Invert the price scale, so that a upwards trend is shown as a downwards trend and vice versa.
	 * Affects both the price scale and the data on the chart.
	 *
	 * @defaultValue `false`
	 */
	invertScale: boolean;

	/**
	 * Align price scale labels to prevent them from overlapping.
	 *
	 * @defaultValue `true`
	 */
	alignLabels: boolean;

	/**
	 * Price scale margins.
	 *
	 * @defaultValue `{ bottom: 0.1, top: 0.2 }`
	 * @example
	 * ```js
	 * chart.priceScale('right').applyOptions({
	 *     scaleMargins: {
	 *         top: 0.8,
	 *         bottom: 0,
	 *     },
	 * });
	 * ```
	 */
	scaleMargins: PriceScaleMargins;

	/**
	 * Set true to draw a border between the price scale and the chart area.
	 *
	 * @defaultValue `true`
	 */
	borderVisible: boolean;

	/**
	 * Price scale border color.
	 *
	 * @defaultValue `'#2B2B43'`
	 */
	borderColor: string;

	/**
	 * Price scale text color.
	 * If not provided {@link LayoutOptions.textColor} is used.
	 *
	 * @defaultValue `undefined`
	 */
	textColor?: string;

	/**
	 * Show top and bottom corner labels only if entire text is visible.
	 *
	 * @defaultValue `false`
	 */
	entireTextOnly: boolean;

	/**
	 * Indicates if this price scale visible. Ignored by overlay price scales.
	 *
	 * @defaultValue `true` for the right price scale and `false` for the left.
	 * For the yield curve chart, the default is for the left scale to be visible.
	 */
	visible: boolean;

	/**
	 * Draw small horizontal line on price axis labels.
	 *
	 * @defaultValue `false`
	 */
	ticksVisible: boolean;

	/**
	 * Define a minimum width for the price scale.
	 * Note: This value will be exceeded if the
	 * price scale needs more space to display it's contents.
	 *
	 * Setting a minimum width could be useful for ensuring that
	 * multiple charts positioned in a vertical stack each have
	 * an identical price scale width, or for plugins which
	 * require a bit more space within the price scale pane.
	 *
	 * @defaultValue 0
	 */
	minimumWidth: number;

	/**
	 * Ensures that tick marks are always visible at the very top and bottom of the price scale,
	 * regardless of the data range. When enabled, a tick mark will be drawn at both edges of the scale,
	 * providing clear boundary indicators.
	 *
	 * @defaultValue false
	 */
	ensureEdgeTickMarksVisible: boolean;
}

interface RangeCache {
	isValid: boolean;
	visibleBars: RangeImpl<TimePointIndex> | null;
}

// actually price should be BarPrice
type PriceTransformer = (price: BarPrice, baseValue: number) => number;

const percentageFormatter = new PercentageFormatter();
const defaultPriceFormatter = new PriceFormatter(100, 1);

interface MarksCache {
	marks: PriceMark[];
	firstValueIsNull: boolean;
}

// PriceScale 负责将数据价格映射到像素坐标，并管理价格轴的刻度/格式化逻辑
export class PriceScale {
	private readonly _id: string;

	private readonly _layoutOptions: LayoutOptions;
	private readonly _localizationOptions: LocalizationOptionsBase;
	private readonly _options: PriceScaleOptions;

	private _height: number = 0;
	private _internalHeightCache: number | null = null;

	private _priceRange: PriceRangeImpl | null = null;
	private _priceRangeSnapshot: PriceRangeImpl | null = null;
	private _invalidatedForRange: RangeCache = { isValid: false, visibleBars: null };

	private _isCustomPriceRange: boolean = false;

	private _marginAbove: number = 0;
	private _marginBelow: number = 0;

	private _markBuilder: PriceTickMarkBuilder;
	private _onMarksChanged: Delegate = new Delegate();

	private _modeChanged: Delegate<PriceScaleState, PriceScaleState> = new Delegate();

	private _dataSources: IPriceDataSource[] = [];
	private _formatterSource: IPriceDataSource | null = null;
	private _cachedOrderedSources: IPriceDataSource[] | null = null;

	private _marksCache: MarksCache | null = null;

	private _scaleStartPoint: number | null = null;
	private _scrollStartPoint: number | null = null;
	private _formatter: IPriceFormatter = defaultPriceFormatter;

	private _logFormula: LogFormula = logFormulaForPriceRange(null);
	private _colorParser: ColorParser;

	public constructor(id: string, options: PriceScaleOptions, layoutOptions: LayoutOptions, localizationOptions: LocalizationOptionsBase, colorParser: ColorParser) {
		// PriceScale 由 Pane 创建，需持有布局与本地化配置以驱动标签渲染
		this._id = id;
		this._options = options;
		this._layoutOptions = layoutOptions;
		this._localizationOptions = localizationOptions;
		this._colorParser = colorParser;
		// PriceTickMarkBuilder 负责转换逻辑坐标为刻度标记
		this._markBuilder = new PriceTickMarkBuilder(
			this,
			100,
			this._coordinateToLogical.bind(this),
			this._logicalToCoordinate.bind(this)
		);
	}

	public id(): string {
		return this._id;
	}

	public options(): Readonly<PriceScaleOptions> {
		return this._options;
	}

	public applyOptions(options: DeepPartial<PriceScaleOptions>): void {
		// 合并外部配置，并在模式或边距发生变化时刷新缓存
		merge(this._options, options);
		this.updateFormatter();

		if (options.mode !== undefined) {
			this.setMode({ mode: options.mode });
		}

		if (options.scaleMargins !== undefined) {
			const top = ensureDefined(options.scaleMargins.top);
			const bottom = ensureDefined(options.scaleMargins.bottom);

			if (top < 0 || top > 1) {
				throw new Error(`Invalid top margin - expect value between 0 and 1, given=${top}`);
			}

			if (bottom < 0 || bottom > 1) {
				throw new Error(`Invalid bottom margin - expect value between 0 and 1, given=${bottom}`);
			}

			if (top + bottom > 1) {
				throw new Error(`Invalid margins - sum of margins must be less than 1, given=${top + bottom}`);
			}

			this._invalidateInternalHeightCache();
			this._marksCache = null;
		}
	}

	public isAutoScale(): boolean {
		return this._options.autoScale;
	}

	public isCustomPriceRange(): boolean {
		return this._isCustomPriceRange;
	}

	public isLog(): boolean {
		return this._options.mode === PriceScaleMode.Logarithmic;
	}

	public isPercentage(): boolean {
		return this._options.mode === PriceScaleMode.Percentage;
	}

	public isIndexedTo100(): boolean {
		return this._options.mode === PriceScaleMode.IndexedTo100;
	}

	public getLogFormula(): LogFormula {
		return this._logFormula;
	}

	public mode(): PriceScaleState {
		return {
			autoScale: this._options.autoScale,
			isInverted: this._options.invertScale,
			mode: this._options.mode,
		};
	}

	// eslint-disable-next-line complexity
	public setMode(newMode: Partial<PriceScaleState>): void {
		// setMode 支持局部属性：autoScale/isInverted/mode
		// 内部根据旧模式与新模式之间的转换，完成价格区间的换算
		const oldMode = this.mode();
		let priceRange: PriceRangeImpl | null = null;

		if (newMode.autoScale !== undefined) {
			this._options.autoScale = newMode.autoScale;
		}

		if (newMode.mode !== undefined) {
			this._options.mode = newMode.mode;
			if (newMode.mode === PriceScaleMode.Percentage || newMode.mode === PriceScaleMode.IndexedTo100) {
				this._options.autoScale = true;
			}
			// TODO: Remove after making rebuildTickMarks lazy
			this._invalidatedForRange.isValid = false;
		}

		// define which scale converted from
		if (oldMode.mode === PriceScaleMode.Logarithmic && newMode.mode !== oldMode.mode) {
			// 从对数模式切换回普通模式，需要将区间反向转换
			if (canConvertPriceRangeFromLog(this._priceRange, this._logFormula)) {
				priceRange = convertPriceRangeFromLog(this._priceRange, this._logFormula);

				if (priceRange !== null) {
					this.setPriceRange(priceRange);
				}
			} else {
				this._options.autoScale = true;
			}
		}

		// define which scale converted to
		if (newMode.mode === PriceScaleMode.Logarithmic && newMode.mode !== oldMode.mode) {
			// 切换到对数模式时，将当前区间转换到 log 空间
			priceRange = convertPriceRangeToLog(this._priceRange, this._logFormula);

			if (priceRange !== null) {
				this.setPriceRange(priceRange);
			}
		}

		const modeChanged = oldMode.mode !== this._options.mode;
		if (modeChanged && (oldMode.mode === PriceScaleMode.Percentage || this.isPercentage())) {
			this.updateFormatter();
		}

		if (modeChanged && (oldMode.mode === PriceScaleMode.IndexedTo100 || this.isIndexedTo100())) {
			this.updateFormatter();
		}

		if (newMode.isInverted !== undefined && oldMode.isInverted !== newMode.isInverted) {
			// 垂直翻转仅更新标志并触发视图更新
			this._options.invertScale = newMode.isInverted;
			this._onIsInvertedChanged();
		}

		this._modeChanged.fire(oldMode, this.mode());
	}

	public modeChanged(): ISubscription<PriceScaleState, PriceScaleState> {
		return this._modeChanged;
	}

	public fontSize(): number {
		return this._layoutOptions.fontSize;
	}

	public height(): number {
		return this._height;
	}

	public setHeight(value: number): void {
		// 高度变化会影响内部有效绘制高度与刻度缓存，需要清理缓存以重新计算
		if (this._height === value) {
			return;
		}

		this._height = value;
		this._invalidateInternalHeightCache();
		this._marksCache = null;
	}

	public internalHeight(): number {
		// internalHeight = 可用像素高度（扣除上下 margin），缓存以避免重复计算
		if (this._internalHeightCache) {
			return this._internalHeightCache;
		}

		const res = this.height() - this._topMarginPx() - this._bottomMarginPx();
		this._internalHeightCache = res;
		return res;
	}

	public priceRange(): PriceRangeImpl | null {
		this._makeSureItIsValid();
		return this._priceRange;
	}

	public setPriceRange(newPriceRange: PriceRangeImpl | null, isForceSetValue?: boolean): void {
		// isForceSetValue=true 时即使内容相同也会写入（用于拖拽滚动）
		const oldPriceRange = this._priceRange;

		if (!isForceSetValue &&
			!(oldPriceRange === null && newPriceRange !== null) &&
			(oldPriceRange === null || oldPriceRange.equals(newPriceRange))) {
			return;
		}

		this._marksCache = null;
		this._priceRange = newPriceRange;
	}

	public setCustomPriceRange(newPriceRange: PriceRangeImpl | null): void {
		// 记录用户指定的自定义范围，并切换 _isCustomPriceRange 标志
		this.setPriceRange(newPriceRange);
		this._toggleCustomPriceRange(newPriceRange !== null);
	}

	public isEmpty(): boolean {
		// 当高度为 0 或 priceRange 尚未计算时视为不可绘制
		this._makeSureItIsValid();
		return this._height === 0 || !this._priceRange || this._priceRange.isEmpty();
	}

	public invertedCoordinate(coordinate: number): number {
		return this.isInverted() ? coordinate : this.height() - 1 - coordinate;
	}

	public priceToCoordinate(price: number, baseValue: number): Coordinate {
		// 根据当前模式（百分比/指数）将价格转换为逻辑值，再映射到像素
		if (this.isPercentage()) {
			price = toPercent(price, baseValue);
		} else if (this.isIndexedTo100()) {
			price = toIndexedTo100(price, baseValue);
		}

		return this._logicalToCoordinate(price, baseValue);
	}

	public pointsArrayToCoordinates<T extends PricedValue>(points: T[], baseValue: number, visibleRange?: SeriesItemsIndexesRange): void {
		// 将一组价格值批量转换为像素坐标，常用于直线/点图等渲染
		this._makeSureItIsValid();
		const bh = this._bottomMarginPx();
		const range = ensureNotNull(this.priceRange());
		const min = range.minValue();
		const max = range.maxValue();
		const ih = (this.internalHeight() - 1);
		const isInverted = this.isInverted();

		const hmm = ih / (max - min);

		const fromIndex = (visibleRange === undefined) ? 0 : visibleRange.from;
		const toIndex = (visibleRange === undefined) ? points.length : visibleRange.to;

		const transformFn = this._getCoordinateTransformer();
		for (let i = fromIndex; i < toIndex; i++) {
			const point = points[i];
			const price = point.price;

			if (isNaN(price)) {
				continue;
			}

			let logical = price;
			if (transformFn !== null) {
				logical = transformFn(point.price, baseValue) as BarPrice;
			}

			const invCoordinate = bh + hmm * (logical - min);
			const coordinate = isInverted ? invCoordinate : this._height - 1 - invCoordinate;
			point.y = coordinate as Coordinate;
		}
	}

	public barPricesToCoordinates<T extends BarPrices & BarCoordinates>(pricesList: T[], baseValue: number, visibleRange?: SeriesItemsIndexesRange): void {
		// 针对柱状数据（OHLC），分别转换四个价格字段
		this._makeSureItIsValid();
		const bh = this._bottomMarginPx();
		const range = ensureNotNull(this.priceRange());
		const min = range.minValue();
		const max = range.maxValue();
		const ih = (this.internalHeight() - 1);
		const isInverted = this.isInverted();

		const hmm = ih / (max - min);

		const fromIndex = (visibleRange === undefined) ? 0 : visibleRange.from;
		const toIndex = (visibleRange === undefined) ? pricesList.length : visibleRange.to;

		const transformFn = this._getCoordinateTransformer();
		for (let i = fromIndex; i < toIndex; i++) {
			const bar = pricesList[i];

			let openLogical = bar.open;
			let highLogical = bar.high;
			let lowLogical = bar.low;
			let closeLogical = bar.close;

			if (transformFn !== null) {
				openLogical = transformFn(bar.open, baseValue) as BarPrice;
				highLogical = transformFn(bar.high, baseValue) as BarPrice;
				lowLogical = transformFn(bar.low, baseValue) as BarPrice;
				closeLogical = transformFn(bar.close, baseValue) as BarPrice;
			}

			let invCoordinate = bh + hmm * (openLogical - min);
			let coordinate = isInverted ? invCoordinate : this._height - 1 - invCoordinate;
			bar.openY = coordinate as Coordinate;

			invCoordinate = bh + hmm * (highLogical - min);
			coordinate = isInverted ? invCoordinate : this._height - 1 - invCoordinate;
			bar.highY = coordinate as Coordinate;

			invCoordinate = bh + hmm * (lowLogical - min);
			coordinate = isInverted ? invCoordinate : this._height - 1 - invCoordinate;
			bar.lowY = coordinate as Coordinate;

			invCoordinate = bh + hmm * (closeLogical - min);
			coordinate = isInverted ? invCoordinate : this._height - 1 - invCoordinate;
			bar.closeY = coordinate as Coordinate;
		}
	}

	public coordinateToPrice(coordinate: Coordinate, baseValue: number): BarPrice {
		const logical = this._coordinateToLogical(coordinate, baseValue);
		return this.logicalToPrice(logical, baseValue);
	}

	public logicalToPrice(logical: number, baseValue: number): BarPrice {
		// 将逻辑值反向映射为真实价格，考虑百分比/指数模式
		let value = logical;
		if (this.isPercentage()) {
			value = fromPercent(value, baseValue);
		} else if (this.isIndexedTo100()) {
			value = fromIndexedTo100(value, baseValue);
		}
		return value as BarPrice;
	}

	public dataSources(): readonly IPriceDataSource[] {
		return this._dataSources;
	}

	public orderedSources(): readonly IPriceDataSource[] {
		if (!this._cachedOrderedSources) {
			this._cachedOrderedSources = sortSources<IPriceDataSource>(this._dataSources);
		}

		return this._cachedOrderedSources;
	}

	public addDataSource(source: IPriceDataSource): void {
		// 避免重复添加，同步 formatter 与排序缓存
		if (this._dataSources.indexOf(source) !== -1) {
			return;
		}

		this._dataSources.push(source);
		this.updateFormatter();
		this.invalidateSourcesCache();
	}

	public removeDataSource(source: IPriceDataSource): void {
		// 当最后一个数据源移除后自动切回 autoScale 并清空价格区间
		const index = this._dataSources.indexOf(source);
		if (index === -1) {
			throw new Error('source is not attached to scale');
		}

		this._dataSources.splice(index, 1);

		if (this._dataSources.length === 0) {
			this.setMode({
				autoScale: true,
			});

			// if no sources on price scale let's clear price range cache as well as enabling auto scale
			this.setPriceRange(null);
		}

		this.updateFormatter();
		this.invalidateSourcesCache();
	}

	public firstValue(): number | null {
		// 遍历所有数据源，寻找时间最早的 firstValue
		// TODO: cache the result
		let result: FirstValue | null = null;

		for (const source of this._dataSources) {
			const firstValue = source.firstValue();
			if (firstValue === null) {
				continue;
			}

			if (result === null || firstValue.timePoint < result.timePoint) {
				result = firstValue;
			}
		}

		return result === null ? null : result.value;
	}

	public isInverted(): boolean {
		return this._options.invertScale;
	}

	public marks(): PriceMark[] {
		// 若 firstValue 为空，复用旧的 marks；否则重新构建刻度
		const firstValueIsNull = this.firstValue() === null;

		// do not recalculate marks if firstValueIsNull is true because in this case we'll always get empty result
		// this could happen in case when a series had some data and then you set empty data to it (in a simplified case)
		// we could display an empty price scale, but this is not good from UX
		// so in this case we need to keep an previous marks to display them on the scale
		// as one of possible examples for this situation could be the following:
		// let's say you have a study/indicator attached to a price scale and then you decide to stop it, i.e. remove its data because of its visibility
		// a user will see the previous marks on the scale until you turn on your study back or remove it from the chart completely
		if (this._marksCache !== null && (firstValueIsNull || this._marksCache.firstValueIsNull === firstValueIsNull)) {
			return this._marksCache.marks;
		}

		this._markBuilder.rebuildTickMarks();
		const marks = this._markBuilder.marks();
		this._marksCache = { marks, firstValueIsNull };
		this._onMarksChanged.fire();

		return marks;
	}

	public onMarksChanged(): ISubscription {
		return this._onMarksChanged;
	}

	public startScale(x: number): void {
		// 仅在非百分比/指数模式下允许手动缩放，记录当前高度下的起始位置和价格区间快照
		if (this.isPercentage() || this.isIndexedTo100()) {
			return;
		}

		if (this._scaleStartPoint !== null || this._priceRangeSnapshot !== null) {
			return;
		}

		if (this.isEmpty()) {
			return;
		}

		// invert x
		this._scaleStartPoint = this._height - x;
		this._priceRangeSnapshot = ensureNotNull(this.priceRange()).clone();
	}

	public scaleTo(x: number): void {
		// 鼠标拖动缩放：将像素比例转换为 scaleCoeff，并围绕中心缩放价格区间
		if (this.isPercentage() || this.isIndexedTo100()) {
			return;
		}

		if (this._scaleStartPoint === null) {
			return;
		}

		this.setMode({
			autoScale: false,
		});

		// invert x
		x = this._height - x;

		if (x < 0) {
			x = 0;
		}

		let scaleCoeff = (this._scaleStartPoint + (this._height - 1) * 0.2) / (x + (this._height - 1) * 0.2);
		const newPriceRange = ensureNotNull(this._priceRangeSnapshot).clone();

		scaleCoeff = Math.max(scaleCoeff, 0.1);
		newPriceRange.scaleAroundCenter(scaleCoeff);
		this.setPriceRange(newPriceRange);
	}

	public endScale(): void {
		if (this.isPercentage() || this.isIndexedTo100()) {
			return;
		}

		this._scaleStartPoint = null;
		this._priceRangeSnapshot = null;
	}

	public startScroll(x: number): void {
		// 手动滚动仅在关闭 autoScale 时启用
		if (this.isAutoScale()) {
			return;
		}

		if (this._scrollStartPoint !== null || this._priceRangeSnapshot !== null) {
			return;
		}

		if (this.isEmpty()) {
			return;
		}

		this._scrollStartPoint = x;
		this._priceRangeSnapshot = ensureNotNull(this.priceRange()).clone();
	}

	public scrollTo(x: number): void {
		// 滚动 = 对价格区间整体平移；根据像素偏移量换算价格偏移
		if (this.isAutoScale()) {
			return;
		}

		if (this._scrollStartPoint === null) {
			return;
		}

		const priceUnitsPerPixel = ensureNotNull(this.priceRange()).length() / (this.internalHeight() - 1);
		let pixelDelta = x - this._scrollStartPoint;

		if (this.isInverted()) {
			pixelDelta *= -1;
		}

		const priceDelta = pixelDelta * priceUnitsPerPixel;
		const newPriceRange = ensureNotNull(this._priceRangeSnapshot).clone();

		newPriceRange.shift(priceDelta);
		this.setPriceRange(newPriceRange, true);
		this._marksCache = null;
	}

	public endScroll(): void {
		if (this.isAutoScale()) {
			return;
		}

		if (this._scrollStartPoint === null) {
			return;
		}

		this._scrollStartPoint = null;
		this._priceRangeSnapshot = null;
	}

	public formatter(): IPriceFormatter {
		// Formatter 可能因模式变化而被替换，使用惰性初始化
		if (!this._formatter) {
			this.updateFormatter();
		}

		return this._formatter;
	}

	public formatPrice(price: number, firstValue: number): string {
		// 根据当前模式选择合适的格式化逻辑：百分比/指数 or 普通价格
		switch (this._options.mode) {
			case PriceScaleMode.Percentage:
				return this._formatPercentage(toPercent(price, firstValue));
			case PriceScaleMode.IndexedTo100:
				return this.formatter().format(toIndexedTo100(price, firstValue));
			default:
				return this._formatPrice(price as BarPrice);
		}
	}

	public formatLogical(logical: number): string {
		// logical 是转换后的值，因此直接根据模式挑选 formatter
		switch (this._options.mode) {
			case PriceScaleMode.Percentage:
				return this._formatPercentage(logical);
			case PriceScaleMode.IndexedTo100:
				return this.formatter().format(logical);
			default:
				return this._formatPrice(logical as BarPrice);
		}
	}

	public formatLogicalTickmarks(logicals: readonly number[]): string[] {
		// 刻度格式化与 formatLogical 类似，但需要返回字符串数组
		switch (this._options.mode) {
			case PriceScaleMode.Percentage:
				return this._formatPercentageTickmarks(logicals);
			case PriceScaleMode.IndexedTo100:
				return this.formatter().formatTickmarks(logicals);
			default:
				return this._formatTickmarks(logicals as BarPrice[]);
		}
	}

	public formatPriceAbsolute(price: number): string {
		return this._formatPrice(price as BarPrice, ensureNotNull(this._formatterSource).formatter());
	}

	public formatPricePercentage(price: number, baseValue: number): string {
		price = toPercent(price, baseValue);
		return this._formatPercentage(price, percentageFormatter);
	}

	public sourcesForAutoScale(): readonly IPriceDataSource[] {
		// 目前直接返回全部数据源； Pane 会过滤可见性
		return this._dataSources;
	}

	public recalculatePriceRange(visibleBars: RangeImpl<TimePointIndex>): void {
		// 标记当前 priceRange 需要根据 visibleBars 更新
		this._invalidatedForRange = {
			visibleBars: visibleBars,
			isValid: false,
		};
	}

	public updateAllViews(): void {
		// 价格轴内部也会驱动数据源刷新（如十字线标签）
		this._dataSources.forEach((s: IPriceDataSource) => s.updateAllViews());
	}

	public hasVisibleEdgeMarks(): boolean {
		// ensureEdgeTickMarksVisible 打开时且处于 autoScale 才绘制边缘刻度
		return this._options.ensureEdgeTickMarksVisible && this.isAutoScale();
	}

	public getEdgeMarksPadding(): number {
		// 边缘刻度需要额外 padding，以避免标签紧贴边框
		return this.fontSize() / 2;
	}

	public updateFormatter(): void {
		// 当数据源或模式变化时，选择 zorder 最小的数据源作为格式化基准
		this._marksCache = null;

		let zOrder = Infinity;
		this._formatterSource = null;
		// choose source with the lowest zorder
		for (const source of this._dataSources) {
			if (source.zorder() < zOrder) {
				zOrder = source.zorder();
				this._formatterSource = source;
			}
		}

		let base = 100;
		if (this._formatterSource !== null) {
			base = Math.round(this._formatterSource.base());
		}

		this._formatter = defaultPriceFormatter;
		if (this.isPercentage()) {
			this._formatter = percentageFormatter;
			base = 100;
		} else if (this.isIndexedTo100()) {
			this._formatter = new PriceFormatter(100, 1);
			base = 100;
		} else {
			if (this._formatterSource !== null) {
				// user
				this._formatter = this._formatterSource.formatter();
			}
		}

		this._markBuilder = new PriceTickMarkBuilder(
			this,
			base,
			this._coordinateToLogical.bind(this),
			this._logicalToCoordinate.bind(this)
		);

		this._markBuilder.rebuildTickMarks();
	}

	public invalidateSourcesCache(): void {
		this._cachedOrderedSources = null;
	}

	public colorParser(): ColorParser {
		return this._colorParser;
	}

	private _toggleCustomPriceRange(v: boolean): void {
		this._isCustomPriceRange = v;
	}

	private _topMarginPx(): number {
		return this.isInverted()
			? this._options.scaleMargins.bottom * this.height() + this._marginBelow
			: this._options.scaleMargins.top * this.height() + this._marginAbove;
	}

	private _bottomMarginPx(): number {
		return this.isInverted()
			? this._options.scaleMargins.top * this.height() + this._marginAbove
			: this._options.scaleMargins.bottom * this.height() + this._marginBelow;
	}

	private _makeSureItIsValid(): void {
		// priceRange 由 autoscale 信息懒计算，只有在无效时才触发
		if (!this._invalidatedForRange.isValid) {
			this._invalidatedForRange.isValid = true;
			this._recalculatePriceRangeImpl();
		}
	}

	private _invalidateInternalHeightCache(): void {
		this._internalHeightCache = null;
	}

	private _logicalToCoordinate(logical: number, baseValue: number): Coordinate {
		// 将逻辑值映射到像素坐标：考虑 log/percentage 模式与上下 margin
		this._makeSureItIsValid();
		if (this.isEmpty()) {
			return 0 as Coordinate;
		}

		logical = this.isLog() && logical ? toLog(logical, this._logFormula) : logical;
		const range = ensureNotNull(this.priceRange());
		const invCoordinate = this._bottomMarginPx() +
			(this.internalHeight() - 1) * (logical - range.minValue()) / range.length();
		const coordinate = this.invertedCoordinate(invCoordinate);
		return coordinate as Coordinate;
	}

	private _coordinateToLogical(coordinate: number, baseValue: number): number {
		// 像素 -> 逻辑值，之后由 logicalToPrice 还原真实价格
		this._makeSureItIsValid();
		if (this.isEmpty()) {
			return 0;
		}

		const invCoordinate = this.invertedCoordinate(coordinate);
		const range = ensureNotNull(this.priceRange());
		const logical = range.minValue() + range.length() *
			((invCoordinate - this._bottomMarginPx()) / (this.internalHeight() - 1));
		return this.isLog() ? fromLog(logical, this._logFormula) : logical;
	}

	private _onIsInvertedChanged(): void {
		this._marksCache = null;
		this._markBuilder.rebuildTickMarks();
	}

	// eslint-disable-next-line complexity
	private _recalculatePriceRangeImpl(): void {
		// 遍历所有数据源的 autoscale 信息合并价格区间，并处理模式转换、边距、对数刻度
		if (this.isCustomPriceRange() && !this.isAutoScale()) {
			return;
		}

		const visibleBars = this._invalidatedForRange.visibleBars;
		if (visibleBars === null) {
			return;
		}

		let priceRange: PriceRangeImpl | null = null;
		const sources = this.sourcesForAutoScale();

		let marginAbove = 0;
		let marginBelow = 0;

		for (const source of sources) {
			if (!source.visible()) {
				continue;
			}

			const firstValue = source.firstValue();
			if (firstValue === null) {
				continue;
			}

			const autoScaleInfo = source.autoscaleInfo(visibleBars.left(), visibleBars.right());
			let sourceRange = autoScaleInfo && autoScaleInfo.priceRange();

			if (sourceRange !== null) {
				switch (this._options.mode) {
					case PriceScaleMode.Logarithmic:
						sourceRange = convertPriceRangeToLog(sourceRange, this._logFormula);
						break;
					case PriceScaleMode.Percentage:
						sourceRange = toPercentRange(sourceRange, firstValue.value);
						break;
					case PriceScaleMode.IndexedTo100:
						sourceRange = toIndexedTo100Range(sourceRange, firstValue.value);
						break;
				}

				if (priceRange === null) {
					priceRange = sourceRange;
				} else {
					priceRange = priceRange.merge(ensureNotNull(sourceRange));
				}

				if (autoScaleInfo !== null) {
					const margins = autoScaleInfo.margins();
					if (margins !== null) {
						marginAbove = Math.max(marginAbove, margins.above);
						marginBelow = Math.max(marginBelow, margins.below);
					}
				}
			}
		}

		if (this.hasVisibleEdgeMarks()) {
			// edge marks 需要额外空间以绘制边缘短线
			marginAbove = Math.max(marginAbove, this.getEdgeMarksPadding());
			marginBelow = Math.max(marginBelow, this.getEdgeMarksPadding());
		}

		if (marginAbove !== this._marginAbove || marginBelow !== this._marginBelow) {
			this._marginAbove = marginAbove;
			this._marginBelow = marginBelow;
			this._marksCache = null;
			this._invalidateInternalHeightCache();
		}

		if (priceRange !== null) {
			// keep current range is new is empty
			if (priceRange.minValue() === priceRange.maxValue()) {
				// 当区间退化成一点时，扩展一个最小 tick 的倍数以保持显示
				const formatterSource = this._formatterSource;
				const minMove = formatterSource === null || this.isPercentage() || this.isIndexedTo100() ? 1 : 1 / formatterSource.base();

				// if price range is degenerated to 1 point let's extend it by 10 min move values
				// to avoid incorrect range and empty (blank) scale (in case of min tick much greater than 1)
				const extendValue = 5 * minMove;

				if (this.isLog()) {
					priceRange = convertPriceRangeFromLog(priceRange, this._logFormula);
				}

				priceRange = new PriceRangeImpl(priceRange.minValue() - extendValue, priceRange.maxValue() + extendValue);

				if (this.isLog()) {
					priceRange = convertPriceRangeToLog(priceRange, this._logFormula);
				}
			}

			if (this.isLog()) {
				const rawRange = convertPriceRangeFromLog(priceRange, this._logFormula);
				const newLogFormula = logFormulaForPriceRange(rawRange);
				if (!logFormulasAreSame(newLogFormula, this._logFormula)) {
					// log 公式发生变化时需更新当前快照及区间，保持单调
					const rawSnapshot = this._priceRangeSnapshot !== null ? convertPriceRangeFromLog(this._priceRangeSnapshot, this._logFormula) : null;
					this._logFormula = newLogFormula;
					priceRange = convertPriceRangeToLog(rawRange, newLogFormula);
					if (rawSnapshot !== null) {
						this._priceRangeSnapshot = convertPriceRangeToLog(rawSnapshot, newLogFormula);
					}
				}
			}

			this.setPriceRange(priceRange);
		} else {
			// reset empty to default
			if (this._priceRange === null) {
				this.setPriceRange(new PriceRangeImpl(-0.5, 0.5));
				this._logFormula = logFormulaForPriceRange(null);
			}
		}
	}

	private _getCoordinateTransformer(): PriceTransformer | null {
		if (this.isPercentage()) {
			return toPercent;
		} else if (this.isIndexedTo100()) {
			return toIndexedTo100;
		} else if (this.isLog()) {
			return (price: number) => toLog(price, this._logFormula);
		}

		return null;
	}

	private _formatValue(value: BarPrice | number, formatter: PriceFormatterFn | undefined, fallbackFormatter?: IPriceFormatter): string {
		if (formatter === undefined) {
			if (fallbackFormatter === undefined) {
				fallbackFormatter = this.formatter();
			}
			return fallbackFormatter.format(value);
		}

		return formatter(value as BarPrice);
	}

	private _formatValues(values: readonly (BarPrice | number)[], formatter: TickmarksPriceFormatterFn | undefined, fallbackFormatter?: IPriceFormatter): string[] {
		if (formatter === undefined) {
			if (fallbackFormatter === undefined) {
				fallbackFormatter = this.formatter();
			}
			return fallbackFormatter.formatTickmarks(values);
		}

		return formatter(values as BarPrice[]);
	}

	private _formatPrice(price: BarPrice, fallbackFormatter?: IPriceFormatter): string {
		return this._formatValue(price, this._localizationOptions.priceFormatter, fallbackFormatter);
	}

	private _formatTickmarks(prices: readonly BarPrice[], fallbackFormatter?: IPriceFormatter): string[] {
		const priceFormatter = this._localizationOptions.priceFormatter;
		return this._formatValues(
			prices,
			this._localizationOptions.tickmarksPriceFormatter ?? (priceFormatter ? (values: readonly BarPrice[]) => values.map(priceFormatter) : undefined),
			fallbackFormatter
		);
	}

	private _formatPercentage(percentage: number, fallbackFormatter?: IPriceFormatter): string {
		return this._formatValue(percentage, this._localizationOptions.percentageFormatter, fallbackFormatter);
	}

	private _formatPercentageTickmarks(percentages: readonly number[], fallbackFormatter?: IPriceFormatter): string[] {
		const tickmarksPercentageFormatter = this._localizationOptions.percentageFormatter;
		return this._formatValues(
			percentages,
			this._localizationOptions.tickmarksPercentageFormatter ?? (tickmarksPercentageFormatter ? (values: readonly number[]) => values.map(tickmarksPercentageFormatter) : undefined),
			fallbackFormatter
		);
	}
}
