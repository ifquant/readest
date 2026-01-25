import { Nominal } from '../helpers/nominal';

/**
 * RGB 颜色中的红色分量，合法范围为 [0, 255] 的整数。
 */
type RedComponent = Nominal<number, 'RedComponent'>;

/**
 * RGB 颜色中的绿色分量，合法范围为 [0, 255] 的整数。
 */
type GreenComponent = Nominal<number, 'GreenComponent'>;

/**
 * RGB 颜色中的蓝色分量，合法范围为 [0, 255] 的整数。
 */
type BlueComponent = Nominal<number, 'BlueComponent'>;

/**
 * RGBA 中的透明度分量，合法范围为 [0, 1] 之间的数值。
 */
type AlphaComponent = Nominal<number, 'AlphaComponent'>;

export type Rgba = [RedComponent, GreenComponent, BlueComponent, AlphaComponent];

/**
 * 归一化 RGB 分量，将任意数字映射到合法的 0-255 整数范围。
 */
function normalizeRgbComponent<
	T extends RedComponent | GreenComponent | BlueComponent
>(component: number): T {
	if (component < 0) {
		return 0 as T;
	}
	if (component > 255) {
		return 255 as T;
	}
	// NaN values are treated as 0
	return (Math.round(component) || 0) as T;
}

/**
 * 限制透明度分量到 0-1 且保留 4 位小数精度。
 */
function normalizeAlphaComponent(component: AlphaComponent): AlphaComponent {
	if (component <= 0 || component > 1) {
		return Math.min(Math.max(component, 0), 1) as AlphaComponent;
	}
	// limit the precision of all numbers to at most 4 digits in fractional part
	return (Math.round(component * 10000) / 10000) as AlphaComponent;
}

/**
 * 将 RGBA 转换为灰度值，系数源自 NTSC RGB→YUV 公式。
 */
function rgbaToGrayscale(rgbValue: Rgba): number {
	// 系数来源于 NTSC RGB → YUV 转换公式，由社区贡献者调优。
	const redComponentGrayscaleWeight = 0.199;
	const greenComponentGrayscaleWeight = 0.687;
	const blueComponentGrayscaleWeight = 0.114;

	return (
		redComponentGrayscaleWeight * rgbValue[0] +
		greenComponentGrayscaleWeight * rgbValue[1] +
		blueComponentGrayscaleWeight * rgbValue[2]
	);
}

/**
 * 对于 sRGB 空间的颜色，可借助浏览器计算样式转换为 rgb/rgba 字符串；
 * 若是 display-p3 等更广色域格式，则保持原样返回。
 * 参考：https://www.w3.org/TR/css-color-4/#serializing-sRGB-values
 */
function getRgbStringViaBrowser(color: string): string {
	const element = document.createElement('div');
	element.style.display = 'none';
	// We append to the body as it is the most reliable way to get a color reading
	// appending to the chart container or similar element can result in the following
	// getComputedStyle returning empty strings on each check.
	document.body.appendChild(element);
	element.style.color = color;
	const computed = window.getComputedStyle(element).color;
	document.body.removeChild(element);
	return computed;
}

export interface ContrastColors {
	foreground: string;
	background: string;
}

export type CustomColorParser = (color: string) => Rgba | null;

export class ColorParser {
	private _rgbaCache: Map<string, Rgba> = new Map();
	private _customParsers: CustomColorParser[];

	public constructor(customParsers: CustomColorParser[], initialCache?: Map<string, Rgba>) {
		this._customParsers = customParsers;
		if (initialCache) {
			this._rgbaCache = initialCache;
		}
	}

	/**
	 * 对外提供统一的 alpha 应用逻辑。
	 * 即使传入更广色域的颜色，我们仍退化为 RGBA，
	 * 因为在当前使用场景下额外的颜色空间支持收益不高。
	 */
	public applyAlpha(color: string, alpha: number): string {
		// special case optimization
		if (color === 'transparent') {
			return color;
		}

		const originRgba = this._parseColor(color);
		const originAlpha = originRgba[3];
		return `rgba(${originRgba[0]}, ${originRgba[1]}, ${originRgba[2]}, ${
			alpha * originAlpha
		})`;
	}

	public generateContrastColors(background: string): ContrastColors {
		const rgba = this._parseColor(background);
		return {
			background: `rgb(${rgba[0]}, ${rgba[1]}, ${rgba[2]})`, // no alpha
			foreground: rgbaToGrayscale(rgba) > 160 ? 'black' : 'white',
		};
	}

	/**
	 * 返回指定颜色的灰度值，便于在图形润色时评估亮度。
	 */
	public colorStringToGrayscale(background: string): number {
		return rgbaToGrayscale(this._parseColor(background));
	}

	/**
	 * 在顶部颜色与底部颜色之间按百分比插值生成渐变色。
	 */
	public gradientColorAtPercent(
		topColor: string,
		bottomColor: string,
		percent: number
	): string {
		const [topR, topG, topB, topA] = this._parseColor(topColor);
		const [bottomR, bottomG, bottomB, bottomA] = this._parseColor(bottomColor);
		const resultRgba: Rgba = [
			normalizeRgbComponent(
				(topR + percent * (bottomR - topR)) as RedComponent
			),
			normalizeRgbComponent(
				(topG + percent * (bottomG - topG)) as GreenComponent
			),
			normalizeRgbComponent(
				(topB + percent * (bottomB - topB)) as BlueComponent
			),
			normalizeAlphaComponent(
				(topA + percent * (bottomA - topA)) as AlphaComponent
			),
		];
		return `rgba(${resultRgba[0]}, ${resultRgba[1]}, ${resultRgba[2]}, ${resultRgba[3]})`;
	}

	private _parseColor(color: string): Rgba {
		const cached = this._rgbaCache.get(color);
		if (cached) {
			return cached;
		}

		const computed = getRgbStringViaBrowser(color);

		const match = computed.match(
			/^rgba?\s*\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)$/
		);

		if (!match) {
			if (this._customParsers.length) {
				for (const parser of this._customParsers) {
					const result = parser(color);
					if (result) {
						this._rgbaCache.set(color, result);
						return result;
					}
				}
			}
			throw new Error(`Failed to parse color: ${color}`);
		}

		const rgba: Rgba = [
			parseInt(match[1], 10) as RedComponent,
			parseInt(match[2], 10) as GreenComponent,
			parseInt(match[3], 10) as BlueComponent,
			(match[4] ? parseFloat(match[4]) : 1) as AlphaComponent,
		];

		this._rgbaCache.set(color, rgba);

		return rgba;
	}
}
