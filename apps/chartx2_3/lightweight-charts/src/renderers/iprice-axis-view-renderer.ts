// 引入 Canvas 渲染目标类型
import { CanvasRenderingTarget2D } from 'fancy-canvas';

// 文本宽度缓存，用于避免重复测量
import { TextWidthCache } from '../model/text-width-cache';

// 线宽枚举，定义刻度线粗细
import { LineWidth } from './draw-line';

// 价格轴视图通用数据，例如背景与坐标
export interface PriceAxisViewRendererCommonData {
	activeBackground?: string;
	background: string;
	coordinate: number;
	fixedCoordinate?: number;
	additionalPaddingTop: number;
	additionalPaddingBottom: number;
}

// 价格轴视图渲染时的状态数据
export interface PriceAxisViewRendererData {
	visible: boolean;
	text: string;
	tickVisible: boolean;
	moveTextToInvisibleTick: boolean;
	borderColor: string;
	color: string;
	lineWidth?: LineWidth;
	borderVisible: boolean;
	separatorVisible: boolean;
}

// 价格轴视图的样式配置选项
export interface PriceAxisViewRendererOptions {
	baselineOffset: number;
	borderSize: number;
	font: string;
	fontFamily: string;
	color: string;
	paneBackgroundColor: string;
	fontSize: number;
	paddingBottom: number;
	paddingInner: number;
	paddingOuter: number;
	paddingTop: number;
	tickLength: number;
}

// 价格轴视图渲染器接口，定义绘制与尺寸计算
export interface IPriceAxisViewRenderer {
	draw(
		target: CanvasRenderingTarget2D,
		rendererOptions: PriceAxisViewRendererOptions,
		textWidthCache: TextWidthCache,
		align: 'left' | 'right'
	): void;

	height(rendererOptions: PriceAxisViewRendererOptions, useSecondLine: boolean): number;
	setData(data: PriceAxisViewRendererData, commonData: PriceAxisViewRendererCommonData): void;
}

// 渲染器构造函数类型定义
export type IPriceAxisViewRendererConstructor = new(data: PriceAxisViewRendererData, commonData: PriceAxisViewRendererCommonData) => IPriceAxisViewRenderer;
