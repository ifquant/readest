# 传输管理器详解 (Transfer Manager)

`src/services/transferManager.ts` 是一个单例服务，负责管理所有后台文件传输任务（上传、下载、删除）。它确保了传输任务的持久化、排队执行和错误重试。

## 1. 核心机制

### 队列管理

- **状态存储**: 依赖 `useTransferStore` (Zustand) 管理内存状态，并同步到 `localStorage` (`readest_transfer_queue`) 以实现持久化。即使刷新页面，未完成的任务也会在下次启动时恢复。
- **并发控制**: `processQueue` 检查 `maxConcurrent`（最大并发数），动态调度任务。
- **优先级**: 支持 `priority` 参数，高优先级任务（如用户手动点击）会插队先执行。

### 任务生命周期

1.  **Pending**: 加入队列。
2.  **In Progress**: 分配到执行槽位，开始传输。
    - 创建 `AbortController` 并存入 map，支持取消。
    - 绑定进度回调，实时更新 Store。
3.  **Completed / Failed**: 更新状态，发送 Toast 通知。
4.  **Retry**: 失败后进入指数退避重试 (`RETRY_DELAY_BASE_MS * 2^retryCount`)。

## 2. 关键代码解析

```typescript
// 指数退避重试逻辑
const delay = RETRY_DELAY_BASE_MS * Math.pow(2, currentTransfer.retryCount);
setTimeout(() => {
  this.processQueue();
}, delay);
```

```typescript
// 进度更新与取消检查
const progressHandler = (progress: ProgressPayload) => {
  if (abortController.signal.aborted) return; // 关键：检查取消信号
  // ... 更新 Store
};
```

## 3. Svelte 迁移指南

### Store 迁移

`useTransferStore` 需重构为 Svelte Store (`custom store`)。

```typescript
// src/lib/stores/transfer.ts
import { writable } from 'svelte/store';

function createTransferStore() {
    const { subscribe, update } = writable<TransferState>(initialState);

    return {
        subscribe,
        addTransfer: (item) => update(s => { ... }),
        // ... 其他 Action
    };
}
export const transferStore = createTransferStore();
```

### 服务单例化

`TransferManager` 本身设计良好（单例模式），可以直接移植到 SvelteKit。
唯一需要修改的是它对 `eventDispatcher` (Toast) 和 `useTransferStore` 的调用方式。在 Svelte 中，它可以直接导入并操作 `transferStore`。

### 后台同步 (Service Worker)

目前的实现依赖页面存活。如果迁移到 PWA，建议结合 **Background Sync API**，将上传/下载任务委托给 Service Worker，以支持后台（即使关闭页面）传输。
