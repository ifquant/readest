# API Routes与服务端逻辑

## 1. 数据同步引擎 (`src/pages/api/sync.ts`)

**分析**：这是一个基于 Supabase 的全功能双向同步引擎。

- **协议**：自定义 REST 协议。
- **GET 请求 (Pull)**：
  - 接收 `since` 时间戳。
  - 查询 `books`, `book_notes`, `book_configs` 表中 `updated_at > since` 的记录。
  - 支持分页 (`PAGE_SIZE = 1000`)。
- **POST 请求 (Push)**：
  - 接收客户端上传的变更集（Batch）。
  - **冲突解决 (Conflict Resolution)**：Last Write Wins (LWW)。对比 Server 和 Client 的 `updated_at`，保留更新的一方。
  - **批量操作**：使用 `upsert` 批量写入数据库。

### SvelteKit 迁移 (`src/routes/api/sync/+server.ts`)

SvelteKit 的服务端路由与 Next.js API Routes 非常相似，但使用了标准的 `Request`/`Response` 对象。

```typescript
// src/routes/api/sync/+server.ts
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase'; // Server-side admin client

export async function GET({ url, request }) {
  const since = url.searchParams.get('since');
  // ... Authentication & Validation ...

  // Logic remains largely the same, just adapting the response format
  const data = await querySyncData(since); // Refactored function
  return json(data);
}

export async function POST({ request }) {
  const body = await request.json();
  // ... Upsert Logic ...
  return json({ success: true });
}
```

## 2. KOReader 代理 (`src/pages/api/kosync.ts`)

**分析**：一个简单的反向代理，用于绕过 CORS 或安全限制，允许 Web 端与 KOReader 同步服务器通信。

- **验证**：只允许特定的 endpoints (`/users/create`, `/syncs/progress` 等)。
- **转发**：将请求原样转发给 `serverUrl`，并附带特定的 Headers (`Accept: application/vnd.koreader.v1+json`)。

### SvelteKit 迁移 (`src/routes/api/kosync/+server.ts`)

这个几乎可以直接移植。

```typescript
// src/routes/api/kosync/+server.ts
import { error } from '@sveltejs/kit';

export async function POST({ request }) {
  const { serverUrl, endpoint, method, headers, body } = await request.json();

  // Validation Logic ...

  const response = await fetch(`${serverUrl}${endpoint}`, {
    method,
    headers: { ...headers, Accept: 'application/vnd.koreader.v1+json' },
    body: body ? JSON.stringify(body) : null,
  });

  const data = await response.json();
  return new Response(JSON.stringify(data), { status: response.status });
}
```

## 关键重构建议

在迁移到 SvelteKit 时，建议将 `sync.ts` 中的核心逻辑（数据库查询、冲突解决算法）提取到 `src/lib/server/sync-engine.ts` 中。这样：

1.  **可测试性**：可以独立测试同步逻辑，不依赖 HTTP 请求上下文。
2.  **复用性**：如果有其他入口（如 WebSocket 或 CLI 任务）也需要同步，可以复用代码。
