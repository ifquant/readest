# SyncContext 分析

## 目的

`SyncContext` 是 `SyncClient` 类的一个非常薄的包装器。它本质上创建了一个 `SyncClient` 的 **单例** 实例，并通过 Context API 将其传递下去。

## 内容

```typescript
const syncClient = new SyncClient(); // 模块级创建的单例
```

## Svelte 迁移指南

在 React 中这是一种反模式（模块级单例包裹在 Context 中），在 Svelte（以及纯 ES 模块）中则变得非常简单。因为 `syncClient` 是无状态的（或者管理其内部状态）且不需要触发 React 自身的重新渲染（除非它使用监听器），所以它应该只是一个导出的常量。

### 推荐实现

完全删除变量和 Context。只需从 `src/libs/sync.ts` 导出单例。

```typescript
// src/libs/sync.ts
export class SyncClient {
  // ... implementation
}

// Create the singleton instance here
export const syncClient = new SyncClient();
```

### Svelte 组件中的使用

```svelte
<script>
  import { syncClient } from '@/libs/sync';

  function handleSync() {
    syncClient.sync();
  }
</script>

<button on:click={handleSync}>Sync Now</button>
```

### 为什么不用 Store？

如果 `SyncClient` 有更新数据的方法（如 `lastSyncTime`），并且你希望 UI 对此做出反应，那么你应该将 _该特定状态_ 包裹在 Svelte store 中，或者让 `SyncClient` 扩展 store。

**增强的响应式模式：**

```typescript
// src/libs/sync.ts (Reactive)
import { writable } from 'svelte/store';

function createSyncClient() {
  const { subscribe, set, update } = writable({ status: 'idle', lastSync: null });

  return {
    subscribe,
    async sync() {
      update((s) => ({ ...s, status: 'syncing' }));
      // ... logic
      update((s) => ({ ...s, status: 'idle', lastSync: new Date() }));
    },
  };
}

export const syncClient = createSyncClient();
```
