import { Nominal } from '../helpers/nominal';

/**
 * 表示在内部渲染坐标系中的纵向坐标值。
 * 实质仍为 `number`，通过 Nominal 类型标记来避免与普通数字混淆。
 */
export type Coordinate = Nominal<number, 'Coordinate'>;
