import { Coordinate } from './coordinate';

/**
 * 鼠标/触摸事件数据，记录指针在不同坐标系下的位置以及修饰键状态。
 * 参考 {@link https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent | MouseEvent}
 */
export interface TouchMouseEventData {
	/** 鼠标在 DOM 内容坐标系下的 X。 */
	readonly clientX: Coordinate;
	/** 鼠标在 DOM 内容坐标系下的 Y。 */
	readonly clientY: Coordinate;
	/** 相对于整个文档的 X 坐标。 */
	readonly pageX: Coordinate;
	/** 相对于整个文档的 Y 坐标。 */
	readonly pageY: Coordinate;
	/** 屏幕坐标系下的 X 值。 */
	readonly screenX: Coordinate;
	/** 屏幕坐标系下的 Y 值。 */
	readonly screenY: Coordinate;
	/** 相对于图表/价格轴/时间轴 canvas 的 X。 */
	readonly localX: Coordinate;
	/** 相对于图表/价格轴/时间轴 canvas 的 Y。 */
	readonly localY: Coordinate;

	/** 是否按下 Ctrl 键。 */
	readonly ctrlKey: boolean;
	/** 是否按下 Alt（Option）键。 */
	readonly altKey: boolean;
	/** 是否按下 Shift 键。 */
	readonly shiftKey: boolean;
	/** 是否按下 Meta 键（macOS ⌘ 或 Windows 徽标键）。 */
	readonly metaKey: boolean;
}
