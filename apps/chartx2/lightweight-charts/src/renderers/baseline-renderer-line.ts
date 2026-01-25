// 寮曞叆浣嶅浘娓叉煋浣滅敤鍩燂紝渚夸簬鑾峰彇 Canvas 涓婁笅鏂囦笌缂╂斁淇℃伅
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 鍧愭爣绫诲瀷锛岀敤浜庢弿杩版洸绾夸綅缃?
import { Coordinate } from '../typings/coordinate';
// 鍩哄噯绾挎弿杈圭殑棰滆壊閰嶇疆
import { BaselineStrokeColorerStyle } from '../model/series-bar-colorer';

// 娓愬彉鏍峰紡缂撳瓨锛岄伩鍏嶉噸澶嶅垱寤烘笎鍙?
import { GradientStyleCache } from './gradient-style-cache';
// 绾挎潯娓叉煋鐨勫熀绫讳笌鍩虹鏁版嵁缁撴瀯
import { LineItemBase as LineStrokeItemBase, PaneRendererLineBase, PaneRendererLineDataBase } from './line-renderer-base';

// 鍩哄噯绾挎弿杈归」锛岀粍鍚堝熀纭€绾挎潯椤逛笌棰滆壊閰嶇疆
export type BaselineStrokeItem = LineStrokeItemBase & BaselineStrokeColorerStyle;
// 鍩哄噯绾挎弿杈规覆鏌撴暟鎹紝鍖呭惈鍩哄噯鍧愭爣浠ュ強鍙€変笂涓嬭竟鐣?
export interface PaneRendererBaselineLineData extends PaneRendererLineDataBase<BaselineStrokeItem> {
	baseLevelCoordinate: Coordinate;
	topCoordinate?: Coordinate;
	bottomCoordinate?: Coordinate;
}

export class PaneRendererBaselineLine extends PaneRendererLineBase<PaneRendererBaselineLineData> {
	// 缂撳瓨璐濆灏旀笎鍙樹互澶嶇敤
	private readonly _strokeCache: GradientStyleCache = new GradientStyleCache();

	// 璁＄畻绾挎潯鎻忚竟鏍峰紡
	protected override _strokeStyle(renderingScope: BitmapCoordinatesRenderingScope, item: BaselineStrokeItem): CanvasRenderingContext2D['strokeStyle'] {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		// 鍩虹被淇濊瘉 setData 鍚?_data 鍙敤
		const data = this._data!;

		// 浣跨敤娓愬彉缂撳瓨鑾峰彇鎻忚竟鏍峰紡
		return this._strokeCache.get(
			renderingScope,
			{
				// 椤堕儴娓愬彉棰滆壊锛堜富鑹插拰杈呭姪鑹茬浉鍚屼互褰㈡垚绾壊锛?
				topColor1: item.topLineColor,
				topColor2: item.topLineColor,
				// 搴曢儴娓愬彉棰滆壊
				bottomColor1: item.bottomLineColor,
				bottomColor2: item.bottomLineColor,
				// 鍩哄噯姘村钩浣嶇疆锛岀敤浜庢帶鍒舵笎鍙樺垏鎹?
				baseLevelCoordinate: data.baseLevelCoordinate,
				// 椤堕儴鍧愭爣锛岄粯璁?0
				topCoordinate: data.topCoordinate ?? 0 as Coordinate,
				// 搴曢儴鍧愭爣锛岄粯璁ょ敾甯冮珮搴?
				bottomCoordinate: data.bottomCoordinate ?? renderingScope.bitmapSize.height as Coordinate,
			}
		);
	}
}

