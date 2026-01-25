// GUI 层基础 Widget，用于访问 pane 和模型
import { IChartWidgetBase } from '../gui/chart-widget';

import { assert } from '../helpers/assertions';

import { CustomData, ICustomSeriesPaneView } from '../model/icustom-series';
import { IPanePrimitiveBase } from '../model/ipane-primitive';
import { Pane } from '../model/pane';
import { Series } from '../model/series';
import { CustomSeriesOptions, CustomSeriesPartialOptions, SeriesPartialOptions, SeriesPartialOptionsMap, SeriesType } from '../model/series-options';
import { SeriesDefinition } from '../model/series/series-def';

import { IChartApiBase } from './ichart-api';
import { IPaneApi } from './ipane-api';
import { IPanePrimitive } from './ipane-primitive-api';
import { IPriceScaleApi } from './iprice-scale-api';
import { ISeriesApi } from './iseries-api';
import { PriceScaleApi } from './price-scale-api';

// 面板 API 实现，桥接模型与公共接口
export class PaneApi<HorzScaleItem> implements IPaneApi<HorzScaleItem> {
	protected readonly _chartApi: IChartApiBase<HorzScaleItem>;
	private _chartWidget: IChartWidgetBase;
	private _pane: Pane;
	private readonly _seriesApiGetter: (series: Series<SeriesType>) => ISeriesApi<SeriesType, HorzScaleItem>;

	public constructor(
		chartWidget: IChartWidgetBase,
		seriesApiGetter: (series: Series<SeriesType>) => ISeriesApi<SeriesType, HorzScaleItem>,
		pane: Pane,
		chartApi: IChartApiBase<HorzScaleItem>
	) {
		this._chartWidget = chartWidget;
		this._pane = pane;
		this._seriesApiGetter = seriesApiGetter;
		this._chartApi = chartApi;
	}

	public getHeight(): number {
		return this._pane.height();
	}

	public setHeight(height: number): void {
		// 通过模型更新指定 pane 的像素高度
		const chartModel = this._chartWidget.model();
		const paneIndex = chartModel.getPaneIndex(this._pane);
		chartModel.changePanesHeight(paneIndex, height);
	}

	public getStretchFactor(): number {
		return this._pane.stretchFactor();
	}

	public setStretchFactor(stretchFactor: number): void {
		// 更新伸缩因子后触发全局重绘
		this._pane.setStretchFactor(stretchFactor);
		this._chartWidget.model().fullUpdate();
	}

	public paneIndex(): number {
		return this._chartWidget.model().getPaneIndex(this._pane);
	}

	public moveTo(paneIndex: number): void {
		const currentIndex = this.paneIndex();

		if (currentIndex === paneIndex) {
			return;
		}

		assert(paneIndex >= 0 && paneIndex < this._chartWidget.paneWidgets().length, 'Invalid pane index');

		// 委托模型将 pane 重新排序
		this._chartWidget.model().movePane(currentIndex, paneIndex);
	}

	public getSeries(): ISeriesApi<SeriesType, HorzScaleItem>[] {
		// 使用 seriesApiGetter 保证返回的 API 与 ChartApi 中一致
		return this._pane.series().map((source: Series<SeriesType>) => this._seriesApiGetter(source)) ?? [];
	}

	public getHTMLElement(): HTMLElement | null {
		const widgets = this._chartWidget.paneWidgets();
		if (!widgets || widgets.length === 0 || !widgets[this.paneIndex()]) {
			return null;
		}
		return widgets[this.paneIndex()].getElement();
	}

	public attachPrimitive(primitive: IPanePrimitive<HorzScaleItem>): void {
		// 先注册到底层 pane，再触发生命周期回调
		this._pane.attachPrimitive(primitive as IPanePrimitiveBase<unknown>);
		if (primitive.attached) {
			primitive.attached({
				chart: this._chartApi,
				requestUpdate: () => this._pane.model().fullUpdate(),
			});
		}
	}

	public detachPrimitive(primitive: IPanePrimitive<HorzScaleItem>): void {
		this._pane.detachPrimitive(primitive as IPanePrimitiveBase<unknown>);
	}

	public priceScale(priceScaleId: string): IPriceScaleApi {
		const priceScale = this._pane.priceScaleById(priceScaleId);
		if (priceScale === null) {
			throw new Error(`Cannot find price scale with id: ${priceScaleId}`);
		}
		// 与 ChartApi 中保持一致，返回新的 PriceScaleApi 实例
		return new PriceScaleApi(this._chartWidget, priceScaleId, this.paneIndex());
	}

	public setPreserveEmptyPane(preserve: boolean): void {
		this._pane.setPreserveEmptyPane(preserve);
	}

	public preserveEmptyPane(): boolean {
		return this._pane.preserveEmptyPane();
	}

	public addCustomSeries<
		TData extends CustomData<HorzScaleItem>,
		TOptions extends CustomSeriesOptions,
		TPartialOptions extends CustomSeriesPartialOptions = SeriesPartialOptions<TOptions>,
	>(
		customPaneView: ICustomSeriesPaneView<HorzScaleItem, TData, TOptions>,
		options: SeriesPartialOptions<TOptions> = {},
		paneIndex: number = 0
	): ISeriesApi<'Custom', HorzScaleItem, TData, TOptions, TPartialOptions> {
		return this._chartApi.addCustomSeries(customPaneView, options, paneIndex) as ISeriesApi<'Custom', HorzScaleItem, TData, TOptions, TPartialOptions>;
	}

	public addSeries<T extends SeriesType>(
	definition: SeriesDefinition<T>,
	options: SeriesPartialOptionsMap[T] = {}
	): ISeriesApi<T, HorzScaleItem> {
		// 委托 ChartApi 在当前 pane 上创建系列
		return this._chartApi.addSeries(definition, options, this.paneIndex());
	}
}
