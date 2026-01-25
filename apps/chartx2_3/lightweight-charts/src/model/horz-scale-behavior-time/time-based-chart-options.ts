import { ChartOptionsImpl } from '../chart-model';
import { HorzScaleOptions } from '../time-scale';
import { TickMarkFormatter } from './horz-scale-behavior-time';
import { Time } from './types';

/**
 * 时间轴扩展配置，可自定义刻度格式化逻辑。
 */
export interface TimeScaleOptions extends HorzScaleOptions {
	/**
	 * 自定义时间刻度标签的格式化函数。
	 *
	 * @defaultValue `undefined`
	 */
	tickMarkFormatter?: TickMarkFormatter;
}

/**
 * 横轴为时间的图表配置，包含时间轴子配置。
 */
export interface TimeChartOptions extends ChartOptionsImpl<Time> {
	/**
	 * 时间轴扩展配置，可覆盖默认 tickMarkFormatter。
	 */
	timeScale: TimeScaleOptions;
}
