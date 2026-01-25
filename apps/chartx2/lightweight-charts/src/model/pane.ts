import { assert, ensureDefined, ensureNotNull } from '../helpers/assertions';
import { Delegate } from '../helpers/delegate';
import { IDestroyable } from '../helpers/idestroyable';
import { ISubscription } from '../helpers/isubscription';
import { clamp } from '../helpers/mathex';
import { clone, DeepPartial } from '../helpers/strict-type-checks';

import { ChartOptionsBase, IChartModelBase, OverlayPriceScaleOptions, VisiblePriceScaleOptions } from './chart-model';
import { Coordinate } from './coordinate';
import { DefaultPriceScaleId, isDefaultPriceScale } from './default-price-scale';
import { Grid } from './grid';
import { IPrimitiveHitTestSource } from './idata-source';
import { IPanePrimitiveBase, PrimitiveHoveredItem } from './ipane-primitive';
import { IPriceDataSource } from './iprice-data-source';
import { ISeries } from './iseries';
import { PanePrimitiveWrapper } from './pane-primitive-wrapper';
import { PriceScale, PriceScaleOptions, PriceScaleState } from './price-scale';
import { Series } from './series';
import { SeriesType } from './series-options';
import { sortSources } from './sort-sources';
import { ITimeScale } from './time-scale';

function isSeries(source: IPriceDataSource): source is Series<SeriesType> {
	return source instanceof Series;
}

export const DEFAULT_STRETCH_FACTOR = 1;
export const MIN_PANE_HEIGHT = 30;

export type PriceScalePosition = 'left' | 'right' | 'overlay';

// Pane 对应一个图表面板：持有价格轴、数据源与自定义 primitive，并与 TimeScale 同步
export class Pane implements IDestroyable, IPrimitiveHitTestSource {
	private readonly _timeScale: ITimeScale;
	private readonly _model: IChartModelBase;
	private readonly _grid: Grid;

	private _dataSources: IPriceDataSource[] = [];
	private _overlaySourcesByScaleId: Map<string, IPriceDataSource[]> = new Map();

	private _height: number = 0;
	private _width: number = 0;
	private _stretchFactor: number = DEFAULT_STRETCH_FACTOR;
	private _cachedOrderedSources: readonly IPriceDataSource[] | null = null;
	private _preserveEmptyPane: boolean = false;

	private _destroyed: Delegate = new Delegate();

	private _leftPriceScale: PriceScale;
	private _rightPriceScale: PriceScale;

	private _primitives: PanePrimitiveWrapper[] = [];

	public constructor(timeScale: ITimeScale, model: IChartModelBase) {
		// 每个 pane 都绑定全局时间轴与模型，用于计算可见范围和触发更新
		this._timeScale = timeScale;
		this._model = model;
		this._grid = new Grid(this);

		const options = model.options();

		// 初始化左右两条默认价格轴，并监听模式变更（百分比/指数化）
		this._leftPriceScale = this._createPriceScale(DefaultPriceScaleId.Left, options.leftPriceScale);
		this._rightPriceScale = this._createPriceScale(DefaultPriceScaleId.Right, options.rightPriceScale);

		this._leftPriceScale.modeChanged().subscribe(this._onPriceScaleModeChanged.bind(this, this._leftPriceScale), this);
		this._rightPriceScale.modeChanged().subscribe(this._onPriceScaleModeChanged.bind(this, this._rightPriceScale), this);

		// 应用初始配置，确保 overlay 轴也保持一致的格式化器
		this.applyScaleOptions(options);
	}

	public applyScaleOptions(options: DeepPartial<ChartOptionsBase>): void {
		// 根据 ChartOptions 的变动更新左右轴与 overlay 轴的配置
		if (options.leftPriceScale) {
			this._leftPriceScale.applyOptions(options.leftPriceScale);
		}

		if (options.rightPriceScale) {
			this._rightPriceScale.applyOptions(options.rightPriceScale);
		}

		if (options.localization) {
			this._leftPriceScale.updateFormatter();
			this._rightPriceScale.updateFormatter();
		}
		if (options.overlayPriceScales) {
			const sourceArrays = Array.from(this._overlaySourcesByScaleId.values());
			for (const arr of sourceArrays) {
				const priceScale = ensureNotNull(arr[0].priceScale());
				priceScale.applyOptions(options.overlayPriceScales);
				if (options.localization) {
					priceScale.updateFormatter();
				}
			}
		}
	}

	public priceScaleById(id: string): PriceScale | null {
		// 支持默认左右轴与 overlay 自定义轴的查询
		switch (id) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
			case DefaultPriceScaleId.Left: {
				return this._leftPriceScale;
			}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
			case DefaultPriceScaleId.Right: {
				return this._rightPriceScale;
			}
		}
		if (this._overlaySourcesByScaleId.has(id)) {
			return ensureDefined(this._overlaySourcesByScaleId.get(id))[0].priceScale();
		}
		return null;
	}

	public destroy(): void {
		// 解绑订阅、销毁所有数据源与 primitive，避免内存泄漏
		this.model().priceScalesOptionsChanged().unsubscribeAll(this);

		this._leftPriceScale.modeChanged().unsubscribeAll(this);
		this._rightPriceScale.modeChanged().unsubscribeAll(this);

		this._dataSources.forEach((source: IPriceDataSource) => {
			if (source.destroy) {
				source.destroy();
			}
		});
		this._primitives = this._primitives.filter((primitive: PanePrimitiveWrapper) => {
			const p = primitive.primitive();
			if (p.detached) {
				p.detached();
			}
			return false;
		});
		this._destroyed.fire();
	}

	public stretchFactor(): number {
		return this._stretchFactor;
	}

	public setStretchFactor(factor: number): void {
		this._stretchFactor = factor;
	}

	public model(): IChartModelBase {
		return this._model;
	}

	public width(): number {
		return this._width;
	}

	public height(): number {
		return this._height;
	}

	public setWidth(width: number): void {
		// 宽度仅影响数据源视图的像素计算，写入后更新所有视图
		this._width = width;
		this.updateAllSources();
	}

	public setHeight(height: number): void {
		// 高度变化需同步左右价格轴以及 overlay 轴的高度
		this._height = height;

		this._leftPriceScale.setHeight(height);
		this._rightPriceScale.setHeight(height);

		// process overlays
		this._dataSources.forEach((ds: IPriceDataSource) => {
			if (this.isOverlay(ds)) {
				const priceScale = ds.priceScale();
				if (priceScale !== null) {
					priceScale.setHeight(height);
				}
			}
		});

		this.updateAllSources();
	}

	public setPreserveEmptyPane(preserve: boolean): void {
		this._preserveEmptyPane = preserve;
	}

	public preserveEmptyPane(): boolean {
		return this._preserveEmptyPane;
	}

	public series(): readonly Series<SeriesType>[] {
		return this._dataSources.filter(isSeries);
	}

	public dataSources(): readonly IPriceDataSource[] {
		return this._dataSources;
	}

	public isOverlay(source: IPriceDataSource): boolean {
		const priceScale = source.priceScale();
		if (priceScale === null) {
			return true;
		}
		return this._leftPriceScale !== priceScale && this._rightPriceScale !== priceScale;
	}

	public addDataSource(source: IPriceDataSource, targetScaleId: string, keepSourcesOrder?: boolean): void {
		// 根据目标价格轴 ID 插入数据源，可选择保持原有 zorder
		this._insertDataSource(
			source,
			targetScaleId,
			keepSourcesOrder ? source.zorder() : this._dataSources.length
		);
	}

	public removeDataSource(source: IPriceDataSource, keepSourceOrder?: boolean): void {
		// 从 pane 删除数据源并同步 overlay 映射、价格轴
		const index = this._dataSources.indexOf(source);
		assert(index !== -1, 'removeDataSource: invalid data source');

		this._dataSources.splice(index, 1);
		if (!keepSourceOrder) {
			this._dataSources.forEach((ds: IPriceDataSource, i: number) => ds.setZorder(i));
		}

		const priceScaleId = ensureNotNull(source.priceScale()).id();
		if (this._overlaySourcesByScaleId.has(priceScaleId)) {
			const overlaySources = ensureDefined(this._overlaySourcesByScaleId.get(priceScaleId));
			const overlayIndex = overlaySources.indexOf(source);
			if (overlayIndex !== -1) {
				overlaySources.splice(overlayIndex, 1);
				if (overlaySources.length === 0) {
					this._overlaySourcesByScaleId.delete(priceScaleId);
				}
			}
		}

		const priceScale = source.priceScale();
		// if source has owner, it returns owner's price scale
		// and it does not have source in their list
		if (priceScale && priceScale.dataSources().indexOf(source) >= 0) {
			priceScale.removeDataSource(source);
			this.recalculatePriceScale(priceScale);
		}

		this._cachedOrderedSources = null;
	}

	public priceScalePosition(priceScale: PriceScale): PriceScalePosition {
		// 快速判断价格轴属于左、右还是 overlay
		if (priceScale === this._leftPriceScale) {
			return 'left';
		}
		if (priceScale === this._rightPriceScale) {
			return 'right';
		}

		return 'overlay';
	}

	public leftPriceScale(): PriceScale {
		return this._leftPriceScale;
	}

	public rightPriceScale(): PriceScale {
		return this._rightPriceScale;
	}

	public startScalePrice(priceScale: PriceScale, x: number): void {
		// 记录拖拽缩放起点
		priceScale.startScale(x);
	}

	public scalePriceTo(priceScale: PriceScale, x: number): void {
		priceScale.scaleTo(x);

		// TODO: be more smart and update only affected views
		// 暂时直接刷新 pane 内全部数据源
		this.updateAllSources();
	}

	public endScalePrice(priceScale: PriceScale): void {
		priceScale.endScale();
	}

	public startScrollPrice(priceScale: PriceScale, x: number): void {
		priceScale.startScroll(x);
	}

	public scrollPriceTo(priceScale: PriceScale, x: number): void {
		// PriceScale 内部会累积偏移量，这里同样全部刷新
		priceScale.scrollTo(x);
		this.updateAllSources();
	}

	public endScrollPrice(priceScale: PriceScale): void {
		priceScale.endScroll();
	}

	public updateAllSources(): void {
		// 通知 pane 内所有数据源重绘（series、axes label、十字线标签）
		this._dataSources.forEach((source: IPriceDataSource) => {
			source.updateAllViews();
		});
	}

	public defaultPriceScale(): PriceScale {
		// 优先返回已启用且有数据的默认价格轴；否则使用第一个数据源的轴作为兜底
		let priceScale: PriceScale | null = null;

		if (this._model.options().rightPriceScale.visible && this._rightPriceScale.dataSources().length !== 0) {
			priceScale = this._rightPriceScale;
		} else if (this._model.options().leftPriceScale.visible && this._leftPriceScale.dataSources().length !== 0) {
			priceScale = this._leftPriceScale;
		} else if (this._dataSources.length !== 0) {
			priceScale = this._dataSources[0].priceScale();
		}

		if (priceScale === null) {
			priceScale = this._rightPriceScale;
		}

		return priceScale;
	}

	public defaultVisiblePriceScale(): PriceScale | null {
		// 仅考虑显示状态，返回第一个可见价格轴
		let priceScale: PriceScale | null = null;

		if (this._model.options().rightPriceScale.visible) {
			priceScale = this._rightPriceScale;
		} else if (this._model.options().leftPriceScale.visible) {
			priceScale = this._leftPriceScale;
		}
		return priceScale;
	}

	public recalculatePriceScale(priceScale: PriceScale | null): void {
		// 自动缩放模式下才重新计算价格区间
		if (priceScale === null || !priceScale.isAutoScale()) {
			return;
		}

		this._recalculatePriceScaleImpl(priceScale);
	}

	public resetPriceScale(priceScale: PriceScale): void {
		// 重置为 autoScale 并以当前可见时间窗口重新计算范围
		const visibleBars = this._timeScale.visibleStrictRange();
		priceScale.setMode({ autoScale: true });
		if (visibleBars !== null) {
			priceScale.recalculatePriceRange(visibleBars);
		}
		this.updateAllSources();
	}

	public momentaryAutoScale(): void {
		this._recalculatePriceScaleImpl(this._leftPriceScale);
		this._recalculatePriceScaleImpl(this._rightPriceScale);
	}

	public recalculate(): void {
		// 刷新左右轴以及所有 overlay 轴，再更新 pane 内视图
		this.recalculatePriceScale(this._leftPriceScale);
		this.recalculatePriceScale(this._rightPriceScale);

		this._dataSources.forEach((ds: IPriceDataSource) => {
			if (this.isOverlay(ds)) {
				this.recalculatePriceScale(ds.priceScale());
			}
		});

		this.updateAllSources();
		this._model.lightUpdate();
	}

	public orderedSources(): readonly IPriceDataSource[] {
		// 缓存 sortSources 结果，避免每次 render 都重新排序
		if (this._cachedOrderedSources === null) {
			this._cachedOrderedSources = sortSources<IPriceDataSource>(this._dataSources);
		}

		return this._cachedOrderedSources;
	}

	public setSeriesOrder(series: Series<SeriesType>, order: number): void {
		// 调整 series 在 pane 中的 zorder，并同步价格轴缓存
		order = clamp(order, 0, this._dataSources.length - 1);

		const index = this._dataSources.indexOf(series);
		assert(index !== -1, 'setSeriesOrder: invalid data source');

		this._dataSources.splice(index, 1);
		this._dataSources.splice(order, 0, series);

		this._dataSources.forEach((ps: IPriceDataSource, i: number) => ps.setZorder(i));

		this._cachedOrderedSources = null;

		for (const ps of [this._leftPriceScale, this._rightPriceScale]) {
			ps.invalidateSourcesCache();
			ps.updateFormatter();
		}

		this._model.lightUpdate();
	}

	public orderedSeries(): readonly ISeries<SeriesType>[] {
		return this.orderedSources().filter(isSeries);
	}

	public onDestroyed(): ISubscription {
		return this._destroyed;
	}

	public grid(): Grid {
		return this._grid;
	}

	public attachPrimitive(primitive: IPanePrimitiveBase): void {
		this._primitives.push(new PanePrimitiveWrapper(primitive));
	}

	public detachPrimitive(source: IPanePrimitiveBase): void {
		// primitive 解绑时调用 detached 钩子，并触发一次轻量刷新
		this._primitives = this._primitives.filter((wrapper: PanePrimitiveWrapper) => wrapper.primitive() !== source);
		if (source.detached) {
			source.detached();
		}
		this._model.lightUpdate();
	}

	public primitives(): PanePrimitiveWrapper[] {
		return this._primitives;
	}

	public primitiveHitTest(x: Coordinate, y: Coordinate): PrimitiveHoveredItem[] {
		return this._primitives
			.map((primitive: PanePrimitiveWrapper) => primitive.hitTest(x, y))
			.filter(
				(result: PrimitiveHoveredItem | null): result is PrimitiveHoveredItem =>
					result !== null
			);
	}

	private _recalculatePriceScaleImpl(priceScale: PriceScale): void {
		// 根据 visibleStrictRange 重新计算价格区间，仅在有数据源且时间轴非空时执行
		// TODO: can use this checks
		const sourceForAutoScale = priceScale.sourcesForAutoScale();

		if (sourceForAutoScale && sourceForAutoScale.length > 0 && !this._timeScale.isEmpty()) {
			const visibleBars = this._timeScale.visibleStrictRange();
			if (visibleBars !== null) {
				priceScale.recalculatePriceRange(visibleBars);
			}
		}

		priceScale.updateAllViews();
	}

	private _insertDataSource(source: IPriceDataSource, priceScaleId: string, order: number): void {
		// 在 _dataSources 中插入并维护 overlay 映射，同时让 PriceScale 持有该数据源
		let priceScale = this.priceScaleById(priceScaleId);

		if (priceScale === null) {
			priceScale = this._createPriceScale(priceScaleId, this._model.options().overlayPriceScales);
		}

		this._dataSources.splice(order, 0, source);
		if (!isDefaultPriceScale(priceScaleId)) {
			const overlaySources = this._overlaySourcesByScaleId.get(priceScaleId) || [];
			overlaySources.push(source);
			this._overlaySourcesByScaleId.set(priceScaleId, overlaySources);
		}

		source.setZorder(order);

		priceScale.addDataSource(source);
		source.setPriceScale(priceScale);

		this.recalculatePriceScale(priceScale);

		this._cachedOrderedSources = null;
	}

	private _onPriceScaleModeChanged(priceScale: PriceScale, oldMode: PriceScaleState, newMode: PriceScaleState): void {
		// 仅在 autoScale 模式类型发生改变时触发一次即时自适应
		if (oldMode.mode === newMode.mode) {
			return;
		}

		// momentary auto scale if we toggle percentage/indexedTo100 mode
		this._recalculatePriceScaleImpl(priceScale);
	}

	private _createPriceScale(id: string, options: OverlayPriceScaleOptions | VisiblePriceScaleOptions): PriceScale {
		// 克隆配置并创建 PriceScale，初始高度同步 pane 当前高度
		const actualOptions: PriceScaleOptions = { visible: true, autoScale: true, ...clone(options) };
		const priceScale = new PriceScale(
			id,
			actualOptions,
			this._model.options()['layout'],
			this._model.options().localization,
			this._model.colorParser()
		);
		priceScale.setHeight(this.height());
		return priceScale;
	}
}
