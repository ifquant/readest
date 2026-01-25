/// <reference types="_build-time-constants" />

export function warn(msg: string): void {
	// 仅在开发模式输出警告，避免生产环境产生多余日志
	if (process.env.NODE_ENV === 'development') {
		// eslint-disable-next-line no-console
		console.warn(msg);
	}
}
