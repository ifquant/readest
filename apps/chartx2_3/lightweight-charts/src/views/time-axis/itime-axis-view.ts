// 时间轴渲染器类型
import { TimeAxisViewRenderer } from '../../renderers/time-axis-view-renderer';

// 时间轴视图接口：返回可绘制的渲染器
export interface ITimeAxisView {
	renderer(): TimeAxisViewRenderer;
}
