// 寮曞叆 Canvas 娓叉煋鐩爣绫诲瀷
import { CanvasRenderingTarget2D } from 'fancy-canvas';

// 鎮仠淇℃伅缁撴瀯浣?
import { HoveredObject } from '../model/chart-model';
// 鍧愭爣绫诲瀷锛屾弿杩板懡涓祴璇曠殑杈撳叆鍧愭爣
import { Coordinate } from '../typings/coordinate';

// 闈㈡澘娓叉煋鍣ㄦ帴鍙ｏ紝瀹氫箟缁樺埗涓庡懡涓祴璇曡兘鍔?
export interface IPaneRenderer {
	draw(target: CanvasRenderingTarget2D, isHovered: boolean, hitTestData?: unknown): void;
	drawBackground?(target: CanvasRenderingTarget2D, isHovered: boolean, hitTestData?: unknown): void;
	hitTest?(x: Coordinate, y: Coordinate): HoveredObject | null;
}

