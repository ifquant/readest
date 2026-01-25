import { Size, size } from 'fancy-canvas';

import { IDestroyable } from '../helpers/idestroyable';
import { clamp } from '../helpers/mathex';

import { IChartWidgetBase } from './chart-widget';
import { MouseEventHandler, MouseEventHandlers, TouchMouseEvent } from './mouse-event-handler';
import { PaneWidget } from './pane-widget';

// PaneSeparator 负责在上下 pane 之间绘制分隔线并处理拖拽调整高度

export const enum SeparatorConstants {
	SeparatorHeight = 1,
	MinPaneHeight = 30,
}

interface ResizeInfo {
	startY: number;
	totalStretch: number;
	prevStretchTopPane: number;
	pixelStretchFactor: number;
	minPaneStretch: number;
	maxPaneStretch: number;
}

interface Handle {
	element: HTMLDivElement;
	backgroundElement: HTMLDivElement;
}

export class PaneSeparator implements IDestroyable {
	private readonly _chartWidget: IChartWidgetBase;
	private readonly _rowElement: HTMLTableRowElement;
	private readonly _cell: HTMLTableCellElement;
	private readonly _topPane: PaneWidget;
	private readonly _bottomPane: PaneWidget;

	private _handle: Handle | null = null;
	private _mouseEventHandler: MouseEventHandler | null = null;
	private _resizeEnabled: boolean = true;
	private _resizeInfo: ResizeInfo | null = null;

	public constructor(chartWidget: IChartWidgetBase, topPaneIndex: number, bottomPaneIndex: number) {
		this._chartWidget = chartWidget;
		this._topPane = chartWidget.paneWidgets()[topPaneIndex];
		this._bottomPane = chartWidget.paneWidgets()[bottomPaneIndex];

		this._rowElement = document.createElement('tr');
		this._rowElement.style.height = SeparatorConstants.SeparatorHeight + 'px';

		this._cell = document.createElement('td');
		this._cell.style.position = 'relative';
		this._cell.style.padding = '0';
		this._cell.style.margin = '0';
		this._cell.setAttribute('colspan', '3');

		this._updateBorderColor();
		this._rowElement.appendChild(this._cell);
		this._resizeEnabled = this._chartWidget.options()['layout'].panes.enableResize;

		if (!this._resizeEnabled) {
			this._handle = null;
			this._mouseEventHandler = null;
		} else {
			// 允许调整时挂载一个可拖动的 handle
			this._addResizableHandle();
		}
	}

	public destroy(): void {
		if (this._mouseEventHandler !== null) {
			this._mouseEventHandler.destroy();
		}
	}

	public getElement(): HTMLElement {
		return this._rowElement;
	}

	public getSize(): Size {
		return size({
			width: this._topPane.getSize().width,
			height: SeparatorConstants.SeparatorHeight,
		});
	}

	public getBitmapSize(): Size {
		return size({
			width: this._topPane.getBitmapSize().width,
			height: SeparatorConstants.SeparatorHeight * window.devicePixelRatio,
		});
	}

	public drawBitmap(ctx: CanvasRenderingContext2D, x: number, y: number): void {
		const bitmapSize = this.getBitmapSize();
		ctx.fillStyle = this._chartWidget.options()['layout'].panes.separatorColor;
		ctx.fillRect(x, y, bitmapSize.width, bitmapSize.height);
	}

	public update(): void {
		this._updateBorderColor();
		if (this._chartWidget.options()['layout'].panes.enableResize !== this._resizeEnabled) {
			this._resizeEnabled = this._chartWidget.options()['layout'].panes.enableResize;
			if (this._resizeEnabled) {
				// 当配置允许时重新创建拖拽句柄
				this._addResizableHandle();
			} else {
				if (this._handle !== null) {
					this._cell.removeChild(this._handle.backgroundElement);
					this._cell.removeChild(this._handle.element);
					this._handle = null;
				}
				if (this._mouseEventHandler !== null) {
					this._mouseEventHandler.destroy();
					this._mouseEventHandler = null;
				}
			}
		}
	}
	private _addResizableHandle(): void {
		const backgroundElement = document.createElement('div');
		const bgStyle = backgroundElement.style;
		bgStyle.position = 'fixed';
		bgStyle.display = 'none';
		bgStyle.zIndex = '49';
		bgStyle.top = '0';
		bgStyle.left = '0';
		bgStyle.width = '100%';
		bgStyle.height = '100%';
		bgStyle.cursor = 'row-resize';
		// 背景层用于在拖动时拦截鼠标事件，防止选中文本
		this._cell.appendChild(backgroundElement);

		const element = document.createElement('div');
		const style = element.style;
		style.position = 'absolute';
		style.zIndex = '50';
		style.top = '-4px';
		style.height = '9px';
		style.width = '100%';
		style.backgroundColor = '';
		style.cursor = 'row-resize';
		this._cell.appendChild(element);

		const handlers: MouseEventHandlers = {
			mouseEnterEvent: this._mouseOverEvent.bind(this),
			mouseLeaveEvent: this._mouseLeaveEvent.bind(this),
			mouseDownEvent: this._mouseDownEvent.bind(this),
			touchStartEvent: this._mouseDownEvent.bind(this),
			pressedMouseMoveEvent: this._pressedMouseMoveEvent.bind(this),
			touchMoveEvent: this._pressedMouseMoveEvent.bind(this),
			mouseUpEvent: this._mouseUpEvent.bind(this),
			touchEndEvent: this._mouseUpEvent.bind(this),
		};
		this._mouseEventHandler = new MouseEventHandler(
			element,
			handlers,
			{
				treatVertTouchDragAsPageScroll: () => false,
				treatHorzTouchDragAsPageScroll: () => true,
			}
		);

		this._handle = { element, backgroundElement };
	}
	private _updateBorderColor(): void {
		this._cell.style.background = this._chartWidget.options()['layout'].panes.separatorColor;
	}

	private _mouseOverEvent(event: TouchMouseEvent): void {
		if (this._handle !== null) {
			this._handle.element.style.backgroundColor = this._chartWidget.options()['layout'].panes.separatorHoverColor;
		}
	}

	private _mouseLeaveEvent(event: TouchMouseEvent): void {
		if (this._handle !== null && this._resizeInfo === null) {
			this._handle.element.style.backgroundColor = '';
		}
	}
	private _mouseDownEvent(event: TouchMouseEvent): void {
		if (this._handle === null) {
			return;
		}

		// stretchFactor 基于 pane 高度比例控制分配，需要转换为像素
		const totalStretch = this._topPane.state().stretchFactor() + this._bottomPane.state().stretchFactor();
		const totalHeight = this._topPane.getSize().height + this._bottomPane.getSize().height;
		const pixelStretchFactor = totalStretch / totalHeight;
		const minPaneStretch = SeparatorConstants.MinPaneHeight * pixelStretchFactor;

		if (totalStretch <= minPaneStretch * 2) {
			// cannot resize panes that already have less than minimal height
			// that's possible if there are many panes on the chart
			return;
		}

		this._resizeInfo = {
			startY: event.pageY,
			prevStretchTopPane: this._topPane.state().stretchFactor(),
			maxPaneStretch: totalStretch - minPaneStretch,
			totalStretch,
			pixelStretchFactor,
			minPaneStretch,
		};

		// 显示全屏遮罩，阻止 iframe/iframe 等抢事件
		this._handle.backgroundElement.style.display = 'block';
	}

	private _pressedMouseMoveEvent(event: TouchMouseEvent): void {
		const resizeInfo = this._resizeInfo;
		if (resizeInfo === null) {
			return;
		}

		const deltaY = event.pageY - resizeInfo.startY;
		const deltaStretchFactor = deltaY * resizeInfo.pixelStretchFactor;

		// 新的 stretch factor 在上下限之间 clamp，确保不低于最小高度
		const upperPaneNewStretch = clamp(
			resizeInfo.prevStretchTopPane + deltaStretchFactor,
			resizeInfo.minPaneStretch,
			resizeInfo.maxPaneStretch
		);

		this._topPane.state().setStretchFactor(upperPaneNewStretch);
		this._bottomPane.state().setStretchFactor(resizeInfo.totalStretch - upperPaneNewStretch);

		// 更新模型以触发布局重算
		this._chartWidget.model().fullUpdate();
	}

	private _mouseUpEvent(event: TouchMouseEvent): void {
		if (this._resizeInfo === null || this._handle === null) {
			return;
		}

		this._resizeInfo = null;
		// 结束拖动后隐藏遮罩
		this._handle.backgroundElement.style.display = 'none';
	}
}
