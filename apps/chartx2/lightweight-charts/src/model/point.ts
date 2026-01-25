import { Coordinate } from './coordinate';

/**
 * 图表上的二维坐标点。
 */
export interface Point {
	/** X 轴坐标。 */
	readonly x: Coordinate;
	/** Y 轴坐标。 */
	readonly y: Coordinate;
}
