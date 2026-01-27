# 状态管理与钩子深度解析 (State & Hooks Analysis)

## 1. 全局状态 (Global State)

Readest 使用 `Zustand` 进行全局状态管理。

### 核心 Stores 分析

#### `readerStore.ts` (12KB)

这是整个应用中最复杂的 Store，负责管理阅读器的生命周期。

- **状态**: `viewStates` (Map<key, ViewState>)。支持多本书同时打开。
- **核心动作**: `initViewState`, `setView`, `setProgress`。
- **关键点**: 它直接持有 `FoliateView` 的实例引用 (DOM 节点)，这在 Redux 等库中是反模式，但在 Zustand 中是可以的。
- **持久化**: 部分状态 (如 `progress`) 会同步回 `libraryStore` 和数据库。

#### `libraryStore.ts`

管理图书列表和分组。

- **计算属性**: `getGroups`, `getVisibleLibrary`。
- **逻辑耦合**: `updateBook` 方法直接调用了 `AppService`，这是不太好的设计（Store 应该纯粹一点）。

#### `settingsStore.ts`

管理用户设置的持久化。

- **交互**: 每次 `setSettings` 后可能会触发 `saveSettings` (写入磁盘)。

### Svelte 迁移指南 (Stores)

Svelte Stores (`writable`, `readable`) 比 Zustand 更轻量，但功能也更基础。

#### 迁移 `readerStore`

由于 Svelte Store 只是简单的 Observable，我们需要封装自定义 Store 来实现复杂逻辑。

```typescript
// src/lib/stores/reader.ts
import { writable } from 'svelte/store';

function createReaderStore() {
  const { subscribe, update } = writable<Record<string, ViewState>>({});

  return {
    subscribe,
    setView: (key: string, view: any) => update((s) => ({ ...s, [key]: { ...s[key], view } })),
    initViewState: async (id: string) => {
      // Complex logic here...
    },
  };
}
export const readerStore = createReaderStore();
```

#### 持久化策略

Svelte 没有内置的持久化中间件，但可以轻松实现：

```typescript
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export function persistentStore(key: string, startValue: any) {
  const storedValue = browser && localStorage.getItem(key);
  const store = writable(storedValue ? JSON.parse(storedValue) : startValue);

  store.subscribe((value) => {
    if (browser) localStorage.setItem(key, JSON.stringify(value));
  });
  return store;
}
```

## 2. 自定义钩子 (Custom Hooks)

Readest 大量使用 React Hooks 来封装业务逻辑。

### 核心 Hooks 分析

#### `useSync.ts` (数据同步)

这是一个包含大量副作用的 Hook，实际上更像是一个 Controller。

- **职责**: 监听配置变化，触发 `pullChanges` / `pushChanges`。
- **问题**: 逻辑分散在 `useEffect` 中，难以测试。
- **Svelte 迁移**: 建议重构为纯 TS 服务类 (`SyncService`) 或 Svelte Store，在 `onMount` 或布局中初始化一次。

#### `useBookShortcuts.ts` (快捷键)

将键盘事件映射到 Reader 动作。

- **Svelte 迁移**: 使用 `svelte:window` 处理全局快捷键，或使用 Action 绑定到特定元素。

```svelte
<svelte:window on:keydown={handleKeydown}/>
```

#### `useUICSS.ts` (样式注入)

向文档头部注入 `<style>` 标签。

- **Svelte 迁移**: Svelte 组件天然支持 `<style>`，或者使用 `svelte:head`。

```svelte
<svelte:head>
  {@html `<style>${userCSS}</style>`}
</svelte:head>
```

## 3. 总结与建议

Readest 的 React 代码库虽然逻辑清晰，但存在典型的 "Logic in Hooks" 现象，导致业务逻辑与 UI 生命周期强绑定。

**迁移原则**:

1.  **Logic Separation**: 将重逻辑 (Sync, Import) 移出组件/Hook，放入纯 TS 模块。
2.  **Store Simply**: 利用 Svelte Store 的简洁性，避免过度封装。
3.  **Use Web Standards**: 更多地依赖原生 DOM API (如 Pointer Events) 而不是 React 合成事件。
