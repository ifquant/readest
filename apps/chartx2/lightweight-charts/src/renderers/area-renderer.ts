// 寮曞叆浣嶅浘娓叉煋浣滅敤鍩熺被鍨嬶紝鎻愪緵鐢诲竷涓婁笅鏂囧拰鍍忕礌缂╂斁淇℃伅
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 鍧愭爣绫诲瀷锛屼繚璇佹暟鍊间笌鍧愭爣浣撶郴涓€鑷?
import { Coordinate } from '../typings/coordinate';
// 鍖哄煙濉厖棰滆壊鏍峰紡瀹氫箟
import { AreaFillColorerStyle } from '../model/series-bar-colorer';

// 鍖哄煙娓叉煋鍩虹被鍙婂叾鏁版嵁缁撴瀯
import { AreaFillItemBase, PaneRendererAreaBase, PaneRendererAreaDataBase } from './area-renderer-base';
// 绾挎€ф笎鍙樻牱寮忕紦瀛橈紝閬垮厤閲嶅鍒涘缓娓愬彉
import { GradientStyleCache } from './gradient-style-cache';

// 鍖哄煙濉厖椤瑰寘鍚熀纭€鏁版嵁涓庨鑹叉牱寮?
export type AreaFillItem = AreaFillItemBase & AreaFillColorerStyle;
// 闈㈡澘鍖哄煙娓叉煋鍣ㄧ殑鏁版嵁缁撴瀯锛屾敮鎸佸彲閫夌殑椤堕儴鍧愭爣
export interface PaneRendererAreaData extends PaneRendererAreaDataBase<AreaFillItem> {
	topCoordinate?: Coordinate;
}

export class PaneRendererArea extends PaneRendererAreaBase<PaneRendererAreaData> {
	// 缂撳瓨娓愬彉濉厖鏍峰紡锛屾彁鍗囨€ц兘
	private readonly _fillCache: GradientStyleCache = new GradientStyleCache();

	// 鏍规嵁褰撳墠椤硅绠楀～鍏呮牱寮?
	protected override _fillStyle(renderingScope: BitmapCoordinatesRenderingScope, item: AreaFillItem): CanvasRenderingContext2D['fillStyle'] {
		// 浣跨敤缂撳瓨鐢熸垚锛堟垨澶嶇敤锛夋笎鍙樻牱寮?
		return this._fillCache.get(
			renderingScope,
			{
				// 娓愬彉椤堕儴棰滆壊
				topColor1: item.topColor,
				topColor2: '',
				bottomColor1: '',
				// 娓愬彉搴曢儴棰滆壊
				bottomColor2: item.bottomColor,
				// 椤堕儴鍧愭爣锛岄粯璁や负 0
				topCoordinate: this._data?.topCoordinate ?? 0 as Coordinate,
				// 搴曢儴鍧愭爣浣跨敤鐢诲竷楂樺害
				bottomCoordinate: renderingScope.bitmapSize.height as Coordinate,
			}
		);
	}
}

