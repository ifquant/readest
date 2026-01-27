# KOSync 服务详解 (KOSync Client)

`src/services/sync/KOSyncClient.ts` 实现了 KOReader 的同步协议。这允许 Readest 与 KOReader（一款流行的电子墨水屏阅读器软件）互通阅读进度。

## 1. 协议实现

### 认证

- **机制**: 用户名 + 密码的 MD5 哈希作为 `X-Auth-Key`。
- **注册**: 如果登录返回 401，客户端会自动尝试注册 (`/users/create`)。

### 代理模式

由于 CORS（跨域资源共享）限制，Web 端无法直接访问私有的 KOSync 服务器（通常由用户自建）。

- **Native (Tauri)**: 直接使用 `@tauri-apps/plugin-http` 发起请求，无视 CORS。
- **Web**: 通过 Next.js 的 `/api/kosync` 代理转发请求。

### 核心功能

- `getProgress(book)`: 获取服务端保存的最新进度。
- `updateProgress(book, progress, percentage)`: 上推本地进度。
- **文档标识**: 使用书籍的 MD5 哈希 (`book.hash`) 作为唯一 ID。

## 2. Svelte 迁移指南

### API Proxy 迁移

Next.js 的 `/api/kosync` 需要迁移到 SvelteKit。

```typescript
// src/routes/api/kosync/+server.ts
export async function POST({ request, fetch }) {
  const { serverUrl, endpoint, method, headers, body } = await request.json();
  // Re-construct request to external KOSync server
  const response = await fetch(`${serverUrl}${endpoint}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
  return response;
}
```

### 依赖注入

`KOSyncClient` 需要配置信息 (`KOSyncSettings`)。建议将其包装在 `SyncManager` 中，或者按需实例化。

```typescript
// Svelte Component
import { KOSyncClient } from '$lib/services/sync';

async function syncProgress(book) {
    const settings = $settingsStore.kosync;
    if (settings.enabled) {
        const client = new KOSyncClient(settings);
        await client.updateProgress(book, ...);
    }
}
```
