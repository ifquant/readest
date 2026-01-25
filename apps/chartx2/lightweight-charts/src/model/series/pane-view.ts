import { IUpdatablePaneView } from '../../views/pane/iupdatable-pane-view';

import { IChartModelBase } from '../chart-model';
import { CustomData, CustomSeriesPricePlotValues, CustomSeriesWhitespaceData } from '../icustom-series';
import { ISeries } from '../iseries';
import { SeriesType } from '../series-options';

// 自定义系列的面板视图接口，扩展价格和空白判断能力。
export interface ISeriesCustomPaneView extends IUpdatablePaneView {
	priceValueBuilder(plotRow: CustomData<unknown> | CustomSeriesWhitespaceData<unknown>): CustomSeriesPricePlotValues;
	isWhitespace(data: CustomData<unknown> | CustomSeriesWhitespaceData<unknown>): data is CustomSeriesWhitespaceData<unknown>;
}
// 内置系列面板视图工厂类型。
export type BuiltInPaneViewFactory<T extends SeriesType> = (series: ISeries<T>, model: IChartModelBase) => IUpdatablePaneView;
