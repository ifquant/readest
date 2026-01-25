// 寮曞叆浣嶅浘娓叉煋浣滅敤鍩燂紝浠ヤ究鍒涘缓娓愬彉鍜岃幏鍙栧儚绱犳瘮
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 鏂█宸ュ叿锛岀‘淇濆€煎凡瀹氫箟
import { ensureDefined } from '../helpers/assertions';
// 鏁板宸ュ叿鍑芥暟锛岀敤浜庨檺鍒舵暟鍊艰寖鍥?
import { clamp } from '../helpers/mathex';

// 鍧愭爣绫诲瀷锛屾弿杩板瀭鐩翠綅缃?
import { Coordinate } from '../typings/coordinate';

// 娓愬彉缂撳瓨鎵€闇€鐨勫弬鏁?
export interface GradientCacheParams {
	topColor1: string;
	topColor2: string;
	bottomColor1: string;
	bottomColor2: string;
	baseLevelCoordinate?: Coordinate | null;
	topCoordinate: Coordinate;
	bottomCoordinate: Coordinate;
}

export class GradientStyleCache {
	// 缂撳瓨浣跨敤鐨勫弬鏁?
	private _params?: GradientCacheParams;
	// 缂撳瓨鐢熸垚鐨?CanvasGradient
	private _cachedValue?: CanvasGradient;

	// eslint-disable-next-line complexity
	// 鏍规嵁鍙傛暟鐢熸垚鎴栧鐢ㄦ笎鍙?
	public get(scope: BitmapCoordinatesRenderingScope, params: GradientCacheParams): CanvasGradient {
		// 璇诲彇缂撳瓨鐨勫弬鏁帮紝鐢ㄤ簬姣旇緝鏄惁闇€瑕侀噸鏂拌绠?
		const cachedParams = this._params;
		const {
			topColor1, topColor2, bottomColor1, bottomColor2,
			baseLevelCoordinate, topCoordinate, bottomCoordinate,
		} = params;

		// 鑻ョ紦瀛樻棤鏁堟垨鍙傛暟鍙戠敓鍙樺寲锛屽垯閲嶆柊鍒涘缓娓愬彉
		if (
			this._cachedValue === undefined ||
			cachedParams === undefined ||
			cachedParams.topColor1 !== topColor1 ||
			cachedParams.topColor2 !== topColor2 ||
			cachedParams.bottomColor1 !== bottomColor1 ||
			cachedParams.bottomColor2 !== bottomColor2 ||
			cachedParams.baseLevelCoordinate !== baseLevelCoordinate ||
			cachedParams.topCoordinate !== topCoordinate ||
			cachedParams.bottomCoordinate !== bottomCoordinate
		) {
			// 鏍规嵁鏄惁瀛樺湪鍩哄噯绾垮喅瀹氭槸鍚﹂渶瑕佷箻浠ュ儚绱犳瘮
			const { verticalPixelRatio } = scope;
			const multiplier = baseLevelCoordinate || topCoordinate > 0 ? verticalPixelRatio : 1;
			// 璁＄畻娓愬彉鐨勮捣鐐?
			const top = topCoordinate * multiplier;
			// 娓愬彉缁堢偣鍦ㄧ敾甯冨簳閮ㄦ椂鏃犻渶缂╂斁
			const bottom = bottomCoordinate === scope.bitmapSize.height ? bottomCoordinate : bottomCoordinate * multiplier;
			// 鍩哄噯姘村钩浣嶇疆锛岄粯璁や负 0
			const baseline = (baseLevelCoordinate ?? 0) * multiplier;
			// 鍒涘缓绾靛悜绾挎€ф笎鍙?
			const gradient = scope.context.createLinearGradient(0, top, 0, bottom);

			// 娣诲姞椤堕儴棰滆壊
			gradient.addColorStop(0, topColor1);
			// 褰撳瓨鍦ㄥ熀鍑嗙嚎鏃讹紝鍦ㄥ熀鍑嗙嚎鍓嶅悗鍒囨崲棰滆壊
			if (baseLevelCoordinate !== null && baseLevelCoordinate !== undefined) {
				const range = bottom - top;
				const baselineRatio = clamp(((baseline - top) / range), 0, 1);

				gradient.addColorStop(baselineRatio, topColor2);
				gradient.addColorStop(baselineRatio, bottomColor1);
			}
			// 娓愬彉缁撴潫棰滆壊
			gradient.addColorStop(1, bottomColor2);

			// 缂撳瓨缁撴灉锛屼緵涓嬫澶嶇敤
			this._cachedValue = gradient;
			this._params = params;
		}

		// 杩斿洖缂撳瓨鍦ㄥ唴瀛樹腑鐨勬笎鍙?
		// 閫氳繃鏂█纭繚缂撳瓨宸插氨缁?
		return ensureDefined(this._cachedValue);
	}
}

