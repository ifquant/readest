import { Nominal } from '../../helpers/nominal';
import { isNumber, isString } from '../../helpers/strict-type-checks';

/**
 * 表示一个 UNIX 时间戳（秒级）。
 *
 * 适用于日内级别的图表。注意 `Date.now()` 返回的是毫秒，需要除以 1000。
 * 建议在 TypeScript 中显式断言为 `UTCTimestamp`。
 */
export type UTCTimestamp = Nominal<number, 'UTCTimestamp'>;

/**
 * 以年月日形式表示的业务日期。
 */
export interface BusinessDay {
	/**
	 * 年份。
	 */
	year: number;
	/**
	 * 月份。
	 */
	month: number;
	/**
	 * 日。
	 */
	day: number;
}

/**
 * 数据项使用的时间类型，可以是时间戳、业务日期或 ISO 字符串。
 */
export type Time = UTCTimestamp | BusinessDay | string;

export interface TimePoint {
	timestamp: UTCTimestamp;
	businessDay?: BusinessDay;
}

/**
 * 判断是否为业务日期对象。
 */
export function isBusinessDay(time: Time): time is BusinessDay {
	return !isNumber(time) && !isString(time);
}

/**
 * 判断是否为 UTC 时间戳。
 */
export function isUTCTimestamp(time: Time): time is UTCTimestamp {
	return isNumber(time);
}

/**
 * 时间轴刻度标签类别。
 */
export const enum TickMarkType {
	/**
	 * 年度起始刻度。
	 */
	Year,
	/**
	 * 月度起始刻度。
	 */
	Month,
	/**
	 * 月内具体日期。
	 */
	DayOfMonth,
	/**
	 * 不包含秒的时间。
	 */
	Time,
	/**
	 * 包含秒的时间。
	 */
	TimeWithSeconds,
}

/**
 * 刻度权重，表示与前一个时间点相比变化的粒度。
 */
export const enum TickMarkWeight {
	LessThanSecond = 0,
	Second = 10,
	Minute1 = 20,
	Minute5 = 21,
	Minute30 = 22,
	Hour1 = 30,
	Hour3 = 31,
	Hour6 = 32,
	Hour12 = 33,
	Day = 50,
	Month = 60,
	Year = 70,
}
