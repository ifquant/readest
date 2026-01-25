/**
 * Default font family.
 * Must be used to generate font string when font is not specified.
 */
export const defaultFontFamily = `-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif`;

/**
 * Generates a font string, which can be used to set in canvas' font property.
 * If no family provided, {@link defaultFontFamily} will be used.
 *
 * @param size - Font size in pixels.
 * @param family - Optional font family.
 * @param style - Optional font style.
 * @returns The font string.
 */
export function makeFont(size: number, family?: string, style?: string): string {
	if (style !== undefined) {
		// 给 style 后面补空格，方便与字号拼接
		style = `${style} `;
	} else {
		style = '';
	}

	if (family === undefined) {
		// 未显式传入字体时回退到库默认集合
		family = defaultFontFamily;
	}

	// Canvas font 格式：“{style?} {size}px {family}”
	return `${style}${size}px ${family}`;
}
