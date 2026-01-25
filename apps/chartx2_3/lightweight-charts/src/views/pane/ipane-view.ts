// 面板模型，提供尺寸和坐标转换
import { Pane } from '../../model/pane';
// 面板渲染器接口
import { IPaneRenderer } from '../../renderers/ipane-renderer';

// 面板视图接口：返回用于绘制的渲染器实例，可选启用锚点
export interface IPaneView {
	renderer(pane: Pane, addAnchors?: boolean): IPaneRenderer | null;
}
