import { CustomColorParser } from './colors';

/**
 * 颜色类型，区分纯色与垂直渐变。
 */
export const enum ColorType {
	/** 纯色填充。 */
	Solid = 'solid',
	/** 垂直方向渐变色。 */
	VerticalGradient = 'gradient',
}

/**
 * 纯色背景配置。
 */
export interface SolidColor {
	/** 颜色类型标记。 */
	type: ColorType.Solid;

	/** CSS 颜色字符串。 */
	color: string;
}

/**
 * 垂直渐变背景配置。
 */
export interface VerticalGradientColor {
	/** 颜色类型标记。 */
	type: ColorType.VerticalGradient;

	/** 渐变顶部颜色。 */
	topColor: string;

	/** 渐变底部颜色。 */
	bottomColor: string;
}

/**
 * 图表背景，可以是纯色或渐变。
 */
export type Background = SolidColor | VerticalGradientColor;

export type ColorSpace = 'display-p3' | 'srgb';

/**
 * Pane 相关交互配置。
 */
export interface LayoutPanesOptions {
	/**
	* 是否允许用户拖拽调整 Pane 高度。
	*
	* @defaultValue `true`
	*/
	enableResize: boolean;

	/**
	* Pane 分隔条颜色。
	*
	* @defaultValue `#2B2B43`
	*/
	separatorColor: string;

	/**
	* 悬停时分隔条的背景色。
	*
	* @defaultValue `rgba(178, 181, 189, 0.2)`
	*/
	separatorHoverColor: string;
}

/** 布局（背景、字体、Pane 等）总配置。 */
export interface LayoutOptions {
	/**
	 * 图表及坐标轴的背景配置。
	 *
	 * @defaultValue `{ type: ColorType.Solid, color: '#FFFFFF' }`
	 */
	background: Background;

	/**
	 * 坐标轴文本颜色。
	 *
	 * @defaultValue `'#191919'`
	 */
	textColor: string;

	/**
	 * 坐标轴字体大小（像素）。
	 *
	 * @defaultValue `12`
	 */
	fontSize: number;

	/**
	 * 坐标轴字体族。
	 *
	 * @defaultValue `-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif`
	 */
	fontFamily: string;

	/**
	 * Pane 相关配置。
	 *
	 * @defaultValue `{ enableResize: true, separatorColor: '#2B2B43', separatorHoverColor: 'rgba(178, 181, 189, 0.2)'}`
	 */
	panes: LayoutPanesOptions;

	/**
	 * 是否在主图 Pane 显示 TradingView 授权标识。
	 * 若已通过其他方式满足 NOTICE 中的链接要求，可关闭。
	 *
	 * @defaultValue true
	 */
	attributionLogo: boolean;

	/**
	 * 内部 canvas 的颜色空间。
	 * 仅建议在创建阶段配置，不要在运行时更改。
	 *
	 * @defaultValue `srgb`
	 */
	colorSpace: ColorSpace;

	/**
	 * 自定义颜色解析器数组，用于支持 sRGB 之外的颜色字符串。
	 * 每个解析器返回 RGBA 数组或 `null`（表示无法解析），按顺序依次尝试。
	 *
	 * 默认已经支持 Hex、RGB/RGBA、HSL/HSLA、HWB、命名颜色以及 `transparent`。
	 * 若需处理 display-p3、Lab、LCH、Oklab、Oklch 等色域，可以注入额外解析器。
	 */
	colorParsers: CustomColorParser[];
}
