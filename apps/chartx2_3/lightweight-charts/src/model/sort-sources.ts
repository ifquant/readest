import { ensureNotNull } from '../helpers/assertions';

import { ZOrdered } from './idata-source';

/**
 * 按 z-order 对数据源进行排序，确保渲染层级正确。
 */
export function sortSources<T extends ZOrdered>(sources: readonly T[]): T[] {
	return sources.slice().sort((s1: ZOrdered, s2: ZOrdered) => {
		return (ensureNotNull(s1.zorder()) - ensureNotNull(s2.zorder()));
	});
}
