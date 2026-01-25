// 寮曞叆浣嶅浘娓叉煋浣滅敤鍩燂紝鎻愪緵 Canvas 涓婁笅鏂囦俊鎭?
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 鍧愭爣绫诲瀷锛岀‘淇濇暟鍊间笌鍥捐〃鍧愭爣浣撶郴鍏煎
import { Coordinate } from '../typings/coordinate';
// 鍩哄噯绾垮～鍏呯殑棰滆壊鏍峰紡瀹氫箟
import { BaselineFillColorerStyle } from '../model/series-bar-colorer';

// 鍖哄煙娓叉煋鐨勫熀纭€鏁版嵁涓庡熀绫?
import { AreaFillItemBase, PaneRendererAreaBase, PaneRendererAreaDataBase } from './area-renderer-base';
// 娓愬彉鏍峰紡缂撳瓨锛岄伩鍏嶉噸澶嶅垱寤?CanvasGradient
import { GradientStyleCache } from './gradient-style-cache';

// 鍩哄噯绾垮尯鍩熷～鍏呴」锛岀粨鍚堝熀纭€椤逛笌棰滆壊閰嶇疆
export type BaselineFillItem = AreaFillItemBase & BaselineFillColorerStyle;
// 鍩哄噯绾垮尯鍩熸覆鏌撶殑鏁版嵁缁撴瀯锛屾敮鎸佽嚜瀹氫箟涓婁笅杈圭晫
export interface PaneRendererBaselineData extends PaneRendererAreaDataBase<BaselineFillItem> {
	topCoordinate?: Coordinate;
	bottomCoordinate?: Coordinate;
}
export class PaneRendererBaselineArea extends PaneRendererAreaBase<PaneRendererBaselineData> {
	// 娓愬彉鏍峰紡缂撳瓨瀹炰緥
	private readonly _fillCache: GradientStyleCache = new GradientStyleCache();

	// 璁＄畻褰撳墠鏁版嵁椤瑰搴旂殑濉厖鏍峰紡
	protected override _fillStyle(renderingScope: BitmapCoordinatesRenderingScope, item: BaselineFillItem): CanvasRenderingContext2D['fillStyle'] {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		// 鍩虹被淇濊瘉 setData 鍚?_data 涓嶄负 null
		const data = this._data!;

		// 浣跨敤缂撳瓨鐢熸垚娓愬彉濉厖鏍峰紡
		return this._fillCache.get(
			renderingScope,
			{
				// 娓愬彉椤堕儴鐨勪富鑹蹭笌杈呰壊
				topColor1: item.topFillColor1,
				topColor2: item.topFillColor2,
				// 娓愬彉搴曢儴鐨勪富鑹蹭笌杈呰壊
				bottomColor1: item.bottomFillColor1,
				bottomColor2: item.bottomFillColor2,
				// 鍩哄噯姘村钩鍧愭爣锛岀敤浜庡湪娓愬彉鍐呴儴鍒囨崲棰滆壊
				baseLevelCoordinate: data.baseLevelCoordinate,
				// 椤堕儴鍧愭爣锛岄粯璁?0
				topCoordinate: data.topCoordinate ?? 0 as Coordinate,
				// 搴曢儴鍧愭爣锛岄粯璁や娇鐢ㄧ敾甯冮珮搴?
				bottomCoordinate: data.bottomCoordinate ?? renderingScope.bitmapSize.height as Coordinate,
			}
		);
	}
}

