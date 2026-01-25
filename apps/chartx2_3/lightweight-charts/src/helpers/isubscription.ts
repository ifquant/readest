// 统一定义事件回调签名，默认占位参数为 void
export type Callback<T1 = void, T2 = void, T3 = void> = (param1: T1, param2: T2, param3: T3) => void;

export interface ISubscription<T1 = void, T2 = void, T3 = void> {
	// 订阅一个回调，可选传入绑定对象与是否为一次性监听
	subscribe(callback: Callback<T1, T2, T3>, linkedObject?: unknown, singleshot?: boolean): void;
	// 取消指定回调
	unsubscribe(callback: Callback<T1, T2, T3>): void;
	// 按绑定对象批量取消
	unsubscribeAll(linkedObject: unknown): void;
}
