import { IPaneRenderer } from '../../renderers/ipane-renderer';
import { IUpdatablePaneView, UpdateType } from '../../views/pane/iupdatable-pane-view';

import { IChartModelBase } from '../chart-model';
import { ISeries } from '../iseries';
import { PriceScale } from '../price-scale';
import { SeriesType } from '../series-options';
import { SeriesItemsIndexesRange, TimedValue, visibleTimedValues } from '../time-data';
import { ITimeScale } from '../time-scale';

// 所有系列面板视图的基础抽象类，处理数据缓存、失效标记与渲染器准备。
export abstract class SeriesPaneViewBase<TSeriesType extends SeriesType, ItemType extends TimedValue, TRenderer extends IPaneRenderer> implements IUpdatablePaneView {
	protected readonly _series: ISeries<TSeriesType>;
	protected readonly _model: IChartModelBase;
	protected _invalidated: boolean = true;
	protected _dataInvalidated: boolean = true;
	protected _optionsInvalidated: boolean = true;
	protected _items: ItemType[] = [];
	protected _itemsVisibleRange: SeriesItemsIndexesRange | null = null;
	protected readonly abstract _renderer: TRenderer;
	private readonly _extendedVisibleRange: boolean;

	public constructor(series: ISeries<TSeriesType>, model: IChartModelBase, extendedVisibleRange: boolean) {
		this._series = series;
		this._model = model;
		this._extendedVisibleRange = extendedVisibleRange;
	}

	// 更新失效标记，针对数据或样式变更进行细粒度刷新。
	public update(updateType?: UpdateType): void {
		this._invalidated = true;
		if (updateType === 'data') {
			this._dataInvalidated = true;
		}
		if (updateType === 'options') {
			this._optionsInvalidated = true;
		}
	}

	// 返回渲染器实例，若系列不可见或无数据则返回 null。
	public renderer(): IPaneRenderer | null {
		if (!this._series.visible()) {
			return null;
		}

		this._makeValid();

		return this._itemsVisibleRange === null ? null : this._renderer;
	}

	protected abstract _fillRawPoints(): void;

	// 当样式变化时，为已有点重新应用配色。
	protected _updateOptions(): void {
		this._items = this._items.map((item: ItemType) => ({
			...item,
			...this._series.barColorer().barStyle(item.time),
		}));
	}

	protected abstract _convertToCoordinates(priceScale: PriceScale, timeScale: ITimeScale, firstValue: number): void;

	// 清空可见范围缓存，等待重新计算。
	protected _clearVisibleRange(): void {
		this._itemsVisibleRange = null;
	}

	protected abstract _prepareRendererData(): void;

	// 根据失效标记依次刷新数据、配色和坐标。
	private _makeValid(): void {
		if (this._dataInvalidated) {
			this._fillRawPoints();
			this._dataInvalidated = false;
		}

		if (this._optionsInvalidated) {
			this._updateOptions();
			this._optionsInvalidated = false;
		}

		if (this._invalidated) {
			this._makeValidImpl();
			this._invalidated = false;
		}
	}

	// 执行坐标转换、可见范围裁剪以及渲染数据准备。
	private _makeValidImpl(): void {
		const priceScale = this._series.priceScale();
		const timeScale = this._model.timeScale();

		this._clearVisibleRange();

		if (timeScale.isEmpty() || priceScale.isEmpty()) {
			return;
		}

		const visibleBars = timeScale.visibleStrictRange();
		if (visibleBars === null) {
			return;
		}

		if (this._series.bars().size() === 0) {
			return;
		}

		const firstValue = this._series.firstValue();
		if (firstValue === null) {
			return;
		}

		this._itemsVisibleRange = visibleTimedValues(this._items, visibleBars, this._extendedVisibleRange);
		this._convertToCoordinates(priceScale, timeScale, firstValue.value);

		this._prepareRendererData();
	}
}
