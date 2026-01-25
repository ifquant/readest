import { IUpdatablePaneView } from '../../views/pane/iupdatable-pane-view';

import { IChartModelBase } from '../chart-model';
import { ISeries } from '../iseries';
import { BarStyleOptions } from '../series-options';
import { SeriesBarsPaneView } from './bars-pane-view';
import { SeriesDefinition, SeriesDefinitionInternal } from './series-def';

// 柱状图默认样式：上下颜色、开盘价显示等。
export const barStyleDefaults: BarStyleOptions = {
	upColor: '#26a69a',
	downColor: '#ef5350',
	openVisible: true,
	thinBars: true,
};
const createPaneView = (series: ISeries<'Bar'>, model: IChartModelBase): IUpdatablePaneView => new SeriesBarsPaneView(series, model);

// 注册柱状图系列定义。
export const createSeries = (): SeriesDefinition<'Bar'> => {
	const definition: SeriesDefinitionInternal<'Bar'> = {
		type: 'Bar',
		isBuiltIn: true as const,
		defaultOptions: barStyleDefaults,
		/**
		 * @internal
		 */
		createPaneView: createPaneView,
	};

	return definition as SeriesDefinition<'Bar'>;
};
export const barSeries: SeriesDefinition<'Bar'> = createSeries();
