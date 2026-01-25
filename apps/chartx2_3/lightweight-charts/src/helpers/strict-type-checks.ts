/**
 * Represents a type `T` where every property is optional.
 */
export type DeepPartial<T> = {
	// 对象属性递归标记为可选，数组元素同样套用 DeepPartial
	[P in keyof T]?: T[P] extends (infer U)[]
		? DeepPartial<U>[]
		: T[P] extends readonly (infer X)[]
			? readonly DeepPartial<X>[]
			: DeepPartial<T[P]>
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function merge(dst: Record<string, any>, ...sources: Record<string, any>[]): Record<string, any> {
	// 与 Object.assign 类似，但会递归合并对象、忽略 undefined 及原型链污染关键字段
	for (const src of sources) {
		// eslint-disable-next-line no-restricted-syntax
		for (const i in src) {
			if (
				src[i] === undefined ||
				!Object.prototype.hasOwnProperty.call(src, i) ||
				['__proto__', 'constructor', 'prototype'].includes(i)
			) {
				continue;
			}

			if ('object' !== typeof src[i] || dst[i] === undefined || Array.isArray(src[i])) {
				// 基本类型或数组直接覆盖
				dst[i] = src[i];
			} else {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				// 对象则递归合并
				merge(dst[i], src[i]);
			}
		}
	}

	return dst;
}

export function isNumber(value: unknown): value is number {
	// 过滤 NaN/Infinity，仅接受有效数字
	return (typeof value === 'number') && (isFinite(value));
}

export function isInteger(value: unknown): boolean {
	// 检查是否是整数（允许负数）
	return (typeof value === 'number') && ((value % 1) === 0);
}

export function isString(value: unknown): value is string {
	return typeof value === 'string';
}

export function isBoolean(value: unknown): value is boolean {
	return typeof value === 'boolean';
}

export function clone<T>(object: T): T {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const o = object as any;
	if (!o || 'object' !== typeof o) {
		// 标量直接返回引用
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return o;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let c: any;

	if (Array.isArray(o)) {
		// 区分数组与对象，保持结构
		c = [];
	} else {
		c = {};
	}

	let p;
	let v;
	// eslint-disable-next-line no-restricted-syntax
	for (p in o) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,no-prototype-builtins
		if (o.hasOwnProperty(p)) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			v = o[p];
			if (v && 'object' === typeof v) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				// 嵌套对象继续深拷贝
				c[p] = clone(v);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				// 基本类型直接赋值
				c[p] = v;
			}
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return c;
}

export function notNull<T>(t: T | null): t is T {
	// Type Guard：排除 null，供 Array.filter 等场景使用
	return t !== null;
}

export function undefinedIfNull<T>(t: T | null): T | undefined {
	// 将 null 正规化为 undefined，方便与 Optional 字段对齐
	return (t === null) ? undefined : t;
}
