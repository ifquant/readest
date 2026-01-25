import { Size } from 'fancy-canvas';

import { TimeAxisWidget } from '../gui/time-axis-widget';

import { assert } from '../helpers/assertions';
import { Delegate } from '../helpers/delegate';
import { IDestroyable } from '../helpers/idestroyable';
import { clone, DeepPartial } from '../helpers/strict-type-checks';

import { ChartModel } from '../model/chart-model';
import { Coordinate } from '../typings/coordinate';
import { IHorzScaleBehavior, InternalHorzScaleItem } from '../model/ihorz-scale-behavior';
import { IRange, Logical, LogicalRange, TimePointIndex } from '../model/time-data';
import { HorzScaleOptions, TimeScale } from '../model/time-scale';

import {
	ITimeScaleApi,
	LogicalRangeChangeEventHandler,
	SizeChangeEventHandler,
	TimeRangeChangeEventHandler,
} from './itime-scale-api';
const enum Constants {
	AnimationDurationMs = 1000,
}

// TimeScaleApi 灏佽鍥捐〃姘村钩鏃堕棿鍒诲害鐨勪氦浜掕兘鍔涳紝
// 璐熻矗鍙鑼冨洿鎺у埗銆佸潗鏍囦笌鏃堕棿杞崲浠ュ強灏哄璁㈤槄绛夊姛鑳姐€?
export class TimeScaleApi<HorzScaleItem> implements ITimeScaleApi<HorzScaleItem>, IDestroyable {
	private _model: ChartModel<HorzScaleItem>;
	private _timeScale: TimeScale<HorzScaleItem>;
	private readonly _timeAxisWidget: TimeAxisWidget<HorzScaleItem>;
	private readonly _timeRangeChanged: Delegate<IRange<HorzScaleItem> | null> = new Delegate();
	private readonly _logicalRangeChanged: Delegate<LogicalRange | null> = new Delegate();
	private readonly _sizeChanged: Delegate<number, number> = new Delegate();

	private readonly _horzScaleBehavior: IHorzScaleBehavior<HorzScaleItem>;

	public constructor(model: ChartModel<HorzScaleItem>, timeAxisWidget: TimeAxisWidget<HorzScaleItem>, horzScaleBehavior: IHorzScaleBehavior<HorzScaleItem>) {
		this._model = model;
		this._timeScale = model.timeScale();
		this._timeAxisWidget = timeAxisWidget;
		this._timeScale.visibleBarsChanged().subscribe(this._onVisibleBarsChanged.bind(this));
		this._timeScale.logicalRangeChanged().subscribe(this._onVisibleLogicalRangeChanged.bind(this));
		this._timeAxisWidget.sizeChanged().subscribe(this._onSizeChanged.bind(this));

		this._horzScaleBehavior = horzScaleBehavior;
	}

	// 娉ㄩ攢鎵€鏈夎闃咃紝閬垮厤寮曠敤鎮寕瀵艰嚧鍐呭瓨娉勬紡銆?
	public destroy(): void {
		this._timeScale.visibleBarsChanged().unsubscribeAll(this);
		this._timeScale.logicalRangeChanged().unsubscribeAll(this);
		this._timeAxisWidget.sizeChanged().unsubscribeAll(this);
		this._timeRangeChanged.destroy();
		this._logicalRangeChanged.destroy();
		this._sizeChanged.destroy();
	}

	// 鑾峰彇褰撳墠鐨勫彸鍋忕Щ閲忥紙姝ｅ€艰〃绀哄悜鏈潵婊氬姩鐨勮窛绂伙級銆?
	public scrollPosition(): number {
		return this._timeScale.rightOffset();
	}

	// 灏嗘椂闂磋酱婊氬姩鍒版寚瀹氬亸绉伙紝鍙€夊姩鐢昏繃娓°€?
	public scrollToPosition(position: number, animated: boolean): void {
		if (!animated) {
			this._model.setRightOffset(position);
			return;
		}

		this._timeScale.scrollToOffsetAnimated(position, Constants.AnimationDurationMs);
	}

	// 婊氬姩鑷虫渶鏂版暟鎹綅缃€?
	public scrollToRealTime(): void {
		this._timeScale.scrollToRealTime();
	}

	// 鑾峰彇鍙鐨勬椂闂磋寖鍥达紙鎸夊閮ㄦ椂闂寸被鍨嬶級銆?
	public getVisibleRange(): IRange<HorzScaleItem> | null {
		const timeRange = this._timeScale.visibleTimeRange();

		if (timeRange === null) {
			return null;
		}

		return {
			from: timeRange.from.originalTime as HorzScaleItem,
			to: timeRange.to.originalTime as HorzScaleItem,
		};
	}

	// 璁剧疆鍙鏃堕棿鑼冨洿锛屽唴閮ㄤ細杞崲涓洪€昏緫鑼冨洿鍚庝氦缁欐ā鍨嬨€?
	public setVisibleRange(range: IRange<HorzScaleItem>): void {
		const convertedRange: IRange<InternalHorzScaleItem> = {
			from: this._horzScaleBehavior.convertHorzItemToInternal(range.from),
			to: this._horzScaleBehavior.convertHorzItemToInternal(range.to),
		};
		const logicalRange = this._timeScale.logicalRangeForTimeRange(convertedRange);

		this._model.setTargetLogicalRange(logicalRange);
	}

	// 杩斿洖鍙鐨勯€昏緫鑼冨洿锛堜互鏉＄储寮曡〃绀猴級銆?
	public getVisibleLogicalRange(): LogicalRange | null {
		const logicalRange = this._timeScale.visibleLogicalRange();
		if (logicalRange === null) {
			return null;
		}

		return {
			from: logicalRange.left(),
			to: logicalRange.right(),
		};
	}

	// 璁剧疆閫昏緫鑼冨洿锛岄渶瑕佷繚璇?from <= to銆?
	public setVisibleLogicalRange(range: IRange<number>): void {
		assert(range.from <= range.to, 'The from index cannot be after the to index.');
		this._model.setTargetLogicalRange(range as LogicalRange);
	}

	// 閲嶇疆鏃堕棿杞达紝浣垮叾鍥炲埌鍒濆瑙嗗浘銆?
	public resetTimeScale(): void {
		this._model.resetTimeScale();
	}

	// 璋冩暣瑙嗗浘浠ヨ鐩栧叏閮ㄦ暟鎹€?
	public fitContent(): void {
		this._model.fitContent();
	}

	// 灏嗛€昏緫绱㈠紩杞崲涓哄睆骞曞潗鏍囷紝绌烘暟鎹椂杩斿洖 null銆?
	public logicalToCoordinate(logical: Logical): Coordinate | null {
		const timeScale = this._model.timeScale();

		if (timeScale.isEmpty()) {
			return null;
		} else {
			return timeScale.indexToCoordinate(logical as unknown as TimePointIndex);
		}
	}

	// 灏嗗儚绱犲潗鏍囪浆鎹负閫昏緫绱㈠紩銆?
	public coordinateToLogical(x: number): Logical | null {
		if (this._timeScale.isEmpty()) {
			return null;
		} else {
			return this._timeScale.coordinateToIndex(x as Coordinate) as unknown as Logical;
		}
	}

	// 鏍规嵁澶栭儴鏃堕棿鍊兼煡鎵鹃€昏緫绱㈠紩锛屽彲閫夋嫨瀵绘壘鏈€杩戠偣銆?
	public timeToIndex(time: HorzScaleItem, findNearest: boolean): TimePointIndex | null {
		const timePoint = this._horzScaleBehavior.convertHorzItemToInternal(time);
		return this._timeScale.timeToIndex(timePoint, findNearest);
	}

	// 灏嗘椂闂村€艰浆鎹负灞忓箷鍧愭爣銆?
	public timeToCoordinate(time: HorzScaleItem): Coordinate | null {
		const timePointIndex = this.timeToIndex(time, false);
		if (timePointIndex === null) {
			return null;
		}

		return this._timeScale.indexToCoordinate(timePointIndex);
	}

	// 灏嗗儚绱犲潗鏍囪浆鎹负澶栭儴鏃堕棿銆?
	public coordinateToTime(x: number): HorzScaleItem | null {
		const timeScale = this._model.timeScale();
		const timePointIndex = timeScale.coordinateToIndex(x as Coordinate);
		const timePoint = timeScale.indexToTimeScalePoint(timePointIndex);
		if (timePoint === null) {
			return null;
		}

		return timePoint.originalTime as HorzScaleItem;
	}

	// 鑾峰彇鏃堕棿杞村搴︺€?
	public width(): number {
		return this._timeAxisWidget.getSize().width;
	}

	// 鑾峰彇鏃堕棿杞撮珮搴︺€?
	public height(): number {
		return this._timeAxisWidget.getSize().height;
	}

	// 璁㈤槄鍙鏃堕棿鑼冨洿鍙樺寲銆?
	public subscribeVisibleTimeRangeChange(handler: TimeRangeChangeEventHandler<HorzScaleItem>): void {
		this._timeRangeChanged.subscribe(handler);
	}

	// 鍙栨秷鍙鏃堕棿鑼冨洿鍙樺寲璁㈤槄銆?
	public unsubscribeVisibleTimeRangeChange(handler: TimeRangeChangeEventHandler<HorzScaleItem>): void {
		this._timeRangeChanged.unsubscribe(handler);
	}

	// 璁㈤槄閫昏緫鑼冨洿鍙樺寲銆?
	public subscribeVisibleLogicalRangeChange(handler: LogicalRangeChangeEventHandler): void {
		this._logicalRangeChanged.subscribe(handler);
	}

	// 鍙栨秷閫昏緫鑼冨洿鍙樺寲璁㈤槄銆?
	public unsubscribeVisibleLogicalRangeChange(handler: LogicalRangeChangeEventHandler): void {
		this._logicalRangeChanged.unsubscribe(handler);
	}

	// 璁㈤槄鏃堕棿杞村昂瀵告敼鍙樹簨浠躲€?
	public subscribeSizeChange(handler: SizeChangeEventHandler): void {
		this._sizeChanged.subscribe(handler);
	}

	// 鍙栨秷灏哄鏀瑰彉璁㈤槄銆?
	public unsubscribeSizeChange(handler: SizeChangeEventHandler): void {
		this._sizeChanged.unsubscribe(handler);
	}

	// 搴旂敤鏃堕棿杞撮厤缃」銆?
	public applyOptions(options: DeepPartial<HorzScaleOptions>): void {
		this._timeScale.applyOptions(options);
	}

	// 杩斿洖鏃堕棿杞村綋鍓嶉厤缃紝鍏朵腑 barSpacing 浠?TimeScale 杩愯鏃惰鍙栥€?
	public options(): Readonly<HorzScaleOptions> {
		return {
			...clone(this._timeScale.options()),
			barSpacing: this._timeScale.barSpacing(),
		};
	}

	// 鍙鏉¤寖鍥村彉鍖栨椂瑙﹀彂澶栭儴鍥炶皟銆?
	private _onVisibleBarsChanged(): void {
		if (this._timeRangeChanged.hasListeners()) {
			this._timeRangeChanged.fire(this.getVisibleRange());
		}
	}

	// 鍙閫昏緫鑼冨洿鍙樺寲鏃惰Е鍙戝閮ㄥ洖璋冦€?
	private _onVisibleLogicalRangeChanged(): void {
		if (this._logicalRangeChanged.hasListeners()) {
			this._logicalRangeChanged.fire(this.getVisibleLogicalRange());
		}
	}

	// 鏃堕棿杞村昂瀵稿彉鍖栭€氱煡璁㈤槄鑰呫€?
	private _onSizeChanged(size: Size): void {
		this._sizeChanged.fire(size.width, size.height);
	}
}

