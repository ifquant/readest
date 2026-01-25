// 寮曞叆鍧愭爣绫诲瀷锛岀‘淇濈嚎娈电偣涓庡潗鏍囦綋绯诲吋瀹?
import { Coordinate } from '../typings/coordinate';

/**
 * Represents the width of a line.
 */
export type LineWidth = 1 | 2 | 3 | 4;

/**
 * Represents the possible line types.
 */
export const enum LineType {
	/**
	 * A line.
	 */
	Simple,
	/**
	 * A stepped line.
	 */
	WithSteps,
	/**
	 * A curved line.
	 */
	Curved,
}

/**
 * A point on a line.
 */
export interface LinePoint {
	/**
	 * The point's x coordinate.
	 */
	x: Coordinate;
	/**
	 * The point's y coordinate.
	 */
	y: Coordinate;
}

/**
 * Represents the possible line styles.
 */
export const enum LineStyle {
	/**
	 * A solid line.
	 */
	Solid = 0,
	/**
	 * A dotted line.
	 */
	Dotted = 1,
	/**
	 * A dashed line.
	 */
	Dashed = 2,
	/**
	 * A dashed line with bigger dashes.
	 */
	LargeDashed = 3,
	/**
	 * A dotted line with more space between dots.
	 */
	SparseDotted = 4,
}

export function setLineStyle(ctx: CanvasRenderingContext2D, style: LineStyle): void {
	// 灏嗕笉鍚岀嚎鍨嬫槧灏勫埌瀵瑰簲鐨勮櫄绾挎ā鏉?
	const dashPatterns = {
		[LineStyle.Solid]: [],
		[LineStyle.Dotted]: [ctx.lineWidth, ctx.lineWidth],
		[LineStyle.Dashed]: [2 * ctx.lineWidth, 2 * ctx.lineWidth],
		[LineStyle.LargeDashed]: [6 * ctx.lineWidth, 6 * ctx.lineWidth],
		[LineStyle.SparseDotted]: [ctx.lineWidth, 4 * ctx.lineWidth],
	};

	// 鏍规嵁绾垮瀷鑾峰彇瀵瑰簲鐨勮櫄绾挎ā寮?
	const dashPattern = dashPatterns[style];
	// 搴旂敤铏氱嚎妯″紡
	ctx.setLineDash(dashPattern);
}

export function drawHorizontalLine(ctx: CanvasRenderingContext2D, y: number, left: number, right: number): void {
	// 寮€濮嬫柊璺緞
	ctx.beginPath();
	// 璋冩暣鍗婂儚绱犲亸绉伙紝纭繚绾挎潯鍦ㄥ伓/濂囩嚎瀹芥椂瀵归綈鍍忕礌
	const correction = (ctx.lineWidth % 2) ? 0.5 : 0;
	// 灏嗚捣鐐圭Щ鍔ㄥ埌宸︿晶
	ctx.moveTo(left, y + correction);
	// 缁樺埗鍒板彸渚?
	ctx.lineTo(right, y + correction);
	// 鎻忚竟杈撳嚭
	ctx.stroke();
}

export function drawVerticalLine(ctx: CanvasRenderingContext2D, x: number, top: number, bottom: number): void {
	// 寮€濮嬫柊璺緞
	ctx.beginPath();
	// 璋冩暣鍗婂儚绱犲亸绉?
	const correction = (ctx.lineWidth % 2) ? 0.5 : 0;
	// 灏嗚捣鐐圭Щ鍔ㄥ埌椤堕儴
	ctx.moveTo(x + correction, top);
	// 缁樺埗鍒颁笅鏂?
	ctx.lineTo(x + correction, bottom);
	// 鎻忚竟杈撳嚭
	ctx.stroke();
}

export function strokeInPixel(ctx: CanvasRenderingContext2D, drawFunction: () => void): void {
	// 淇濆瓨褰撳墠鐢诲竷鐘舵€?
	ctx.save();
	// 鑻ョ嚎瀹戒负濂囨暟锛屽钩绉诲崐涓儚绱犱互鑾峰緱閿愬埄绾挎潯
	if (ctx.lineWidth % 2) {
		ctx.translate(0.5, 0.5);
	}
	// 鎵ц瀹為檯缁樺埗閫昏緫
	drawFunction();
	// 鎭㈠鐢诲竷鐘舵€?
	ctx.restore();
}

