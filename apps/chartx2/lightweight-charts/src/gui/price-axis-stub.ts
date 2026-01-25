import {
	BitmapCoordinatesRenderingScope,
	CanvasElementBitmapSizeBinding,
	equalSizes,
	Size,
	size,
	tryCreateCanvasRenderingTarget2D,
} from 'fancy-canvas';

import { clearRect } from '../helpers/canvas-helpers';
import { IDestroyable } from '../helpers/idestroyable';

import { ChartOptionsBase } from '../model/chart-model';
import { InvalidationLevel } from '../model/invalidate-mask';
import { PriceAxisRendererOptionsProvider } from '../renderers/price-axis-renderer-options-provider';

import { createBoundCanvas, releaseCanvas } from './canvas-utils';
import { PriceAxisWidgetSide } from './price-axis-widget';

export interface PriceAxisStubParams {
	rendererOptionsProvider: PriceAxisRendererOptionsProvider;
}

export type BorderVisibleGetter = () => boolean;
export type ColorGetter = () => string;

// PriceAxisStub 在时间轴两侧填补价格轴空白，确保背景/边框连续
export class PriceAxisStub implements IDestroyable {
	private readonly _cell: HTMLDivElement;
	private readonly _canvasBinding: CanvasElementBitmapSizeBinding;

	private readonly _rendererOptionsProvider: PriceAxisRendererOptionsProvider;

	private _options: ChartOptionsBase;

	private _invalidated: boolean = true;

	private readonly _isLeft: boolean;
	private _size: Size = size({ width: 0, height: 0 });
	private readonly _borderVisible: BorderVisibleGetter;
	private readonly _bottomColor: ColorGetter;

	public constructor(
		side: PriceAxisWidgetSide,
		options: ChartOptionsBase,
		params: PriceAxisStubParams,
		borderVisible: BorderVisibleGetter,
		bottomColor: ColorGetter
	) {
		this._isLeft = side === 'left';
		this._rendererOptionsProvider = params.rendererOptionsProvider;

		this._options = options;
		this._borderVisible = borderVisible;
		this._bottomColor = bottomColor;

		this._cell = document.createElement('div');
		this._cell.style.width = '25px';
		this._cell.style.height = '100%';
		this._cell.style.overflow = 'hidden';

		this._canvasBinding = createBoundCanvas(this._cell, size({ width: 16, height: 16 }));
		this._canvasBinding.subscribeSuggestedBitmapSizeChanged(this._canvasSuggestedBitmapSizeChangedHandler);
	}

	public destroy(): void {
		this._canvasBinding.unsubscribeSuggestedBitmapSizeChanged(this._canvasSuggestedBitmapSizeChangedHandler);
		releaseCanvas(this._canvasBinding.canvasElement);
		this._canvasBinding.dispose();
	}

	public getElement(): HTMLElement {
		return this._cell;
	}

	public getSize(): Size {
		return this._size;
	}

	public setSize(newSize: Size): void {
		if (!equalSizes(this._size, newSize)) {
			this._size = newSize;

			// stub 与价格轴相同，通过 fancy canvas 绑定位图尺寸
			this._canvasBinding.resizeCanvasElement(newSize);

			this._cell.style.width = `${newSize.width}px`;
			this._cell.style.height = `${newSize.height}px`;

			this._invalidated = true;
		}
	}

	public paint(type: InvalidationLevel): void {
		if (type < InvalidationLevel.Full && !this._invalidated) {
			return;
		}

		if (this._size.width === 0 || this._size.height === 0) {
			return;
		}

		this._invalidated = false;

		this._canvasBinding.applySuggestedBitmapSize();
		const target = tryCreateCanvasRenderingTarget2D(this._canvasBinding, {
			colorSpace: this._options.layout.colorSpace,
		});
		if (target !== null) {
			// repaint 时同时绘制背景与边框
			target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
				this._drawBackground(scope);
				this._drawBorder(scope);
			});
		}
	}

	public getBitmapSize(): Size {
		return this._canvasBinding.bitmapSize;
	}

	public drawBitmap(ctx: CanvasRenderingContext2D, x: number, y: number): void {
		const bitmapSize = this.getBitmapSize();
		if (bitmapSize.width > 0 && bitmapSize.height > 0) {
			ctx.drawImage(this._canvasBinding.canvasElement, x, y);
		}
	}

	private _drawBorder({ context: ctx, bitmapSize, horizontalPixelRatio, verticalPixelRatio }: BitmapCoordinatesRenderingScope): void {
		if (!this._borderVisible()) {
			return;
		}

		ctx.fillStyle = this._options.timeScale.borderColor;

		const horzBorderSize = Math.floor(this._rendererOptionsProvider.options().borderSize * horizontalPixelRatio);
		const vertBorderSize = Math.floor(this._rendererOptionsProvider.options().borderSize * verticalPixelRatio);
		const left = (this._isLeft) ? bitmapSize.width - horzBorderSize : 0;

		// 左右 stub 仅需绘制一条竖线/横线，确保与时间轴边框衔接
		ctx.fillRect(left, 0, horzBorderSize, vertBorderSize);
	}

	private _drawBackground({ context: ctx, bitmapSize }: BitmapCoordinatesRenderingScope): void {
		// 填充底色，与 pane 背景保持一致
		clearRect(ctx, 0, 0, bitmapSize.width, bitmapSize.height, this._bottomColor());
	}

	private readonly _canvasSuggestedBitmapSizeChangedHandler = () => this.paint(InvalidationLevel.Full);
}
