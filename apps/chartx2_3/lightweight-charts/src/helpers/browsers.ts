import { isRunningOnClientSide } from './is-running-on-client-side';

// 为避免 SSR 或测试环境报错，在所有检测前先确认运行于客户端

export function isFF(): boolean {
	if (!isRunningOnClientSide) {
		return false;
	}
	// FireFox 的 UA 字符串包含 firefox 关键字
	return window.navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
}

export function isIOS(): boolean {
	if (!isRunningOnClientSide) {
		return false;
	}
	// eslint-disable-next-line deprecation/deprecation
	// 老式 UA 检测：在 iPhone/iPad/iPod 上平台字符串包含关键字
	return /iPhone|iPad|iPod/.test(window.navigator.platform);
}

export function isChrome(): boolean {
	if (!isRunningOnClientSide) {
		return false;
	}
	// Chrome 会在 window 对象上挂载专有 chrome 属性
	return window.chrome !== undefined;
}

// Determine whether the browser is running on windows.
export function isWindows(): boolean {
	if (!isRunningOnClientSide) {
		return false;
	}
	// more accurate if available
	if (
		navigator?.userAgentData?.platform
	) {
		// Chromium 新版 UAData 的 platform 字段
		return navigator.userAgentData.platform === 'Windows';
	}
	// 回退到传统 UA 字符串匹配 win
	return navigator.userAgent.toLowerCase().indexOf('win') >= 0;
}

// Determine whether the browser is Chromium based.
export function isChromiumBased(): boolean {
	if (!isRunningOnClientSide) {
		return false;
	}
	if (!navigator.userAgentData) { return false; }
	// UAData 中 brands 数组会包含类似 Chromium/Chrome 的信息
	return navigator.userAgentData.brands.some(
		(brand: UADataBrand) => {
			return brand.brand.includes('Chromium');
		}
	);
}
