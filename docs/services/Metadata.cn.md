# 元数据服务详解 (Metadata Service)

`src/services/metadata` 提供了一个可扩展的书籍元数据搜索与聚合框架，支持多源并发搜索和结果自动优选。

## 1. 架构设计

服务采用 **聚合器模式 (Aggregator Pattern)**。

- **MetadataService** (`service.ts`)

  - 核心管理类。
  - 初始化时加载所有注册的 Providers (如 Google Books, Open Library)。
  - `search()` 方法并行调用所有 Provider (`Promise.allSettled`)。
  - 结果按 **置信度 (Confidence)** 降序排列。

- **BaseMetadataProvider** (`providers/base.ts`)
  - 抽象基类，定义了 `searchByISBN`和 `searchByTitle` 接口。
  - 提供了通用的 ISBN 校验和清洗逻辑。

## 2. 数据提供商 (Providers)

目前实现了以下 Provider：

| Provider         | 特点                  | 优势                                   |
| :--------------- | :-------------------- | :------------------------------------- |
| **Google Books** | 调用 Google Books API | 数据最全，包含封面和简介，支持多语言。 |
| **Open Library** | 调用 Open Library API | 开源数据，英文书目较多。               |

### Google Books 实现细节 (`providers/googlebooks.ts`)

- 需要 API Key（支持轮询多个 Key 以规避限流）。
- 自动处理 API 错误 (429 Rate Limit, 403 Forbidden)。
- 优先提取 ISBN-13，降级使用 ISBN-10。
- 图片链接自动替换 `http` 为 `https` 以避免 Mixed Content 警告。

## 3. Svelte 迁移指南

### API 代理

目前的 Provider 直接在客户端调用第三方 API，这会暴露 API Keys。建议在 SvelteKit 中将其移至服务端 (`+server.ts`)。

**新架构建议**:

1.  **Server-side Providers**: 将 `GoogleBooksProvider` 等移至 `$lib/server/metadata/`。
2.  **Proxy Endpoint**: 创建 `/api/metadata/search` 接口。
3.  **Client Service**: 客户端仅调用该 Proxy 接口。

```typescript
// src/routes/api/metadata/search/+server.ts
import { json } from '@sveltejs/kit';
import { MetadataService } from '$lib/server/metadata';

export async function POST({ request }) {
  const { title, isbn, author } = await request.json();
  const service = new MetadataService({ googleBooksApiKeys: env.GOOGLE_API_KEY });
  const results = await service.search({ title, isbn, author });
  return json(results);
}
```
