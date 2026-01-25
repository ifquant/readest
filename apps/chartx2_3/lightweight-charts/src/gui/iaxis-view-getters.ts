import { IDataSource } from '../model/idata-source';
import { Pane } from '../model/pane';
import { IAxisView } from '../views/pane/iaxis-view';

// IAxisViewsGetter 用于从数据源获取指定轴上的视图集合，pane 仅在价格轴时需要
export type IAxisViewsGetter = (
	source: IDataSource,
	pane?: Pane,
) => readonly IAxisView[];

// price/time axis 共用相同函数签名
export type IPriceAxisViewsGetter = IAxisViewsGetter;
export type ITimeAxisViewsGetter = IAxisViewsGetter;
