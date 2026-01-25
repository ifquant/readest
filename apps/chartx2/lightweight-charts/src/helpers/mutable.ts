/**
 * Removes "readonly" from all properties
 */
export type Mutable<T> = {
	// 将所有属性的 readonly 修饰符移除
	-readonly [P in keyof T]: T[P];
};
