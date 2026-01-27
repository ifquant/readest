# 存储与同步系统 (Storage & Sync System)

本文档分析 `src/libs/storage.ts`, `src/libs/sync.ts` 以及辅助的 `metadata.ts` 和 `user.ts`。这些模块共同构成了 Readest 的数据持久化和云端同步层。

## 1. 存储系统 (`storage.ts`)

Readest 采用了 **混合存储策略**，旨在同时支持纯 Web 端和本地 Native 端，并尽可能复用代码。

### A. 接口抽象

虽然没有显式的 TS Interface，但模块导出了一组通用函数：

- `uploadFile` / `downloadFile`
- `deleteFile`
- `listFiles` / `getStorageStats`

### B. 平台分歧 (Web vs Native)

核心函数内部会通过 `isWebAppPlatform()` (基于环境变量或运行时检测) 分流逻辑：

- **Upload (上传)**:

  1.  **共通**: 先向后端 API (`/storage/upload`) 申请一个 **预签名 URL (Presigned URL)**。
  2.  **Web**: 使用浏览器 `XMLHttpRequest` (封装在 `webUpload`) 上传 `File` 对象。支持 `upload.onprogress` 事件。
  3.  **Native**: 调用 Tauri 插件命令 `tauriUpload`。
      - _原因_: Tauri 的 `fetch` 或 `XMLHttpRequest` 在处理大文件时可能会有内存问题或跨域限制。原生插件使用 Rust 的流式上传，性能更好且绕过 WebView 限制。

- **Download (下载)**:
  1.  **共通**: 获取下载 URL。
  2.  **Web**: 使用 `webDownload`，实际上是 `fetch` 获取 Blob，然后通过 `AppService` 写入 IndexedDB。
  3.  **Native**: 调用 `tauriDownload`，直接将网络流写入磁盘文件系统，不经过 JS 内存。

### C. 批量操作

`batchGetDownloadUrls` 允许一次性获取多个文件的访问链接，这对图书列表封面的加载至关重要，减少了 RTT (往返延迟)。

## 2. 同步协议 (`sync.ts`)

实现了一个轻量级的 **增量同步 (Incremental Sync)** 机制。

### 数据模型

- **SyncType**: `books` (图书), `notes` (笔记), `configs` (阅读进度/配置)。
- **SyncClient**: 封装了 HTTP 请求。

### 协议流程

1.  **Pull (拉取)**:

    - 客户端发送上次同步的时间戳 `since`。
    - 服务端返回自该时间点以来 **修改或删除** 的记录。
    - _冲突解决_: 简单的 "Last Write Wins" (最后写入者胜) 策略，或者由服务端控制。当前实现倾向于信任服务端返回的新数据。

2.  **Push (推送)**:
    - 客户端收集本地脏数据（Dirty Records）。
    - 批量 POST 发送到服务端。

## 3. 辅助模块

### Metadata (`metadata.ts`)

- 单一职责：调用 `/metadata/search`。
- 用于根据 ISBN 或书名搜索书籍详情（封面、作者、简介）。

### User (`user.ts`)

- 不仅包含删除用户 (`deleteUser`)，通常也包含用户资料管理（视代码完整性而定，目前仅见删除）。

## 4. Svelte 迁移指南

### 通用 API 层

建议将这些分散的函数整合成结构化的 API 模块。

```typescript
// src/lib/api/storage.ts
// src/lib/api/sync.ts
```

### SvelteKit Load Functions

对于只读数据（如 `getStorageStats`, `listFiles`），它们非常适合放在 SvelteKit 的 `load` 函数中。

```typescript
// src/routes/dashboard/+page.ts
import { getStorageStats } from '$lib/api/storage';

export const load = async () => {
  return {
    stats: await getStorageStats(),
  };
};
```

### 进度反馈 (Progress Stores)

目前 `onProgress` 是通过回调传递的。在 Svelte 中，可以创建一个临时的 `writable` store 来驱动 UI 进度条。

```typescript
const progress = writable(0);
await uploadFile(file, path, (p) => progress.set(p.progress));
```

### 认证守卫

`storage.ts` 和 `sync.ts` 中的函数都手动检查 `getAccessToken()`。
在 SvelteKit 中，建议使用 **Http Interceptor** (`hooks.client.ts` / `hooks.server.ts`) 统一处理 Token 注入和 401 错误重定向，简化业务代码。
