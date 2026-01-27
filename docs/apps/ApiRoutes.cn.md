# API 路由分析 (API Routes)

Readest 的 `src/app/api` 目录充当了 **BFF (Backend for Frontend)** 层，主要负责处理跨域代理、第三方服务封装和支付回调。

## 1. 原文/元数据服务 (`metadata/`)

`src/app/api/metadata/search` 封装了书籍元数据搜索逻辑。

- **Service**: `MetadataService`。
- **Source**: 主要依赖 Google Books API (`GOOGLE_BOOKS_API_KEYS`)。
- **Security**: 需要用户登录 (`Authorization` Header)。
- **Validation**: 严格校验 ISBN (10/13位) 格式，防止无效请求浪费 API Quota。

## 2. TTS 服务 (`tts/edge`)

利用 Microsoft Edge 浏览器的免费 Read Aloud API 提供高质量的语音合成。

- **Library**: 依赖 `libs/edgeTTS` (逆向协议实现)。
- **Speed Mapping**: 前端使用类似 OpenAI 的倍速 (0.25x - 4.0x)，后端将其映射为 Edge TTS 所需的相对速率 (e.g. `+50%`, `-20%`)。
- **Response**: 直接返回 `audio/mpeg` 二进制流，前端通过 `<audio>` 或 `Web Audio API` 播放。

## 3. OPDS 代理 (`opds/proxy`)

专为 Web 端设计的 CORS 代理。
因为大多数 OPDS 服务器 (如 Calibre-web, Kavita) 未配置 CORS 头，浏览器无法直接访问。

- **Cloudflare Hack**: 特殊处理 `url` 参数中的 `%26` (&)，防止 Cloudflare Workers 错误解析 Query String。
- **Streaming**: 当检测到大文件 (`Content-Length > 1MB`) 时，使用流式响应 (`response.body`) 透传，避免内存爆满。

## 4. 支付与验证 (`stripe/`, `*/iap-verify`)

- **Stripe**: 处理 Webhook 回调，详见 [支付系统文档](./Payment.cn.md)。
- **IAP Verify**: `apple/iap-verify` 和 `google/iap-verify` 用于验证移动端内购凭证 (Receipt Validation)。

---

## 5. Svelte 迁移指南

### 5.1 Endpoint 迁移

Next.js 的 Route Handlers (`route.ts`) 与 SvelteKit 的 Server Endpoints (`+server.ts`) 结构高度相似。

**Example: Search API**

```typescript
// src/routes/api/metadata/search/+server.ts
import { json } from '@sveltekit/kit';

export async function POST({ request, locals }) {
  // 1. Auth Check (利用 hooks.server.ts 注入的 locals)
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Body Parsing
  const body = await request.json();

  // 3. Logic ...
  const result = await metadataService.search(body);

  return json(result);
}
```

### 5.2 边缘兼容性

目前的 API 大量使用了 Node.js Runtime (尤其是 `edge-tts` 可能依赖 `ws` 或 `net`)。
如果计划部署到 Cloudflare Pages 或 Vercel Edge，需要确认依赖库是否支持 Edge Runtime。如果不支持，需在 SvelteKit 配置中强制指定 `isr` 或 `nodejs` 适配器。
