import { ensureNever } from '../../helpers/assertions';

import { TickMarkType, TimePoint } from './types';

// 默认的时间刻度格式化器，根据刻度类型选择最合适的日期/时间输出。
export function defaultTickMarkFormatter(timePoint: TimePoint, tickMarkType: TickMarkType, locale: string): string {
	const formatOptions: Intl.DateTimeFormatOptions = {};

	switch (tickMarkType) {
		case TickMarkType.Year:
			formatOptions.year = 'numeric';
			break;

		case TickMarkType.Month:
			formatOptions.month = 'short';
			break;

		case TickMarkType.DayOfMonth:
			formatOptions.day = 'numeric';
			break;

		case TickMarkType.Time:
			formatOptions.hour12 = false;
			formatOptions.hour = '2-digit';
			formatOptions.minute = '2-digit';
			break;

		case TickMarkType.TimeWithSeconds:
			formatOptions.hour12 = false;
			formatOptions.hour = '2-digit';
			formatOptions.minute = '2-digit';
			formatOptions.second = '2-digit';
			break;

		default:
			ensureNever(tickMarkType);
	}

	const date = timePoint.businessDay === undefined
		? new Date(timePoint.timestamp * 1000)
		: new Date(Date.UTC(timePoint.businessDay.year, timePoint.businessDay.month - 1, timePoint.businessDay.day));

	// 给定的日期应被视为 UTC 时间，但为了按本地化输出，需要转换成本地时间。
	const localDateFromUtc = new Date(
		date.getUTCFullYear(),
		date.getUTCMonth(),
		date.getUTCDate(),
		date.getUTCHours(),
		date.getUTCMinutes(),
		date.getUTCSeconds(),
		date.getUTCMilliseconds()
	);

	return localDateFromUtc.toLocaleString(locale, formatOptions);
}
