import {
	IDataSourcePaneViews,
} from '../model/idata-source';
import { Pane } from '../model/pane';
import { IPaneView } from '../views/pane/ipane-view';

// IPaneViewsGetter 根据 pane 获取数据源在图表主体中的视图
export type IPaneViewsGetter = (
	source: IDataSourcePaneViews,
	pane: Pane
) => readonly IPaneView[];
