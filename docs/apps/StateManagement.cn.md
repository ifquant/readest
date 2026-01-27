# 状态管理分析 (State Management)

Readest 使用 **Zustand** 作为全局状态管理库。
本文档分析核心 Store 的架构、持久化策略以及向 Svelte Store 迁移的指引。

## 1. Store 架构总览

应用的状态大致分为三层：

1.  **UI 状态 (Ephemeral)**: 组件内部状态或 `readerStore` (View State)。
2.  **配置状态 (Persistent)**: `settingsStore` (Global Settings)。
3.  **数据状态 (Persistent)**: `bookDataStore` (Book Metadata/Config)。

### 1.1 核心 Stores

| Store           | 职责                                                                       | 持久化 | 备注                                                                |
| :-------------- | :------------------------------------------------------------------------- | :----- | :------------------------------------------------------------------ |
| `readerStore`   | 管理所有打开书籍的**视图状态** (`FoliateView` 实例、加载状态、Ribbon 显示) | 否     | 纯运行时状态，其中的 `progress` 变化会触发 `bookDataStore` 的持久化 |
| `bookDataStore` | 管理书籍的**元数据与配置** (`BookConfig`, `BookDoc`)                       | 是     | 核心数据源，负责调用 `appService.saveBookConfig`                    |
| `settingsStore` | 管理全局应用设置 (主题、语言、以及默认阅读配置)                            | 是     | 启动时通过 `appService.loadSettings` 加载                           |
| `libraryStore`  | 书架列表数据                                                               | 是     | 简单的数组状态                                                      |

---

## 2. 核心 Store 深入分析

### 2.1 阅读器状态 (`readerStore.ts`)

这是一个极其复杂的 Store，管理着多本书籍的并行打开状态 (`viewStates`)。

- **View Object Management**: 直接持有 `FoliateView` (Web Component) 的引用。这在 Redux 等库中是反模式，但在 Zustand 中是被允许的，方便直接调用 `view.goTo()` 等指令式 API。
- **Key Logic**:
  - `initViewState`: 初始化书籍状态，加载 `BookDoc` 和配置。
  - `setProgress`: 更新进度，并**级联更新** `bookDataStore` 和 library。
  - `setViewSettings`: 实时更新视图设置 (字体、布局)，并决定是否持久化到 Book Config。

### 2.2 数据持久化 (`bookDataStore.ts`)

这不仅是 Store，还是**数据访问层 (DAL)**。

- **Updates**: 当 Store 中的数据 (如 `booknotes`) 更新时，不会立即写盘。
- **Save**: `saveConfig` 方法是显式调用的，通常由 `readerStore` 在关键节点（翻页、关闭书籍）触发。
- **Dedup**: `updateBooknotes` 包含去重逻辑，确保笔记 ID 唯一。

---

## 3. Svelte 迁移指南

Svelte 自带的 `svelte/store` 非常强大，足以替代 Zustand。

### 3.1 架构映射

| React (Zustand)                    | Svelte (Store)      | 迁移策略                                                                                      |
| :--------------------------------- | :------------------ | :-------------------------------------------------------------------------------------------- |
| `create((set) => ({ ... }))`       | `writable({})`      | 将 Zustand Store 拆分为多个细粒度的 Svelte Writable Store 或者一个包含 Action 的 Custom Store |
| `useStore(selector)`               | `$store.prop`       | Svelte 的自动订阅语法极其简洁，不再需要 Selector                                              |
| `useEffect(() => { ... }, [deps])` | `store.subscribe()` | 在 Store 内部处理副作用（如自动保存），UI 组件无需感知                                        |

### 3.2 示例：ReaderStore 重构

建议将 `readerStore` 重构为基于 Context 的 Store，因为在 SvelteKit 中，服务端渲染 (SSR) 时全局 Store 是不安全的（会跨请求共享）。

```typescript
// stores/reader.ts
import { writable } from 'svelte/store';

export function createReaderStore() {
    const { subscribe, update } = writable<ReaderState>({ ... });

    return {
        subscribe,
        openBook: async (key) => { ... }, // 对应 initViewState
        setProgress: (progress) => { ... }
    };
}

// 在组件中使用 Context
// routes/reader/[bookId]/+page.svelte
setContext('reader', createReaderStore());
```

### 3.3 示例：持久化 Store

利用 Svelte Store 的契约，可以轻松创建自动持久化的 Store：

```typescript
function persistentStore<T>(key: string, startValue: T) {
    const { subscribe, set, update } = writable(startValue);

    // Load from disk on init
    appService.load(key).then(val => set(val));

    return {
        subscribe,
        set: (val) => {
             set(val);
             appService.save(key, val); // Auto save
        },
        update: ...
    };
}
```

### 3.4 视图对象管理

在 Svelte 中，`FoliateView` 的实例不需要放在 Store 中。
可以直接使用 `bind:this` 在组件内部获取引用，或者通过 Context 传递给子组件。这也避免了将非序列化对象放入全局状态的尴尬。
