# OPDS 浏览器 (OPDS Browser)

`src/app/opds` 实现了完整的 OPDS (Open Publication Distribution System) 客户端，允许用户浏览在线书库并下载书籍。

## 1. 核心架构

### 1.1 状态机驱动

`src/app/opds/page.tsx` 是一个基于状态机的单页应用 (SPA)。

- **ViewMode**: 页面状态分为 `feed` (目录列表), `publication` (书籍详情), `search` (搜索页), `loading`, `error`。
- **OPDSState**: 保存当前的 Feed 数据、URL、Search Descriptor 等上下文。

### 1.2 导航系统

为了模拟浏览器体验（后退/前进），组件内部维护了一个 `HistoryEntry[]` 栈。

- **Push**: 每次点击链接，将新的 URL 和 State 压入栈。
- **Pop**: 点击后退按钮时，从栈中恢复之前的 State 和 ViewMode，从而避免重新请求网络。

### 1.3 网络层

Readest 必须处理极其复杂的网络情况：

- **CORS**: 浏览器端无法直接请求大部分 OPDS 服务器。
  - Web 端：使用 `fetchWithAuth` + Proxy Server。
  - Native 端：直接使用 Tauri 的 HTTP Client (`@tauri-apps/plugin-http` 或 `fetch`)，避开 CORS。
- **Authentication**: 支持 Basic Auth。代码中包含自动嗅探 Auth Header (`probeAuth`) 的逻辑。

## 2. 关键组件

- **FeedView**: 渲染 OPDS Feed。通常包含 Navigation Links (下一页, 分类) 和 Publications (书籍)。
- **PublicationView**: 渲染书籍详情页。显示封面、元数据、摘要。
  - 提供 "下载" 按钮，调用 `handleDownload`。
- **Navigation**: 顶部地址栏和工具栏。

## 3. Svelte 迁移指南

### 路由策略重构

目前的实现是在 _一个 Next.js 页面_ (`/opds`) 内部模拟路由。
在 SvelteKit 中，可以利用 `+page.ts` 的 `load` 函数来处理 OPDS 请求，从而利用框架原生的路由和导航：

- `src/routes/opds/[...url]/+page.svelte`
- 或者继续保持 SPA 模式（如果为了保留非常复杂的内存状态）。
- 但推荐 **Hybrid 模式**：URL query 参数驱动状态 (`?url=...`)，这样用户刷新页面不会丢失当前浏览位置。

### 数据获取

将 `loadOPDS` 逻辑提取到 `src/lib/services/opds.ts`。
利用 Svelte Query 或 SvelteKit 自带的 `await parent()` 机制来管理加载状态，替代手动的 `loading` state。

### XML 解析

目前依赖 `DOMParser` 和 `foliate-js/opds`。这部分逻辑是纯 JS，可以直接复用。
注意在 SSR (Server-Side Rendering) 环境下 `DOMParser` 不存在，需确保相关代码仅在客户端运行 (`onMount` 或 `browser` 检查)。
