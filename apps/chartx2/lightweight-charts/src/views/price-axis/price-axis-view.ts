// 价格刻度对象与渲染器接口
import { PriceScale } from '../../model/price-scale';
import {
	IPriceAxisViewRenderer,
	IPriceAxisViewRendererConstructor,
	PriceAxisViewRendererCommonData,
	PriceAxisViewRendererData,
	PriceAxisViewRendererOptions,
} from '../../renderers/iprice-axis-view-renderer';
import { PriceAxisViewRenderer } from '../../renderers/price-axis-view-renderer';

import { IPriceAxisView } from './iprice-axis-view';

// 价格轴视图抽象基类：负责管理通用渲染数据及懒更新逻辑
export abstract class PriceAxisView implements IPriceAxisView {
	private readonly _commonRendererData: PriceAxisViewRendererCommonData = {
		coordinate: 0,
		background: '#000',
		additionalPaddingBottom: 0,
		additionalPaddingTop: 0,
	};

	private readonly _axisRendererData: PriceAxisViewRendererData = {
		text: '',
		visible: false,
		tickVisible: true,
		moveTextToInvisibleTick: false,
		borderColor: '',
		color: '#FFF',
		borderVisible: false,
		separatorVisible: false,
	};

	private readonly _paneRendererData: PriceAxisViewRendererData = {
		text: '',
		visible: false,
		tickVisible: false,
		moveTextToInvisibleTick: true,
		borderColor: '',
		color: '#FFF',
		borderVisible: true,
		separatorVisible: true,
	};

	private readonly _axisRenderer: IPriceAxisViewRenderer;
	private readonly _paneRenderer: IPriceAxisViewRenderer;
	private _invalidated: boolean = true;

	public constructor(ctor?: IPriceAxisViewRendererConstructor) {
		// 支持通过注入构造器替换默认渲染器实现
		this._axisRenderer = new (ctor || PriceAxisViewRenderer)(this._axisRendererData, this._commonRendererData);
		this._paneRenderer = new (ctor || PriceAxisViewRenderer)(this._paneRendererData, this._commonRendererData);
	}

	public text(): string {
		// 延迟更新渲染数据，确保文本最新
		this._updateRendererDataIfNeeded();
		return this._axisRendererData.text;
	}

	public coordinate(): number {
		this._updateRendererDataIfNeeded();
		return this._commonRendererData.coordinate;
	}

	public update(): void {
		// 由子类调用以触发下次渲染前的重新计算
		this._invalidated = true;
	}

	public height(rendererOptions: PriceAxisViewRendererOptions, useSecondLine: boolean = false): number {
		// 取轴标签与面板标签高度的最大值，避免裁切
		return Math.max(
			this._axisRenderer.height(rendererOptions, useSecondLine),
			this._paneRenderer.height(rendererOptions, useSecondLine)
		);
	}

	public getFixedCoordinate(): number {
		return this._commonRendererData.fixedCoordinate || 0;
	}

	public setFixedCoordinate(value: number): void {
		this._commonRendererData.fixedCoordinate = value;
	}

	public isVisible(): boolean {
		this._updateRendererDataIfNeeded();
		return this._axisRendererData.visible || this._paneRendererData.visible;
	}

	public isAxisLabelVisible(): boolean {
		this._updateRendererDataIfNeeded();
		return this._axisRendererData.visible;
	}

	public renderer(priceScale: PriceScale): IPriceAxisViewRenderer {
		this._updateRendererDataIfNeeded();

		// force update tickVisible state from price scale options
		// because we don't have and we can't have price axis in other methods
		// (like paneRenderer or any other who call _updateRendererDataIfNeeded)
		this._axisRendererData.tickVisible = this._axisRendererData.tickVisible && priceScale.options().ticksVisible;
		this._paneRendererData.tickVisible = this._paneRendererData.tickVisible && priceScale.options().ticksVisible;

		this._axisRenderer.setData(this._axisRendererData, this._commonRendererData);
		this._paneRenderer.setData(this._paneRendererData, this._commonRendererData);

		return this._axisRenderer;
	}

	public paneRenderer(): IPriceAxisViewRenderer {
		this._updateRendererDataIfNeeded();
		this._axisRenderer.setData(this._axisRendererData, this._commonRendererData);
		this._paneRenderer.setData(this._paneRendererData, this._commonRendererData);

		return this._paneRenderer;
	}

	protected abstract _updateRendererData(
		axisRendererData: PriceAxisViewRendererData,
		paneRendererData: PriceAxisViewRendererData,
		commonData: PriceAxisViewRendererCommonData
	): void;

	private _updateRendererDataIfNeeded(): void {
		if (this._invalidated) {
			// 每次重算前先重置 tick 可见性，交由子类决定
			this._axisRendererData.tickVisible = true;
			this._paneRendererData.tickVisible = false;
			this._updateRendererData(this._axisRendererData, this._paneRendererData, this._commonRendererData);
		}
	}
}
