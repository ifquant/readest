# API 路由分析 (API Routes)

`src/app/api` 目录包含了 Readest 的后端服务逻辑（Serverless Functions）。这些接口通过 Next.js App Router 的 Route Handlers 定义，通常用于处理需要 **Server-Side Secrets**（如 API Keys）或跨域代理的请求。

## 1. 现有接口概览

### 1.1 Metadata Proxy (`/api/metadata/search`)

- **职责**: 代理 Google Books / Open Library 的元数据搜索请求。
- **必要性**:
  - 隐藏 Google Books API Key (防止前端泄漏)。
  - 解决浏览器直接请求第三方 API 可能遇到的 CORS 问题。
  - 统一已解析的数据格式。

### 1.2 TTS Proxy (`/api/tts`)

- **职责**: 为各类 TTS 引擎提供统一接口（OpenAI TTS, Azure等）。
- **必要性**:
  - 流式传输音频数据。
  - 管理 TTS 配额和计费。
  - 隐藏 API Key。

### 1.3 Payment Webhooks (`/api/stripe/*`)

- **职责**: 接收 Stripe 支付成功、退款、订阅变更的回调。
- **必要性**: 必须是公开可访问的 HTTPS 端点。

## 2. 鉴权模式

所有 API 路由都使用统一的鉴权逻辑：

```typescript
const { user, token } = await validateUserAndToken(request.headers.get('authorization'));
if (!user) return 403;
```

这验证了 Header 中的 `Bearer Token`，确保请求来自已登录用户。

## 3. SvelteKit 迁移指南

SvelteKit 的 API 路由定义在 `routes/api/[path]/+server.ts` 中。

### 3.1 目录映射

| Next.js                                | SvelteKit                                   |
| :------------------------------------- | :------------------------------------------ |
| `src/app/api/metadata/search/route.ts` | `src/routes/api/metadata/search/+server.ts` |
| `src/app/api/tts/route.ts`             | `src/routes/api/tts/+server.ts`             |

### 3.2 代码迁移示例

**Next.js:**

```typescript
export async function POST(req: NextRequest) {
  const body = await req.json();
  return NextResponse.json({ success: true });
}
```

**SvelteKit:**

```typescript
import { json } from '@sveltejs/kit';

export async function POST({ request, locals }) {
  // 鉴权通常在 hooks.server.ts 中完成，结果存入 locals.user
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  return json({ success: true });
}
```

### 3.3 环境变量

SvelteKit 提供了类型安全的环境变量访问：

- `$env/static/private`: 仅服务端可用（存放 API Keys）。
- `$env/static/public`: 前端可用。

**建议**: 将 `process.env['GOOGLE_BOOKS_API_KEYS']` 迁移到 `$env/static/private`。
