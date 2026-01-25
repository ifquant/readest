import { IUpdatablePaneView } from '../../views/pane/iupdatable-pane-view';

import { IChartModelBase } from '../chart-model';
import { ISeries } from '../iseries';
import { HistogramStyleOptions } from '../series-options';
import { SeriesHistogramPaneView } from './histogram-pane-view';
import { SeriesDefinition, SeriesDefinitionInternal } from './series-def';

// 直方图默认颜色与基线设置。
export const histogramStyleDefaults: HistogramStyleOptions = {
	color: '#26a69a',
	base: 0,
};
const createPaneView = (series: ISeries<'Histogram'>, model: IChartModelBase): IUpdatablePaneView => new SeriesHistogramPaneView(series, model);

// 构建直方图系列定义。
export const createSeries = (): SeriesDefinition<'Histogram'> => {
	const definition: SeriesDefinitionInternal<'Histogram'> = {
		type: 'Histogram',
		isBuiltIn: true as const,
		defaultOptions: histogramStyleDefaults,
		/**
		 * @internal
		 */
		createPaneView: createPaneView,
	};
	return definition as SeriesDefinition<'Histogram'>;
};
export const histogramSeries: SeriesDefinition<'Histogram'> = createSeries();
