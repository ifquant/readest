# 页面与路由架构总览 (Routing Architecture Overview)

## 混合架构 (Hybrid Architecture)

Readest 目前采用了 Next.js 的 **混合路由模式**：

1.  **App Router (`src/app`)**: 用于核心应用页面（Library, Reader, Auth）。这是现代 Next.js 的标准，支持 React Server Components (RSC) 和嵌套布局。
2.  **Pages Router (`src/pages`)**: 主要用于 **API Routes** (`/api/*`) 和少量遗留页面。

这种架构是 Next.js 逐步迁移过程中的常见中间状态。

## 目录结构

```bash
src/
├── app/                  # App Router (主要 UI)
│   ├── layout.tsx        # 根布局 (Root Layout)
│   ├── page.tsx          # 首页 (重定向到 /library)
│   ├── library/          # 书架页面 (Dashboard)
│   ├── reader/           # 阅读器页面 (The Reader)
│   └── auth/             # 登录/注册
├── pages/                # Pages Router (API & Legacy)
│   ├── _app.tsx          # 遗留的全局包装器 (Global Wrapper)
│   └── api/              # 后端 API (Serverless Functions)
│       ├── sync.ts       # 数据同步引擎
│       └── kosync.ts     # KOReader 同步代理
```

## Svelte 迁移策略 (General Strategy)

SvelteKit 的路由系统与 Next.js App Router 非常相似，都是基于文件系统的。

| Next.js App Router       | SvelteKit                              | 说明                                                                  |
| :----------------------- | :------------------------------------- | :-------------------------------------------------------------------- |
| `src/app/layout.tsx`     | `src/routes/+layout.svelte`            | 根布局，包含 `<slot />`                                               |
| `src/app/page.tsx`       | `src/routes/+page.svelte`              | 页面内容                                                              |
| `src/app/loading.tsx`    | `src/routes/+layout.svelte` (状态控制) | SvelteKit 没有原生的 loading 文件，通常在布局中处理 `navigating` 状态 |
| `src/pages/api/hello.ts` | `src/routes/api/hello/+server.ts`      | 服务端路由 (API Endpoint)                                             |

### 关键路径映射

- **Library**: `src/app/library/page.tsx` -> `src/routes/library/+page.svelte`
- **Reader**: `src/app/reader/page.tsx` -> `src/routes/reader/+page.svelte`
- **Sync API**: `src/pages/api/sync.ts` -> `src/routes/api/sync/+server.ts`
