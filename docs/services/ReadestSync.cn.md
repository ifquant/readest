# Readest 同步服务详解 (Readest Sync)

`src/libs/sync.ts` 实现了 Readest 自身的云端同步协议。它不同于 KOSync，是专为 Readest 的多设备互通设计的。

## 1. 协议设计

### 增量同步 (Incremental Sync)

API 采用基于时间戳 (`since`) 的增量同步模式。

- `pullChanges(since)`: 获取自上次同步以来服务器发生变更的数据。
- `pushChanges(payload)`: 将本地变更推送到服务器。

### 数据类型

同步覆盖了三个维度的用户数据：

1.  **Books**: 阅读进度、元数据变更。
2.  **Notes**: 高亮、笔记、划线。
3.  **Configs**: 此处指 **每本书的独立配置** (BookConfig)，如字体缩放、阅读位置记录，而非全局设置。

### 冲突解决

目前的实现较为简单，依赖服务器端的 **Last-Writer-Wins (LWW)** 策略。
客户端 `SyncClient` 只是负责数据的搬运，不处理复杂的合并逻辑 (Merge Strategy)。

## 2. 鉴权

使用 JWT Bearer Token。

- `getAccessToken()`: 从本地存储获取 Token。

## 3. Svelte 迁移指南

### API Client 封装

当前是一个简单的 Class。在 SvelteKit 中，可以将其封装为更高级的 Service，并结合 `tanstack-query` (或 Svelte Query) 来处理自动重试和缓存。

```typescript
// src/lib/api/sync.ts
export class SyncService {
  constructor(private fetch: typeof window.fetch) {}

  async pull(timestamp: number) {
    // ...
  }
}
```

### Store 集成

同步通常由全局 Store 触发。
建议在 `src/lib/stores/sync.ts` 中监听数据变更，并将其放入 "待同步队列" (Dirty Queue)，利用 `requestIdleCallback` 批量推送。
