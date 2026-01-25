import {
	bindCanvasElementBitmapSizeTo,
	CanvasElementBitmapSizeBinding,
	Size,
} from 'fancy-canvas';

import { ensureNotNull } from '../helpers/assertions';

export function createBoundCanvas(parentElement: HTMLElement, size: Size): CanvasElementBitmapSizeBinding {
	// 通过 ownerDocument 创建新的 canvas 元素，确保在多个窗口环境下也可复用
	const doc = ensureNotNull(parentElement.ownerDocument);
	const canvas = doc.createElement('canvas');
	parentElement.appendChild(canvas);

	// 使用 fancy-canvas 绑定位图尺寸，使得 canvas 自动跟随 DPR/尺寸变化
	const binding = bindCanvasElementBitmapSizeTo(canvas, {
		type: 'device-pixel-content-box',
		options: {
			allowResizeObserver: true,
		},
		// transform：确保位图至少与元素尺寸一样大，避免缩放时模糊
		transform: (bitmapSize: Size, canvasElementClientSize: Size) => ({
			width: Math.max(bitmapSize.width, canvasElementClientSize.width),
			height: Math.max(bitmapSize.height, canvasElementClientSize.height),
		}),
	});
	// 初始化位图尺寸，避免首次渲染出现拉伸
	binding.resizeCanvasElement(size);
	return binding;
}

export function releaseCanvas(canvas: HTMLCanvasElement): void {
	// 该函数用于规避 iOS Safari “Total canvas memory use exceeds the maximum limit” 报错
	// 原因：Safari 会在内部缓存销毁后的 canvas，如频繁创建/销毁则超出上限
	// 通过将尺寸缩到 1x1 并清空像素，强制浏览器释放底层内存
	canvas.width = 1;
	canvas.height = 1;
	canvas.getContext('2d')?.clearRect(0, 0, 1, 1);
}
