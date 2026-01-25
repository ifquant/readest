import { ensureDefined } from '../helpers/assertions';

import { IHorzScaleBehavior } from './ihorz-scale-behavior';
import { TickMark } from './tick-marks';

/**
 * 缓存键对应的格式化结果以及最近使用的时间戳（tick）。
 */
interface CachedTick {
	string: string;
	tick: number;
}

export type FormatFunction = (tickMark: TickMark) => string;

/**
 * 针对横轴刻度的格式化结果缓存，避免重复格式化带来的性能开销。
 * 采用简单的 LRU（最近最少使用）策略，使用 `_usageTick` 标记访问顺序。
 */
export class FormattedLabelsCache<HorzScaleItem> {
	private readonly _format: FormatFunction;
	private readonly _maxSize: number;
	private _actualSize: number = 0;
	private _usageTick: number = 1;
	private _oldestTick: number = 1;
	private _cache: Map<number, CachedTick> = new Map();
	private _tick2Labels: Map<number, number> = new Map();

	private readonly _horzScaleBehavior: IHorzScaleBehavior<HorzScaleItem>;

	/**
	 * @param format 生成刻度文本的格式化函数。
	 * @param horzScaleBehavior 横轴行为抽象，提供缓存键生成方式。
	 * @param size 缓存容量上限，默认为 50。
	 */
	public constructor(format: FormatFunction, horzScaleBehavior: IHorzScaleBehavior<HorzScaleItem>, size: number = 50) {
		this._format = format;
		this._horzScaleBehavior = horzScaleBehavior;
		this._maxSize = size;
	}

	/**
	 * 获取某个刻度的格式化字符串，如缓存命中直接返回，否则计算并写入缓存。
	 */
	public format(tickMark: TickMark): string {
		const time = tickMark.time;

		const cacheKey = this._horzScaleBehavior.cacheKey(time);

		const tick = this._cache.get(cacheKey);
		if (tick !== undefined) {
			return tick.string;
		}

		if (this._actualSize === this._maxSize) {
			// 达到容量上限时淘汰最旧的条目。
			const oldestValue = this._tick2Labels.get(this._oldestTick);
			this._tick2Labels.delete(this._oldestTick);
			this._cache.delete(ensureDefined(oldestValue));
			this._oldestTick++;
			this._actualSize--;
		}

		const str = this._format(tickMark);
		this._cache.set(cacheKey, { string: str, tick: this._usageTick });
		this._tick2Labels.set(this._usageTick, cacheKey);
		this._actualSize++;
		this._usageTick++;
		return str;
	}
}
