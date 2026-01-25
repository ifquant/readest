// 寮曞叆浣嶅浘娓叉煋浣滅敤鍩熺被鍨嬶紝涓烘覆鏌撴彁渚涗笂涓嬫枃鍜屽儚绱犵缉鏀?
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 鍧愭爣绫诲瀷锛岀敤浜庢弿杩板瀭鐩存柟鍚戜笂鐨勪綅缃?
import { Coordinate } from '../typings/coordinate';
// 甯︿环鏍间俊鎭殑鏁板€肩被鍨?
import { PricedValue } from '../model/price-scale';
// 搴忓垪鍙鑼冨洿涓庡甫鏃堕棿鎴崇殑鏁板€肩被鍨?
import { SeriesItemsIndexesRange, TimedValue } from '../model/time-data';

// 鍩轰簬浣嶅浘鍧愭爣鐨勯€氱敤闈㈡澘娓叉煋鍣?
import { BitmapCoordinatesPaneRenderer } from './bitmap-coordinates-pane-renderer';
// 鎶樼嚎鐩稿叧鐨勬暟鎹粨鏋勪笌宸ュ叿鍑芥暟
import { LinePoint, LineStyle, LineType, LineWidth, setLineStyle } from './draw-line';
// 閬嶅巻鎶樼嚎鐐瑰苟瀹屾垚缁樺埗鐨勯€氱敤鍑芥暟
import { walkLine } from './walk-line';

// 鍖哄煙濉厖椤瑰熀纭€缁撴瀯锛氬寘鍚椂闂淬€佷环鏍间互鍙婄偣鍧愭爣
export type AreaFillItemBase = TimedValue & PricedValue & LinePoint;
// 鍖哄煙娓叉煋鍣ㄦ暟鎹畾涔夛紝绾︽潫鍙覆鏌撻」涓庢牱寮忛厤缃?
export interface PaneRendererAreaDataBase<TItem extends AreaFillItemBase = AreaFillItemBase> {
	// 寰呯粯鍒剁殑鏁版嵁椤?
	items: TItem[];
	// 鎶樼嚎鐨勭粯鍒剁被鍨?
	lineType: LineType;
	// 鎶樼嚎瀹藉害
	lineWidth: LineWidth;
	// 鎶樼嚎鏍峰紡锛堣櫄绾裤€佸疄绾跨瓑锛?
	lineStyle: LineStyle;

	// 鍩哄噯姘村钩浣嶇疆锛岀敤浜庨棴鍚堝～鍏呭尯鍩?
	baseLevelCoordinate: Coordinate | null;
	// 鏄惁鍙嶈浆濉厖鏂瑰悜
	invertFilledArea: boolean;

	// 鍗曚釜鏌卞瓙鐨勫搴?
	barWidth: number;

	// 褰撳墠鍙鐨勭储寮曡寖鍥?
	visibleRange: SeriesItemsIndexesRange | null;
}

// 澶勭悊鏍峰紡瀹屾垚鏃堕棴鍚堝尯鍩熷苟濉厖
function finishStyledArea(
	baseLevelCoordinate: Coordinate,
	scope: BitmapCoordinatesRenderingScope,
	style: CanvasRenderingContext2D['fillStyle'],
	areaFirstItem: LinePoint,
	newAreaFirstItem: LinePoint
): void {
	// 瑙ｆ瀯 Canvas 涓婁笅鏂囦笌鍍忕礌缂╂斁绯绘暟
	const { context, horizontalPixelRatio, verticalPixelRatio } = scope;
	// 灏嗚矾寰勫欢浼稿埌鏂版牱寮忓尯鍩熺殑鏈锛屽苟璐村埌鍩哄噯绾?
	context.lineTo(newAreaFirstItem.x * horizontalPixelRatio, baseLevelCoordinate * verticalPixelRatio);
	// 鍥炲埌鏍峰紡鍖哄煙璧风偣瀵瑰簲鐨勫熀鍑嗙嚎浣嶇疆
	context.lineTo(areaFirstItem.x * horizontalPixelRatio, baseLevelCoordinate * verticalPixelRatio);
	// 闂悎璺緞褰㈡垚灏侀棴鍖哄煙
	context.closePath();
	// 搴旂敤褰撳墠濉厖鏍峰紡
	context.fillStyle = style;
	// 濉厖闂悎鍖哄煙
	context.fill();
}

export abstract class PaneRendererAreaBase<TData extends PaneRendererAreaDataBase> extends BitmapCoordinatesPaneRenderer {
	// 瀛樺偍娓叉煋鍣ㄦ墍闇€鐨勬暟鎹?
	protected _data: TData | null = null;

	// 鍐欏叆缁樺埗鏁版嵁
	public setData(data: TData): void {
		this._data = data;
	}

	// 瀹為檯缁樺埗閫昏緫
	protected _drawImpl(renderingScope: BitmapCoordinatesRenderingScope): void {
		// 鏃犳暟鎹洿鎺ヨ繑鍥?
		if (this._data === null) {
			return;
		}

		// 瑙ｆ瀯褰撳墠鏁版嵁闇€瑕佺殑瀛楁
		const { items, visibleRange, barWidth, lineWidth, lineStyle, lineType } = this._data;
		// 璁＄畻濉厖鍖哄煙鐨勫熀鍑嗘按骞充綅缃?
		const baseLevelCoordinate =
			this._data.baseLevelCoordinate ??
				(this._data.invertFilledArea ? 0 : renderingScope.mediaSize.height) as Coordinate;

		// 鑻ユ病鏈夊彲瑙佸尯鍩燂紝鏃犻渶缁樺埗
		if (visibleRange === null) {
			return;
		}

		// 鑾峰彇 Canvas 涓婁笅鏂?
		const ctx = renderingScope.context;

		// 璁剧疆绾挎鐨勭鐐规牱寮?
		ctx.lineCap = 'butt';
		// 璁剧疆绾挎鐨勮繛鎺ユ牱寮?
		ctx.lineJoin = 'round';
		// 璁剧疆绾垮
		ctx.lineWidth = lineWidth;
		// 搴旂敤鎸囧畾鐨勭嚎鍨嬶紙铏氱嚎/瀹炵嚎绛夛級
		setLineStyle(ctx, lineStyle);

		// walk lines with width=1 to have more accurate gradient's filling
		// 灏嗙嚎瀹借涓?1 鍙娓愬彉濉厖鏇村姞鍑嗙‘
		ctx.lineWidth = 1;

		// 閬嶅巻鎶樼嚎鐐瑰苟缁樺埗锛屽悓鏃跺鐞嗘牱寮忓彉鍖?
		walkLine(renderingScope, items, lineType, visibleRange, barWidth, this._fillStyle.bind(this), finishStyledArea.bind(null, baseLevelCoordinate));
	}

	// 瀛愮被璐熻矗缁欏嚭鍏蜂綋鐨勫～鍏呮牱寮?
	protected abstract _fillStyle(renderingScope: BitmapCoordinatesRenderingScope, item: TData['items'][0]): CanvasRenderingContext2D['fillStyle'];
}

