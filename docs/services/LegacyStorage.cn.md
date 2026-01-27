# 遗留存储服务详解 (Legacy Storage Service)

`src/libs/storage.ts` 封装了对后端对象存储系统 (`/storage/*` API) 的直接调用。

## 1. 定位

这部分代码与 `src/services/transferManager.ts` 存在功能重叠。

- **Storage Lib**: 提供底层的 HTTP API 包装 (Create Upload URL, Purge, List)。它是无状态的。
- **Transfer Manager**: 提供高层的队列管理、重试、持久化。它是有状态的。

实际上，`TransferManager` 在底层**并没有**直接使用 `libs/storage.ts`，而是自己在内部实现了一套上传逻辑。这属于**代码重复 (Duplication)**。

## 2. API 功能

- `uploadFile`: 申请预签名 URL (Presigned URL) 并上传文件。分 Web (XHR) 和 Native (Rust Plugin) 两种路径。
- `batchGetDownloadUrls`: 批量获取私有文件的带签名下载链接。
- `downloadFile`: 下载文件并保存到本地文件系统。
- `purgeFiles`: 批量永久删除云端文件。
- `getStorageStats`: 获取用户空间配额使用情况。

## 3. Svelte 迁移建议

### 代码合并

**强烈建议**在迁移过程中，将 `libs/storage.ts` 合并入 `TransferManager` 或将其作为 `TransferManager` 的底层依赖 (StorageProvider)。
不要保留两套并行的上传/下载逻辑。

### 后端 API 整合

SvelteKit 的 Server Actions (`+page.server.ts`) 非常适合处理这种带鉴权的 API 请求。
可以将申请 Upload URL 的逻辑移至 Server Action，前端直接获得 URL 后再向 S3/R2 上传。

```typescript
// src/routes/storage/upload/+server.ts
export async function POST({ request, locals }) {
    const { filename, size } = await request.json();
    const url = await s3.getSignedUrl(...)
    return json({ url });
}
```
