import { isChrome } from './browsers';

// Chrome 在按下鼠标中键时会触发自动滚动，这里阻止该行为以免干扰图表拖拽
export function preventScrollByWheelClick(el: HTMLElement): void {
	if (!isChrome()) {
		return;
	}

	el.addEventListener('mousedown', (e: MouseEvent) => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
		if (e.button === MouseEventButton.Middle) {
			// prevent incorrect scrolling event
			e.preventDefault();
			return false;
		}
		return undefined;
	});
}

