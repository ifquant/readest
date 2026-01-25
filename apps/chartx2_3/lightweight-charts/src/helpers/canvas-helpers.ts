/**
 * Fills rectangle's inner border (so, all the filled area is limited by the [x, x + width]*[y, y + height] region)
 * ```
 * (x, y)
 * O***********************|*****
 * |        border         |  ^
 * |   *****************   |  |
 * |   |               |   |  |
 * | b |               | b |  h
 * | o |               | o |  e
 * | r |               | r |  i
 * | d |               | d |  g
 * | e |               | e |  h
 * | r |               | r |  t
 * |   |               |   |  |
 * |   *****************   |  |
 * |        border         |  v
 * |***********************|*****
 * |                       |
 * |<------- width ------->|
 * ```
 *
 * @param ctx - Context to draw on
 * @param x - Left side of the target rectangle
 * @param y - Top side of the target rectangle
 * @param width - Width of the target rectangle
 * @param height - Height of the target rectangle
 * @param borderWidth - Width of border to fill, must be less than width and height of the target rectangle
 */
export function fillRectInnerBorder(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, borderWidth: number): void {
	// 绘制上边条：从左边界向内偏移 borderWidth，以确保填充处在矩形内部
	ctx.fillRect(x + borderWidth, y, width - borderWidth * 2, borderWidth);
	// 绘制下边条：在底部同样留出内边距后再填充
	ctx.fillRect(x + borderWidth, y + height - borderWidth, width - borderWidth * 2, borderWidth);
	// 绘制左边条：直接用 borderWidth 宽度填充整列
	ctx.fillRect(x, y, borderWidth, height);
	// 绘制右边条：从右侧向左偏移 borderWidth 后填充
	ctx.fillRect(x + width - borderWidth, y, borderWidth, height);
}

export function clearRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, clearColor: string): void {
	ctx.save();
	// 使用 'copy' 混合模式确保目标区域被指定颜色完全覆盖
	ctx.globalCompositeOperation = 'copy';
	ctx.fillStyle = clearColor;
	// 以填充矩形的方式清除区域
	ctx.fillRect(x, y, w, h);
	ctx.restore();
}

export type LeftTopRightTopRightBottomLeftBottomRadii = [number, number, number, number];

function changeBorderRadius(borderRadius: LeftTopRightTopRightBottomLeftBottomRadii, offset: number): typeof borderRadius {
	// 对四个顶角的半径做偏移，0 保持不变，避免出现负半径
	return borderRadius.map((x: number) => x === 0 ? x : x + offset) as typeof borderRadius;
}

export function drawRoundRect(
	// eslint:disable-next-line:max-params
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	radii: LeftTopRightTopRightBottomLeftBottomRadii
): void {
	/**
	 * As of May 2023, all of the major browsers now support ctx.roundRect() so we should
	 * be able to switch to the native version soon.
	 */
	ctx.beginPath();
	// 新版浏览器已经支持 roundRect，优先使用原生实现
	if (ctx.roundRect) {
		ctx.roundRect(x, y, w, h, radii);
		return;
	}
	/*
	 * Deprecate the rest in v5.
	 */
	ctx.lineTo(x + w - radii[1], y);
	if (radii[1] !== 0) {
		// 右上角需要圆角，使用 arcTo 连接
		ctx.arcTo(x + w, y, x + w, y + radii[1], radii[1]);
	}

	ctx.lineTo(x + w, y + h - radii[2]);
	if (radii[2] !== 0) {
		ctx.arcTo(x + w, y + h, x + w - radii[2], y + h, radii[2]);
	}

	ctx.lineTo(x + radii[3], y + h);
	if (radii[3] !== 0) {
		ctx.arcTo(x, y + h, x, y + h - radii[3], radii[3]);
	}

	ctx.lineTo(x, y + radii[0]);
	if (radii[0] !== 0) {
		ctx.arcTo(x, y, x + radii[0], y, radii[0]);
	}
}

/**
 * Draws a rounded rect with a border.
 *
 * This function assumes that the colors will be solid, without
 * any alpha. (This allows us to fix a rendering artefact.)
 *
 * @param outerBorderRadius - The radius of the border (outer edge)
 */
// eslint-disable-next-line max-params
export function drawRoundRectWithBorder(
	ctx: CanvasRenderingContext2D,
	left: number,
	top: number,
	width: number,
	height: number,
	backgroundColor: string,
	borderWidth: number = 0,
	outerBorderRadius: LeftTopRightTopRightBottomLeftBottomRadii = [0, 0, 0, 0],
	borderColor: string = ''
): void {
	ctx.save();

	if (!borderWidth || !borderColor || borderColor === backgroundColor) {
		// 无边框或颜色一致时，直接绘制填充即可
		drawRoundRect(ctx, left, top, width, height, outerBorderRadius);
		ctx.fillStyle = backgroundColor;
		ctx.fill();
		ctx.restore();
		return;
	}

	const halfBorderWidth = borderWidth / 2;
	// 为了正确套用边框，圆角半径要向内收缩半个边框宽度
	const radii = changeBorderRadius(outerBorderRadius, - halfBorderWidth);

	// 先绘制内部填充区域，与边框留出半宽的间隙
	drawRoundRect(ctx, left + halfBorderWidth, top + halfBorderWidth, width - borderWidth, height - borderWidth, radii);

	if (backgroundColor !== 'transparent') {
		ctx.fillStyle = backgroundColor;
		ctx.fill();
	}

	if (borderColor !== 'transparent') {
		ctx.lineWidth = borderWidth;
		ctx.strokeStyle = borderColor;
		ctx.closePath();
		ctx.stroke();
	}

	ctx.restore();
}

// eslint-disable-next-line max-params
export function clearRectWithGradient(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, topColor: string, bottomColor: string): void {
	ctx.save();

	// 使用渐变色清除区域并写入新颜色
	ctx.globalCompositeOperation = 'copy';
	const gradient = ctx.createLinearGradient(0, 0, 0, h);
	gradient.addColorStop(0, topColor);
	gradient.addColorStop(1, bottomColor);
	ctx.fillStyle = gradient;
	ctx.fillRect(x, y, w, h);

	ctx.restore();
}
