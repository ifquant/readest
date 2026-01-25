import { Size, size } from 'fancy-canvas';

// on Hi-DPI CSS size * Device Pixel Ratio should be integer to avoid smoothing
// For chart widget we decrease the size because we must be inside container.
// For time axis this is not important, since it just affects space for pane widgets
export function suggestChartSize(originalSize: Size): Size {
	// 将宽高调整为偶数像素，确保缩放后整数像素，避免模糊
	const integerWidth = Math.floor(originalSize.width);
	const integerHeight = Math.floor(originalSize.height);
	const width = integerWidth - (integerWidth % 2);
	const height = integerHeight - (integerHeight % 2);
	return size({ width, height });
}

export function suggestTimeScaleHeight(originalHeight: number): number {
	// 时间轴高度向上补齐到偶数，方便与像素比对齐
	return originalHeight + (originalHeight % 2);
}

export function suggestPriceScaleWidth(originalWidth: number): number {
	// 价格轴同理，保证偶数像素以利于抗锯齿
	return originalWidth + (originalWidth % 2);
}
