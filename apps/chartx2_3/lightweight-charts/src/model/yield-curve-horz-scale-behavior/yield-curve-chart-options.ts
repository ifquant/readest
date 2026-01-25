import { ChartOptionsImpl } from '../chart-model';

/**
 * 收益率曲线专用配置项。
 */
export interface YieldCurveOptions {
	/**
	 * 最小时间单位，通常代表一个月，用于控制时间刻度粒度。
	 * @defaultValue 1
	 */
	baseResolution: number;

	/**
	 * 保证展示的最小时间范围（以 baseResolution 为单位），即使数据不足也会补齐。
	 * @defaultValue 120 (10 years)
	 */
	minimumTimeRange: number;

	/**
	 * 时间轴起始值（以 baseResolution 为单位）。
	 * @defaultValue 0
	 */
	startTimeRange: number;

	/**
	 * 自定义时间刻度格式化函数，传入月份（或 baseResolution 单位）。
	 */
	formatTime?: (months: number) => string;
}

/**
 * 扩展的收益率曲线图表配置，包含基础配置与专用选项。
 */
export interface YieldCurveChartOptions extends ChartOptionsImpl<number> {
	/**
	 * 收益率曲线相关的所有行为和显示设置。
	 */
	yieldCurve: YieldCurveOptions;
}
