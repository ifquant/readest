// 面板模型，用作渲染时的上下文
import { Pane } from '../../model/pane';
// 坐标轴渲染器接口
import { IAxisRenderer } from '../../renderers/iaxis-view-renderer';

// 定义轴视图约定：根据面板返回对应渲染器
export interface IAxisView {
	renderer(pane: Pane): IAxisRenderer | null;
}
