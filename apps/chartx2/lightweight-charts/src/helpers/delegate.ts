import { Callback, ISubscription } from './isubscription';

interface Listener<T1, T2, T3> {
	callback: Callback<T1, T2, T3>;
	linkedObject?: unknown;
	singleshot: boolean;
}

export class Delegate<T1 = void, T2 = void, T3 = void> implements ISubscription<T1, T2, T3> {
	private _listeners: Listener<T1, T2, T3>[] = [];

	public subscribe(callback: Callback<T1, T2, T3>, linkedObject?: unknown, singleshot?: boolean): void {
		// 订阅回调，并记录 optional 的绑定对象与是否仅触发一次
		const listener: Listener<T1, T2, T3> = {
			callback,
			linkedObject,
			singleshot: singleshot === true,
		};
		this._listeners.push(listener);
	}

	public unsubscribe(callback: Callback<T1, T2, T3>): void {
		// 定位目标回调后移除，仅删除一个
		const index = this._listeners.findIndex((listener: Listener<T1, T2, T3>) => callback === listener.callback);
		if (index > -1) {
			this._listeners.splice(index, 1);
		}
	}

	public unsubscribeAll(linkedObject: unknown): void {
		// 移除所有绑定到指定对象的监听者，便于批量清理
		this._listeners = this._listeners.filter((listener: Listener<T1, T2, T3>) => listener.linkedObject !== linkedObject);
	}

	public fire(param1: T1, param2: T2, param3: T3): void {
		// 拷贝快照，避免回调过程中对列表的修改影响本次遍历
		const listenersSnapshot = [...this._listeners];
		// 提前移除 singleshot 监听，保证只执行一次
		this._listeners = this._listeners.filter((listener: Listener<T1, T2, T3>) => !listener.singleshot);
		listenersSnapshot.forEach((listener: Listener<T1, T2, T3>) => listener.callback(param1, param2, param3));
	}

	public hasListeners(): boolean {
		// 只要列表非空就说明还有活跃监听者
		return this._listeners.length > 0;
	}

	public destroy(): void {
		// 清空数组，释放所有引用
		this._listeners = [];
	}
}
