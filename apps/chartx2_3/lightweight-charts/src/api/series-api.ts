import { IPriceFormatter } from '../formatters/iprice-formatter';

import { ensureNotNull } from '../helpers/assertions';
import { Delegate } from '../helpers/delegate';
import { IDestroyable } from '../helpers/idestroyable';
import { clone, merge } from '../helpers/strict-type-checks';

import { BarPrice } from '../model/bar';
import { Coordinate } from '../typings/coordinate';
import { CustomPriceLine } from '../model/custom-price-line';
import { DataUpdatesConsumer, SeriesDataItemTypeMap, WhitespaceData } from '../model/data-consumer';
import { checkItemsAreOrdered, checkPriceLineOptions, checkSeriesValuesType } from '../model/data-validators';
import { IHorzScaleBehavior } from '../model/ihorz-scale-behavior';
import { ISeriesPrimitiveBase } from '../model/iseries-primitive';
import { Pane } from '../model/pane';
import { MismatchDirection } from '../model/plot-list';
import { CreatePriceLineOptions, PriceLineOptions } from '../model/price-line-options';
import { RangeImpl } from '../model/range-impl';
import { Series } from '../model/series';
import { SeriesPlotRow } from '../model/series-data';
import {
	SeriesOptionsMap,
	SeriesPartialOptionsMap,
	SeriesType,
} from '../model/series-options';
import { IRange, Logical, TimePointIndex } from '../model/time-data';
import { TimeScaleVisibleRange } from '../model/time-scale-visible-range';

import { IPriceScaleApiProvider } from './chart-api';
import { getSeriesDataCreator } from './get-series-data-creator';
import { type IChartApiBase } from './ichart-api';
import { IPaneApi } from './ipane-api';
import { IPriceLine } from './iprice-line';
import { IPriceScaleApi } from './iprice-scale-api';
import { BarsInfo, DataChangedHandler, DataChangedScope, ISeriesApi } from './iseries-api';
import { ISeriesPrimitive } from './iseries-primitive-api';
import { priceLineOptionsDefaults } from './options/price-line-options-defaults';
import { PriceLine } from './price-line-api';

// SeriesApi 浣滀负瀵瑰簳灞?Series 妯″瀷鐨勫皝瑁咃紝鍚戝鏆撮湶缁熶竴鐨勫浘琛ㄦ暟鎹搷浣滄帴鍙ｃ€?
// 娉涘瀷鍙傛暟鍏佽 API 鏀寔涓嶅悓绯诲垪绫诲瀷涓庢í鍧愭爣绫诲瀷锛屽悓鏃朵繚鎸佺被鍨嬪畨鍏ㄣ€?

export class SeriesApi<
	TSeriesType extends SeriesType,
	HorzScaleItem,
	TData extends WhitespaceData<HorzScaleItem> = SeriesDataItemTypeMap<HorzScaleItem>[TSeriesType],
	TOptions extends SeriesOptionsMap[TSeriesType] = SeriesOptionsMap[TSeriesType],
	TPartialOptions extends SeriesPartialOptionsMap[TSeriesType] = SeriesPartialOptionsMap[TSeriesType]
> implements
	ISeriesApi<TSeriesType, HorzScaleItem, TData, TOptions, TPartialOptions>, IDestroyable {
	protected _series: Series<TSeriesType>;
	protected _dataUpdatesConsumer: DataUpdatesConsumer<TSeriesType, HorzScaleItem>;
	protected readonly _chartApi: IChartApiBase<HorzScaleItem>;

	private readonly _priceScaleApiProvider: IPriceScaleApiProvider<HorzScaleItem>;
	private readonly _horzScaleBehavior: IHorzScaleBehavior<HorzScaleItem>;
	private readonly _dataChangedDelegate: Delegate<DataChangedScope> = new Delegate();
	private readonly _paneApiGetter: (pane: Pane) => IPaneApi<HorzScaleItem>;

	public constructor(
		series: Series<TSeriesType>,
		dataUpdatesConsumer: DataUpdatesConsumer<TSeriesType, HorzScaleItem>,
		priceScaleApiProvider: IPriceScaleApiProvider<HorzScaleItem>,
		chartApi: IChartApiBase<HorzScaleItem>,
		horzScaleBehavior: IHorzScaleBehavior<HorzScaleItem>,
		paneApiGetter: (pane: Pane) => IPaneApi<HorzScaleItem>
	) {
		this._series = series;
		this._dataUpdatesConsumer = dataUpdatesConsumer;
		this._priceScaleApiProvider = priceScaleApiProvider;
		this._horzScaleBehavior = horzScaleBehavior;
		this._chartApi = chartApi;
		this._paneApiGetter = paneApiGetter;
	}

	// 閿€姣佸綋鍓?API 缁戝畾鐨勫鎵樿祫婧愶紝闃叉鍐呭瓨娉勬紡銆?
	public destroy(): void {
		this._dataChangedDelegate.destroy();
	}

	// 杩斿洖绯诲垪浣跨敤鐨勪环鏍兼牸寮忓寲鍣紝澶栭儴鍙嵁姝ゅ皢鏁板€艰浆鎹负灞曠ず瀛楃涓层€?
	public priceFormatter(): IPriceFormatter {
		return this._series.formatter();
	}

	// 鏍规嵁缁欏畾浠锋牸杞崲涓哄儚绱犲潗鏍囷紱褰撶郴鍒楁病鏈夐涓环鏍肩紦瀛樻椂杩斿洖 null銆?
	public priceToCoordinate(price: number): Coordinate | null {
		const firstValue = this._series.firstValue();
		if (firstValue === null) {
			return null;
		}

		return this._series.priceScale().priceToCoordinate(price, firstValue.value);
	}

	// 灏嗗睆骞曞潗鏍囧弽绠椾负浠锋牸鏁板€硷紝鐢ㄤ簬鍚搁檮绛変氦浜掗€昏緫銆?
	public coordinateToPrice(coordinate: number): BarPrice | null {
		const firstValue = this._series.firstValue();
		if (firstValue === null) {
			return null;
		}
		return this._series.priceScale().coordinateToPrice(coordinate as Coordinate, firstValue.value);
	}

	// 璁＄畻閫昏緫鑼冨洿鍐呭瓨鍦ㄧ殑鏁版嵁鏉℃暟鍙婅竟鐣岋紝鐢ㄤ簬鎷栨嫿銆佹粴鍔ㄦ椂鐨勬彁绀轰俊鎭€?
	public barsInLogicalRange(range: IRange<number> | null): BarsInfo<HorzScaleItem> | null {
		if (range === null) {
			return null;
		}

		// we use TimeScaleVisibleRange here to convert LogicalRange to strict range properly
		const correctedRange = new TimeScaleVisibleRange(
			new RangeImpl(range.from as Logical, range.to as Logical)
		).strictRange() as RangeImpl<TimePointIndex>;

		const bars = this._series.bars();
		if (bars.isEmpty()) {
			return null;
		}

		const dataFirstBarInRange = bars.search(correctedRange.left(), MismatchDirection.NearestRight);
		const dataLastBarInRange = bars.search(correctedRange.right(), MismatchDirection.NearestLeft);

		const dataFirstIndex = ensureNotNull(bars.firstIndex());
		const dataLastIndex = ensureNotNull(bars.lastIndex());

		// this means that we request data in the data gap
		// e.g. let's say we have series with data [0..10, 30..60]
		// and we request bars info in range [15, 25]
		// thus, dataFirstBarInRange will be with index 30 and dataLastBarInRange with 10
		if (dataFirstBarInRange !== null && dataLastBarInRange !== null && dataFirstBarInRange.index > dataLastBarInRange.index) {
			return {
				barsBefore: range.from - dataFirstIndex,
				barsAfter: dataLastIndex - range.to,
			};
		}

		const barsBefore = (dataFirstBarInRange === null || dataFirstBarInRange.index === dataFirstIndex)
			? range.from - dataFirstIndex
			: dataFirstBarInRange.index - dataFirstIndex;

		const barsAfter = (dataLastBarInRange === null || dataLastBarInRange.index === dataLastIndex)
			? dataLastIndex - range.to
			: dataLastIndex - dataLastBarInRange.index;

		const result: BarsInfo<HorzScaleItem> = { barsBefore, barsAfter };

		// actually they can't exist separately
		if (dataFirstBarInRange !== null && dataLastBarInRange !== null) {
			result.from = dataFirstBarInRange.originalTime as HorzScaleItem;
			result.to = dataLastBarInRange.originalTime as HorzScaleItem;
		}

		return result;
	}

	// 鍐欏叆鏁存鏁版嵁锛屽苟瑙﹀彂鍏ㄩ噺閲嶇粯銆?
	public setData(data: TData[]): void {
		checkItemsAreOrdered(data, this._horzScaleBehavior);
		checkSeriesValuesType(this._series.seriesType(), data);

		this._dataUpdatesConsumer.applyNewData(this._series, data);
		this._onDataChanged('full');
	}

	// 鍗曟潯鏇存柊锛屾敮鎸佸巻鍙插洖琛ワ紙historicalUpdate锛夊拰瀹炴椂琛ョ偣銆?
	public update(bar: TData, historicalUpdate: boolean = false): void {
		checkSeriesValuesType(this._series.seriesType(), [bar]);

		this._dataUpdatesConsumer.updateData(this._series, bar, historicalUpdate);
		this._onDataChanged('update');
	}

	// 浠ラ€昏緫绱㈠紩鍙栧洖鏁版嵁鐐癸紝缂哄け鏃朵細鏍规嵁 mismatchDirection 鏌ユ壘閭昏繎鏁版嵁銆?
	public dataByIndex(logicalIndex: number, mismatchDirection?: MismatchDirection): TData | null {
		const data = this._series.bars().search(logicalIndex as unknown as TimePointIndex, mismatchDirection);
		if (data === null) {
			// actually it can be a whitespace
			return null;
		}

		const creator = getSeriesDataCreator<TSeriesType, HorzScaleItem>(this.seriesType());
		return creator(data) as TData | null;
	}

	// 杩斿洖鍏ㄩ儴鏁版嵁琛岋紝鐢ㄤ簬澶栭儴鎵归噺璇诲彇銆?
	public data(): readonly TData[] {
		const seriesCreator = getSeriesDataCreator(this.seriesType());
		const rows = this._series.bars().rows();
		return rows.map((row: SeriesPlotRow<TSeriesType>) => seriesCreator(row) as TData);
	}

	// 璁㈤槄鏁版嵁鍙樻洿浜嬩欢锛岃寖鍥村彲鍖哄垎鍏ㄩ噺鎴栧閲忋€?
	public subscribeDataChanged(handler: DataChangedHandler): void {
		this._dataChangedDelegate.subscribe(handler);
	}

	// 鍙栨秷璁㈤槄鏁版嵁鍙樻洿浜嬩欢銆?
	public unsubscribeDataChanged(handler: DataChangedHandler): void {
		this._dataChangedDelegate.unsubscribe(handler);
	}

	// 搴旂敤閮ㄥ垎閫夐」瑕嗙洊锛屽簳灞備細瑙﹀彂绯诲垪鑷韩鐨勯噸鏂拌绠椼€?
	public applyOptions(options: TPartialOptions): void {
		this._series.applyOptions(options);
	}

	// 鑾峰彇褰撳墠绯诲垪瀹屾暣閰嶇疆鐨勬祬鎷疯礉锛岄伩鍏嶅閮ㄤ慨鏀瑰奖鍝嶅唴閮ㄧ姸鎬併€?
	public options(): Readonly<TOptions> {
		return clone(this._series.options() as TOptions);
	}

	// 鑾峰彇绯诲垪缁戝畾鐨勪环鏍煎埢搴?API锛岀敤浜庢搷浣滆酱閰嶇疆銆?
	public priceScale(): IPriceScaleApi {
		return this._priceScaleApiProvider.priceScale(this._series.priceScale().id(), this.getPane().paneIndex());
	}

	// 鍒涘缓鎴栨洿鏂颁竴鏉′环鏍肩嚎锛屽弬鏁颁細鍜岄粯璁ゅ€煎悎骞躲€?
	public createPriceLine(options: CreatePriceLineOptions): IPriceLine {
		checkPriceLineOptions(options);

		const strictOptions = merge(clone(priceLineOptionsDefaults), options) as PriceLineOptions;
		const priceLine = this._series.createPriceLine(strictOptions);
		return new PriceLine(priceLine);
	}

	// 绉婚櫎鎸囧畾浠锋牸绾裤€?
	public removePriceLine(line: IPriceLine): void {
		this._series.removePriceLine((line as PriceLine).priceLine());
	}

	// 鑾峰彇褰撳墠闄勭潃鐨勬墍鏈変环鏍肩嚎瀹炰緥銆?
	public priceLines(): IPriceLine[] {
		return this._series.priceLines().map((priceLine: CustomPriceLine): IPriceLine => new PriceLine(priceLine));
	}

	// 杩斿洖绯诲垪绫诲瀷锛堢嚎鍥俱€佹煴鐘跺浘绛夛級銆?
	public seriesType(): TSeriesType {
		return this._series.seriesType();
	}

	// 闄勭潃鑷畾涔夊浘鍏冿紝涓庢ā鍨嬪叡浜覆鏌撶敓鍛藉懆鏈熴€?
	public attachPrimitive(primitive: ISeriesPrimitive<HorzScaleItem>): void {
		// at this point we cast the generic to unknown because we
		// don't want the model to know the types of the API (鈼慱鈼?
		this._series.attachPrimitive(primitive as ISeriesPrimitiveBase<unknown>);
		if (primitive.attached) {
			primitive.attached({
				chart: this._chartApi,
				series: this,
				requestUpdate: () => this._series.model().fullUpdate(),
				horzScaleBehavior: this._horzScaleBehavior,
			});
		}
	}

	// 绉婚櫎鍥惧厓锛屽苟涓诲姩璇锋眰鏁村浘鍒锋柊銆?
	public detachPrimitive(primitive: ISeriesPrimitive<HorzScaleItem>): void {
		this._series.detachPrimitive(primitive as ISeriesPrimitiveBase<unknown>);
		if (primitive.detached) {
			primitive.detached();
		}
		this._series.model().fullUpdate();
	}

	// 杩斿洖绯诲垪鎵€鍦ㄧ殑闈㈡澘 API銆?
	public getPane(): IPaneApi<HorzScaleItem> {
		const series = this._series;
		const pane = ensureNotNull(this._series.model().paneForSource(series));
		return this._paneApiGetter(pane);
	}

	// 灏嗙郴鍒楃Щ鍔ㄥ埌鎸囧畾闈㈡澘锛涜嫢绱㈠紩鏃犳晥浼氱敱妯″瀷渚ц嚜琛屾牎楠屻€?
	public moveToPane(paneIndex: number): void {
		this._series.model().moveSeriesToPane(this._series, paneIndex);
	}

	// 杩斿洖绯诲垪鍦ㄩ潰鏉垮唴鐨勭粯鍒堕『搴忥紝-1 琛ㄧず绯诲垪宸茶绉婚櫎銆?
	public seriesOrder(): number {
		const pane = this._series.model().paneForSource(this._series);
		if (pane === null) {
			return -1;
		}

		return pane.series().indexOf(this._series);
	}

	// 璋冩暣绯诲垪鍦ㄩ潰鏉夸腑鐨勯『搴忥紝鍊艰秺灏忚秺闈犱笂鏄剧ず銆?
	public setSeriesOrder(order: number): void {
		const pane = this._series.model().paneForSource(this._series);
		if (pane === null) {
			return;
		}

		pane.setSeriesOrder(this._series, order);
	}

	// 鏁版嵁鍙戠敓鍙樺寲鏃惰Е鍙戣闃呭洖璋冦€?
	private _onDataChanged(scope: DataChangedScope): void {
		if (this._dataChangedDelegate.hasListeners()) {
			this._dataChangedDelegate.fire(scope);
		}
	}
}

