import { CanvasRenderingTarget2D } from 'fancy-canvas';

import { undefinedIfNull } from '../../helpers/strict-type-checks';

import { IPaneRenderer } from '../../renderers/ipane-renderer';

import { IChartModelBase } from '../chart-model';
import { Coordinate } from '../coordinate';
import {
	CustomBarItemData,
	CustomData,
	CustomSeriesPricePlotValues,
	CustomSeriesWhitespaceData,
	ICustomSeriesPaneRenderer,
	ICustomSeriesPaneView,
	PriceToCoordinateConverter,
} from '../icustom-series';
import { ISeries } from '../iseries';
import { PriceScale } from '../price-scale';
import { SeriesPlotRow } from '../series-data';
import { SeriesOptionsMap } from '../series-options';
import { TimedValue } from '../time-data';
import { ITimeScale } from '../time-scale';
import { ISeriesCustomPaneView } from './pane-view';
import { SeriesPaneViewBase } from './series-pane-view-base';

// 自定义系列的基础时间值结构。
type CustomBarItemBase = TimedValue;

interface CustomBarItem extends CustomBarItemBase {
	barColor: string;
	originalData?: Record<string, unknown>;
}

// 包装用户自定义渲染器，注入价格转换函数以复用内部坐标体系。
class CustomSeriesPaneRendererWrapper implements IPaneRenderer {
	private _sourceRenderer: ICustomSeriesPaneRenderer;
	private _priceScale: PriceToCoordinateConverter;
	public constructor(
		sourceRenderer: ICustomSeriesPaneRenderer,
		priceScale: PriceToCoordinateConverter
	) {
		this._sourceRenderer = sourceRenderer;
		this._priceScale = priceScale;
	}

	public draw(
		target: CanvasRenderingTarget2D,
		isHovered: boolean,
		hitTestData?: unknown
	): void {
		this._sourceRenderer.draw(target, this._priceScale, isHovered, hitTestData);
	}
}

export class SeriesCustomPaneView extends SeriesPaneViewBase<
	'Custom'& keyof SeriesOptionsMap,
	CustomBarItem,
	CustomSeriesPaneRendererWrapper
> implements ISeriesCustomPaneView {
	protected readonly _renderer: CustomSeriesPaneRendererWrapper;
	private readonly _paneView: ICustomSeriesPaneView<unknown>;

	// 将用户提供的 paneView 与内部模型绑定。
	public constructor(
		series: ISeries<'Custom' & keyof SeriesOptionsMap>,
		model: IChartModelBase,
		paneView: ICustomSeriesPaneView<unknown>
	) {
		super(series, model, false);
		this._paneView = paneView;
		this._renderer = new CustomSeriesPaneRendererWrapper(
			this._paneView.renderer(),
			(price: number) => {
				const firstValue = series.firstValue();
				if (firstValue === null) {
					return null;
				}
				return series.priceScale().priceToCoordinate(price, firstValue.value);
			}
		);
	}

	// 委托给用户自定义 paneView 构建价格坐标。
	public priceValueBuilder(plotRow: CustomData<unknown> | CustomSeriesWhitespaceData<unknown>): CustomSeriesPricePlotValues {
		return this._paneView.priceValueBuilder(plotRow);
	}

	// 判断数据是否为空白点。
	public isWhitespace(data: CustomData<unknown> | CustomSeriesWhitespaceData<unknown>): data is CustomSeriesWhitespaceData<unknown> {
		return this._paneView.isWhitespace(data);
	}

	// 收集原始点并附加颜色与源数据。
	protected _fillRawPoints(): void {
		const colorer = this._series.barColorer();
		this._items = this._series
			.bars()
			.rows()
			.map((row: SeriesPlotRow<'Custom'>) => {
				return {
					time: row.index,
					x: NaN as Coordinate,
					...colorer.barStyle(row.index),
					originalData: row.data,
				};
			});
	}

	protected override _convertToCoordinates(
		priceScale: PriceScale,
		timeScale: ITimeScale
	): void {
		timeScale.indexesToCoordinates(
			this._items,
			undefinedIfNull(this._itemsVisibleRange)
		);
	}

	// 将预处理好的数据传给用户渲染器。
	protected _prepareRendererData(): void {
		this._paneView.update(
			{
				bars: this._items.map(unwrapItemData) as CustomBarItemData<unknown>[],
				barSpacing: this._model.timeScale().barSpacing(),
				visibleRange: this._itemsVisibleRange,
			},
			this._series.options()
		);
	}
}

// 显式挑选暴露给自定义渲染器的字段，避免多余属性泄漏。
function unwrapItemData(
	item: CustomBarItem
): Record<keyof CustomBarItem, unknown> {
	return {
		x: item.x,
		time: item.time,
		originalData: item.originalData,
		barColor: item.barColor,
	};
}
