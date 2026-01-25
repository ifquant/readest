// 寮曞叆浣嶅浘鍧愭爣娓叉煋浣滅敤鍩熺被鍨嬶紝灏佽浜?Canvas 鐩稿叧鐨勪笂涓嬫枃鍜屽儚绱犵缉鏀句俊鎭?
import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

// 寮曞叆鍧愭爣绫诲瀷锛岀敤浜庝繚璇?x銆亂 鍧愭爣鐨勭被鍨嬪畨鍏?
import { Coordinate } from '../typings/coordinate';
// 寮曞叆搴忓垪鍙鑼冨洿鐨勭储寮曞尯闂寸被鍨嬶紝鐢ㄤ簬闄愬埗閬嶅巻鍖洪棿
import { SeriesItemsIndexesRange } from '../model/time-data';

// 寮曞叆缁樺埗鎶樼嚎鎵€闇€鐨勭偣涓庣嚎鍨嬫灇涓?
import { LinePoint, LineType } from './draw-line';

// eslint-disable-next-line max-params, complexity
export function walkLine<TItem extends LinePoint, TStyle extends CanvasRenderingContext2D['fillStyle' | 'strokeStyle']>(
	// 娓叉煋浣滅敤鍩燂紝鎻愪緵 Canvas 涓婁笅鏂囦互鍙婂儚绱犳瘮渚嬩俊鎭?
	renderingScope: BitmapCoordinatesRenderingScope,
	// 褰撳墠鍙鐨勫簭鍒楁暟鎹偣
	items: readonly TItem[],
	// 鎸囧畾鎶樼嚎鐨勭粯鍒剁被鍨嬶紙鐩寸嚎銆侀樁姊嚎銆佹洸绾匡級
	lineType: LineType,
	// 褰撳墠鍙鐨勬暟鎹储寮曡寖鍥?
	visibleRange: SeriesItemsIndexesRange,
	// 鍗曚釜鏌卞瓙鐨勫搴︼紙鐢ㄤ簬灏忚寖鍥寸粯鍒讹級
	barWidth: number,
	// the values returned by styleGetter are compared using the operator !==,
	// so if styleGetter returns objects, then styleGetter should return the same object for equal styles
	// 鏍规嵁褰撳墠鏁版嵁鐐归€夋嫨瀹為檯缁樺埗浣跨敤鐨勬牱寮?
	styleGetter: (renderingScope: BitmapCoordinatesRenderingScope, item: TItem) => TStyle,
	// 褰撴牱寮忓彂鐢熷垏鎹㈡椂锛岀敤浜庣粨鏉熷墠涓€涓牱寮忓尯鍩熷苟鎻愪氦缁樺埗
	finishStyledArea: (renderingScope: BitmapCoordinatesRenderingScope, style: TStyle, areaFirstItem: LinePoint, newAreaFirstItem: LinePoint) => void
): void {
	// 娌℃湁鏁版嵁鎴栧彲瑙佽寖鍥翠笌鏁版嵁闀垮害涓嶉噸鍙犳椂鏃犻渶缁樺埗
	if (items.length === 0 || visibleRange.from >= items.length || visibleRange.to <= 0) {
		return;
	}

	// 瑙ｆ瀯娓叉煋涓婁笅鏂囧拰鍍忕礌缂╂斁姣?
	const { context: ctx, horizontalPixelRatio, verticalPixelRatio } = renderingScope;

	// 鍙鑼冨洿鐨勭涓€涓暟鎹偣
	const firstItem = items[visibleRange.from];
	// 褰撳墠姝ｅ湪浣跨敤鐨勬牱寮?
	let currentStyle = styleGetter(renderingScope, firstItem);
	// 璁板綍褰撳墠鏍峰紡鍖哄煙鐨勮捣濮嬬偣
	let currentStyleFirstItem = firstItem;

	// 濡傛灉鍙鑼冨洿涓嶈冻涓や釜鐐癸紝闄嶇骇涓虹粯鍒舵í鍚戠嚎娈?
	if (visibleRange.to - visibleRange.from < 2) {
		// 璁＄畻鍗婁釜鏌卞锛岀‘淇濈嚎娈佃鐩栨暣涓煴瀛?
		const halfBarWidth = barWidth / 2;

		// 寮€濮嬫柊璺緞
		ctx.beginPath();

		// 鏋勯€犵嚎娈电殑宸︾鐐?
		const item1: LinePoint = { x: firstItem.x - halfBarWidth as Coordinate, y: firstItem.y };
		// 鏋勯€犵嚎娈电殑鍙崇鐐?
		const item2: LinePoint = { x: firstItem.x + halfBarWidth as Coordinate, y: firstItem.y };

		// 灏嗙粯鍒跺厜鏍囩Щ鍔ㄥ埌宸︾鐐?
		ctx.moveTo(item1.x * horizontalPixelRatio, item1.y * verticalPixelRatio);
		// 缁樺埗鑷冲彸绔偣锛屽緱鍒版按骞崇嚎
		ctx.lineTo(item2.x * horizontalPixelRatio, item2.y * verticalPixelRatio);

		// 鎻愪氦褰撳墠鏍峰紡鐨勭嚎娈电粯鍒?
		finishStyledArea(renderingScope, currentStyle, item1, item2);
	} else {
		// 褰撴牱寮忓彂鐢熷彉鍖栨椂鎵ц锛岀粨鏉熸棫鏍峰紡骞跺紑濮嬫柊鏍峰紡
		const changeStyle = (newStyle: TStyle, currentItem: TItem) => {
			// 缁樺埗鏃ф牱寮忚鐩栫殑鍖哄煙
			finishStyledArea(renderingScope, currentStyle, currentStyleFirstItem, currentItem);

			// 寮€鍚柊鐨勮矾寰勪互搴旂敤鏂版牱寮?
			ctx.beginPath();
			// 鏇存柊褰撳墠鏍峰紡
			currentStyle = newStyle;
			// 淇濆瓨鏂版牱寮忓尯鍩熺殑璧风偣
			currentStyleFirstItem = currentItem;
		};

		// 褰撳墠閬嶅巻鍒扮殑鏁版嵁鐐癸紝鍒濆涓虹涓€涓偣
		let currentItem = currentStyleFirstItem;

		// 涓鸿繛缁矾寰勫噯澶囩粯鍒?
		ctx.beginPath();
		// 灏嗗厜鏍囩Щ鍔ㄥ埌绗竴涓偣鐨勪綅缃?
		ctx.moveTo(firstItem.x * horizontalPixelRatio, firstItem.y * verticalPixelRatio);

		// 閬嶅巻鍙鑼冨洿鍐呭墿浣欑殑鏁版嵁鐐?
		for (let i = visibleRange.from + 1; i < visibleRange.to; ++i) {
			// 鍙栧嚭褰撳墠鏁版嵁鐐?
			currentItem = items[i];
			// 鏍规嵁鏁版嵁鐐归€夋嫨瀵瑰簲鐨勬牱寮?
			const itemStyle = styleGetter(renderingScope, currentItem);

			// 鎸夌収绾垮瀷绫诲瀷鎵ц涓嶅悓鐨勭粯鍒堕€昏緫
			switch (lineType) {
				case LineType.Simple:
					// 绠€鍗曠洿绾匡細鐩存帴杩炲埌鐩爣鐐?
					ctx.lineTo(currentItem.x * horizontalPixelRatio, currentItem.y * verticalPixelRatio);
					break;
				case LineType.WithSteps:
					// 闃舵绾匡細鍏堟按骞崇Щ鍔ㄥ埌褰撳墠 x锛屽啀鍨傜洿杩炴帴
					ctx.lineTo(currentItem.x * horizontalPixelRatio, items[i - 1].y * verticalPixelRatio);

					// 鑻ユ牱寮忓彉鍖栵紝闇€瑕佹彁鍓嶇粨鏉熸棫鏍峰紡骞堕噸鏂拌ˉ榻愭杩涜矾寰?
					if (itemStyle !== currentStyle) {
						changeStyle(itemStyle, currentItem);
						// 鍐嶆缁樺埗姘村钩娈电‘淇濊矾寰勮繛缁?
						ctx.lineTo(currentItem.x * horizontalPixelRatio, items[i - 1].y * verticalPixelRatio);
					}

					// 鏈€缁堝瀭鐩磋繛鍒板綋鍓嶇偣
					ctx.lineTo(currentItem.x * horizontalPixelRatio, currentItem.y * verticalPixelRatio);
					break;
				case LineType.Curved: {
					// 鏇茬嚎锛氳绠楄礉濉炲皵鎺у埗鐐瑰疄鐜板钩婊?
					const [cp1, cp2] = getControlPoints(items, i - 1, i);
					ctx.bezierCurveTo(
						cp1.x * horizontalPixelRatio,
						cp1.y * verticalPixelRatio,
						cp2.x * horizontalPixelRatio,
						cp2.y * verticalPixelRatio,
						currentItem.x * horizontalPixelRatio,
						currentItem.y * verticalPixelRatio
					);
					break;
				}
			}

			// 瀵逛簬闈為樁姊嚎锛屾牱寮忓彉鍖栨椂闇€瑕侀噸鏂拌捣绗?
			if (lineType !== LineType.WithSteps && itemStyle !== currentStyle) {
				changeStyle(itemStyle, currentItem);
				ctx.moveTo(currentItem.x * horizontalPixelRatio, currentItem.y * verticalPixelRatio);
			}
		}

		// 閬嶅巻瀹屾垚鍚庯紝鑻ュ綋鍓嶆牱寮忓尯鍩熷皻鏈彁浜わ紝鍒欏畬鎴愭敹灏?
		if (currentStyleFirstItem !== currentItem || currentStyleFirstItem === currentItem && lineType === LineType.WithSteps) {
			finishStyledArea(renderingScope, currentStyle, currentStyleFirstItem, currentItem);
		}
	}
}

// 瀹氫箟鏇茬嚎寮犲姏绯绘暟锛屾帶鍒惰礉濉炲皵鏇茬嚎鐨勫集鏇茬▼搴?
const curveTension = 6;

// 璁＄畻涓や釜鐐圭殑鍚戦噺宸紝鐢ㄤ簬鎺ㄥ鎺у埗鐐?
function subtract(p1: LinePoint, p2: LinePoint): LinePoint {
	return { x: p1.x - p2.x as Coordinate, y: p1.y - p2.y as Coordinate };
}

// 璁＄畻涓や釜鐐圭殑鍚戦噺鍜岋紝鐢ㄤ簬鎺ㄥ鎺у埗鐐?
function add(p1: LinePoint, p2: LinePoint): LinePoint {
	return { x: p1.x + p2.x as Coordinate, y: p1.y + p2.y as Coordinate };
}

// 灏嗙偣鐨勫潗鏍囬櫎浠ュ父閲忥紝瀹炵幇缂╂斁
function divide(p1: LinePoint, n: number): LinePoint {
	return { x: p1.x / n as Coordinate, y: p1.y / n as Coordinate };
}

/**
 * @returns Two control points that can be used as arguments to {@link CanvasRenderingContext2D.bezierCurveTo} to draw a curved line between `points[fromPointIndex]` and `points[toPointIndex]`.
 */
// 璁＄畻鏇茬嚎娈电殑涓や釜鎺у埗鐐癸紝浣挎洸绾垮湪鐩搁偦鐐逛箣闂村钩婊戣繃娓?
export function getControlPoints(points: readonly LinePoint[], fromPointIndex: number, toPointIndex: number): [LinePoint, LinePoint] {
	// 鑾峰彇褰撳墠娈靛墠涓€涓偣鐨勭储寮曪紝閬垮厤瓒婄晫
	const beforeFromPointIndex = Math.max(0, fromPointIndex - 1);
	// 鑾峰彇褰撳墠娈靛悗涓€涓偣鐨勭储寮曪紝閬垮厤瓒婄晫
	const afterToPointIndex = Math.min(points.length - 1, toPointIndex + 1);
	// 鏍规嵁寮犲姏绯绘暟鎺ㄥ绗竴涓帶鍒剁偣
	const cp1 = add(points[fromPointIndex], divide(subtract(points[toPointIndex], points[beforeFromPointIndex]), curveTension));
	// 鏍规嵁寮犲姏绯绘暟鎺ㄥ绗簩涓帶鍒剁偣
	const cp2 = subtract(points[toPointIndex], divide(subtract(points[afterToPointIndex], points[fromPointIndex]), curveTension));

	// 杩斿洖鎺у埗鐐瑰
	return [cp1, cp2];
}

