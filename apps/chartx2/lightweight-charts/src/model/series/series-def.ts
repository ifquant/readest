import { IUpdatablePaneView } from '../../views/pane/iupdatable-pane-view';

import { IChartModelBase } from '../chart-model';
import { ICustomSeriesPaneView } from '../icustom-series';
import { ISeries } from '../iseries';
import { SeriesStyleOptionsMap, SeriesType } from '../series-options';

/**
 * 系列定义接口，描述系列类型与默认配置。
 */
export interface SeriesDefinition<T extends SeriesType> {
	/**
	 * 系列类型标识。
	 */
	readonly type: T;
	/**
	 * 是否为内置系列。
	 */
	readonly isBuiltIn: boolean;
	/**
	 * 默认样式配置。
	 */
	readonly defaultOptions: SeriesStyleOptionsMap[T];
}

export const isSeriesDefinition = <T extends SeriesType>(value: unknown): value is SeriesDefinitionInternal<T> => {
	return (value as SeriesDefinitionInternal<T>).createPaneView !== undefined;
};

export interface SeriesDefinitionInternal<T extends SeriesType> extends SeriesDefinition<T> {
	createPaneView: (series: ISeries<T>, model: IChartModelBase, customPaneView?: ICustomSeriesPaneView<unknown>) => IUpdatablePaneView;
	customPaneView?: ICustomSeriesPaneView<unknown>;
}
