// 引入位图渲染作用域，获取 Canvas 上下文与像素比
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 序列索引的可见范围定义
import { SeriesItemsIndexesRange } from '../model/time-data';

// 折线点数据结构
import { LinePoint } from './draw-line';

export function drawSeriesPointMarkers<TItem extends LinePoint, TStyle extends CanvasRenderingContext2D['fillStyle']>(
	// 渲染作用域，包含像素比和上下文
	renderingScope: BitmapCoordinatesRenderingScope,
	// 要绘制的点集合
	items: readonly TItem[],
	// 点标记半径（CSS 像素）
	pointMarkersRadius: number,
	// 可见的索引范围
	visibleRange: SeriesItemsIndexesRange,
	// the values returned by styleGetter are compared using the operator !==,
	// so if styleGetter returns objects, then styleGetter should return the same object for equal styles
	// 根据当前点返回填充样式
	styleGetter: (renderingScope: BitmapCoordinatesRenderingScope, item: TItem) => TStyle
): void {
	// 没有可见点时直接退出
	if (visibleRange.to - visibleRange.from <= 0) {
		return;
	}

	// 解构像素比与 Canvas 上下文
	const { horizontalPixelRatio, verticalPixelRatio, context } = renderingScope;
	// 上一次使用的样式，便于合并路径
	let prevStyle: TStyle | null = null;

	// 标记的线宽依据像素比计算，确保至少为 1
	const tickWidth = Math.max(1, Math.floor(horizontalPixelRatio));
	// 奇数线宽需要半像素矫正
	const correction = (tickWidth % 2) / 2;

	// 将半径转换为设备像素并加上矫正
	const radius = pointMarkersRadius * verticalPixelRatio + correction;
	// 逆序遍历，确保颜色切换时能正确填充
	for (let i = visibleRange.to - 1; i >= visibleRange.from; --i) {
		// 当前点
		const point = items[i];
		if (point) {
			// 获取当前点的填充样式
			const style = styleGetter(renderingScope, point);
			// 样式变化时需要提交上一段路径并重新开始
			if (style !== prevStyle) {
				context.beginPath();
				if (prevStyle !== null) {
					context.fill();
				}

				// 更新当前填充样式
				context.fillStyle = style;
				prevStyle = style;
			}

			// 计算圆心坐标，x 方向需要半像素矫正
			const centerX = Math.round(point.x * horizontalPixelRatio) + correction; // correct x coordinate only
			const centerY = point.y * verticalPixelRatio;

			// 移动到圆弧的起点，再绘制整圆
			context.moveTo(centerX, centerY);
			context.arc(centerX, centerY, radius, 0, Math.PI * 2);
		}
	}

	// 批量填充所有圆形
	context.fill();
}
