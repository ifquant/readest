// 寮曞叆浣嶅浘娓叉煋浣滅敤鍩燂紝鎻愪緵 Canvas 涓婁笅鏂囧拰鍍忕礌姣?
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 鎮仠瀵硅薄鏁版嵁缁撴瀯
import { HoveredObject } from '../model/chart-model';
// 鍧愭爣绫诲瀷
import { Coordinate } from '../typings/coordinate';

// 浣嶅浘鍧愭爣闈㈡澘娓叉煋鍣ㄥ熀绫?
import { BitmapCoordinatesPaneRenderer } from './bitmap-coordinates-pane-renderer';
// 缁樺埗姘村钩绾挎墍闇€宸ュ叿
import { drawHorizontalLine, LineStyle, LineWidth, setLineStyle } from './draw-line';

// 姘村钩绾挎覆鏌撳櫒鐨勬暟鎹粨鏋?
export interface HorizontalLineRendererData {
	color: string;
	lineStyle: LineStyle;
	lineWidth: LineWidth;

	y: Coordinate;
	visible?: boolean;
	externalId?: string;
}

const enum Constants { HitTestThreshold = 7, }

export class HorizontalLineRenderer extends BitmapCoordinatesPaneRenderer {
	// 褰撳墠绾挎潯鏁版嵁
	private _data: HorizontalLineRendererData | null = null;

	// 鍐欏叆绾挎潯鏁版嵁
	public setData(data: HorizontalLineRendererData): void {
		this._data = data;
	}

	// 鍒ゆ柇榧犳爣鍛戒腑
	public hitTest(x: Coordinate, y: Coordinate): HoveredObject | null {
		if (!this._data?.visible) {
			return null;
		}

		const { y: itemY, lineWidth, externalId } = this._data;
		// add a fixed area threshold around line (Y + width) for hit test
		// 鍦ㄧ嚎鏉′笂涓嬪悇鎵╁睍涓€瀹氬儚绱犵敤浜庡懡涓祴璇?
		if (y >= itemY - lineWidth - Constants.HitTestThreshold && y <= itemY + lineWidth + Constants.HitTestThreshold) {
			return {
				hitTestData: this._data,
				externalId: externalId,
			};
		}

		return null;
	}

	protected _drawImpl({ context: ctx, bitmapSize, horizontalPixelRatio, verticalPixelRatio }: BitmapCoordinatesRenderingScope): void {
		// 鏃犳暟鎹垯涓嶇粯鍒?
		if (this._data === null) {
			return;
		}

		// 鏄惧紡闅愯棌鏃朵笉缁樺埗
		if (this._data.visible === false) {
			return;
		}

		// 灏嗗潗鏍囪浆鎹负鍍忕礌
		const y = Math.round(this._data.y * verticalPixelRatio);
		// 瓒呭嚭鐢诲竷鑼冨洿鍒欎笉缁樺埗
		if (y < 0 || y > bitmapSize.height) {
			return;
		}

		// 璁剧疆绾挎潯鏍峰紡骞剁粯鍒舵按骞崇嚎
		ctx.lineCap = 'butt';
		ctx.strokeStyle = this._data.color;
		ctx.lineWidth = Math.floor(this._data.lineWidth * horizontalPixelRatio);
		setLineStyle(ctx, this._data.lineStyle);
		drawHorizontalLine(ctx, y, 0, bitmapSize.width);
	}
}

