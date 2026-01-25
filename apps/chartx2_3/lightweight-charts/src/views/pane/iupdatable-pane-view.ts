// 基础面板视图接口
import { IPaneView } from './ipane-view';

// 更新类型枚举，区分数据变化与配置变化
export type UpdateType = 'data' | 'other' | 'options';

// 支持更新钩子的面板视图接口
export interface IUpdatablePaneView extends IPaneView {
	// 当 updateType 未指定时表示全量刷新
	update(updateType?: UpdateType): void;
}
