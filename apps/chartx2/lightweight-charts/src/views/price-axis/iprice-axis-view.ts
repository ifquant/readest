// 价格刻度对象
import { PriceScale } from '../../model/price-scale';
// 价格轴渲染器接口与配置项
import {
	IPriceAxisViewRenderer,
	PriceAxisViewRendererOptions,
} from '../../renderers/iprice-axis-view-renderer';

// 价格轴视图契约：需提供坐标、文本及渲染器等信息
export interface IPriceAxisView {
	coordinate(): number;
	getFixedCoordinate(): number;
	height(rendererOptions: PriceAxisViewRendererOptions, useSecondLine?: boolean): number;
	isVisible(): boolean;
	isAxisLabelVisible(): boolean;
	renderer(priceScale: PriceScale): IPriceAxisViewRenderer;
	paneRenderer(): IPriceAxisViewRenderer;
	setFixedCoordinate(value: number | null): void;
	text(): string;
	update(): void;
}
