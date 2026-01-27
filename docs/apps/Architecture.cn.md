# 核心架构分析 (Architecture)

本文档分析 Readest App 的底层架构，包括 Next.js 混合路由模式、PWA (Service Worker) 实现、中间件以及 React Context 体系。

## 1. 混合路由架构 (Hybrid Router)

Readest 目前处于 Next.js **App Router** (新) 和 **Pages Router** (旧) 共存的过渡阶段。

- **App Router (`src/app`)**: 承载了核心业务逻辑 (`layout`, `auth`, `library`, `reader`, `user`)。这是现代 Next.js 的推荐实践，利用了服务端组件 (RSC) 的能力。
- **Pages Router (`src/pages`)**:
  - `_app.tsx`: 传统的全局入口，处理样式引入。
  - `/api`: 传统的 API Routes。
  - `/reader`: 似乎保留了旧版的阅读器入口，可能是为了兼容某些旧链接或作为 iframe 嵌入的备用方案。

**迁移建议**: 在 SvelteKit 中，路由统一为基于文件系统的路由 (`src/routes`)。所有 API Routes 迁移到 `+server.ts`，页面迁移到 `+page.svelte`。

## 2. PWA 与 Service Worker (`src/sw.ts`)

使用了 **@serwist/next** (现代版的 Workbox) 来构建 Service Worker。

### 2.1 缓存策略

Readest 的缓存策略非常激进，旨在提供极致的离线体验：

- **Client Pages (`/library`, `/reader`)**: `NetworkFirst` (网络优先)，但拥有 3秒 的超时机制。如果网络慢，自动回退到缓存。
- **Fonts**: `CacheFirst` (缓存优先)，过期时间长达 **2年**。这确保了字体加载零延迟。
- **API**: 明确排除了 `/api/*` 路由的缓存，确保数据实时性。

### 2.2 离线回退

配置了 `fallbacks`，当断网访问文档时，自动渲染 `/offline` 页面。

**Svelte 迁移**:
SvelteKit 对 Service Worker 有原生支持 (`src/service-worker.ts`)。Serwist 也支持 SvelteKit。可以直接移植逻辑。

## 3. 中间件与安全性 (`middleware.ts`)

Next.js Middleware 主要负责处理 **CORS (跨域资源共享)**。

- **白名单**: 严格限制了 `Origin`，只允许：
  - `web.readest.com` (Web版)
  - `tauri.localhost` (Tauri macOS/Linux)
  - `http://localhost:3000` (Dev)
- **预检 (Preflight)**: 拦截 `OPTIONS` 请求并直接返回 200 OK，这对 API 的性能至关重要。

**Svelte 迁移**: 对应 SvelteKit 的 `src/hooks.server.ts` 中的 `handle` 钩子。

## 4. 上下文体系 (`src/context`)

Readest 使用 React Context 进行依赖注入。

- **`EnvContext`**: 极其关键的抽象层。它根据运行环境（Web vs Tauri）注入不同的 `AppService` 实现 (`WebAppService` vs `NativeAppService`)。这是实现 "一套代码，多端运行" 的基石。
- **`AuthContext`**: 封装 Supabase Auth，提供 `user` 和 `session` 对象。
- **`SyncContext`**: 跨组件触发同步事件。

**Svelte 迁移**:

- **EnvContext**: SvelteKit 的 `src/hooks.client.ts` 或 `+layout.svelte` 是注入环境服务的理想位置。可以使用 `setContext` 在根组件提供 `appService`。
- **AuthContext**: SvelteAuth 或者直接在 `+layout.server.ts` 中获取 Session 并通过 Store 传递。
