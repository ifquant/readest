import { IPaneView } from '../views/pane/ipane-view';
import { IPriceAxisView } from '../views/price-axis/iprice-axis-view';
import { ITimeAxisView } from '../views/time-axis/itime-axis-view';

import { IDataSource } from './idata-source';
import { Pane } from './pane';
import { PriceScale } from './price-scale';

// DataSource 是所有绘制源（Series、Crosshair、Grid 等）的抽象基类，统一维护价格轴绑定与 zorder
export abstract class DataSource implements IDataSource {
	protected _priceScale: PriceScale | null = null;

	private _zorder: number = 0;

	public zorder(): number {
		return this._zorder;
	}

	public setZorder(zorder: number): void {
		this._zorder = zorder;
	}

	public priceScale(): PriceScale | null {
		return this._priceScale;
	}

	public setPriceScale(priceScale: PriceScale | null): void {
		this._priceScale = priceScale;
	}

	public abstract priceAxisViews(pane?: Pane, priceScale?: PriceScale): readonly IPriceAxisView[];
	public abstract paneViews(pane?: Pane): readonly IPaneView[];

	public labelPaneViews(pane?: Pane): readonly IPaneView[] {
		// 默认无额外标签视图，子类按需覆盖
		return [];
	}

	public timeAxisViews(): readonly ITimeAxisView[] {
		// 默认无时间轴视图
		return [];
	}

	public visible(): boolean {
		// 数据源通常可见，子类可基于内部状态重写
		return true;
	}

	public abstract updateAllViews(): void;
}
