# OPDS 浏览器深度解析 (OPDS Browser Analysis)

## 什么是 OPDS?

OPDS (Open Publication Distribution System) 是基于 Atom XML 的电子书分发协议。Readest 的 `src/app/opds` 实际上是一个微型的、专用的 Web 浏览器。

## 核心实现 (`src/app/opds/page.tsx`)

### 1. 状态机与历史栈

由于这是一个单页应用内的“子浏览器”，它不能直接依赖浏览器的 History API (否则后退会直接退出书店)。
Readest 维护了一个内部栈：

```typescript
interface HistoryEntry {
  url: string;
  state: OPDSState;
  viewMode: ViewMode;
  // ...
}
const [history, setHistory] = useState<HistoryEntry[]>([]);
```

### 2. 内容解析

使用了 `DOMParser` 解析 XML 响应。

- **Feed View**: 解析 `<feed>` 标签，展示书籍列表。
- **Publication View**: 解析 `<entry>` 标签，展示单本书详情。
- **Search View**: 解析 `<OpenSearchDescription>`，处理搜索模板。

### 3. 反向代理 (CORS Proxy)

Web 浏览器通常无法直接访问第三方 OPDS 服务器（CORS 限制）。

- Readest 使用 `request_proxy` (Native) 或 `fetchWithAuth` (Web) 处理跨域。
- 图片缓存：`handleGenerateCachedImageUrl` 会将第三方封面下载到本地缓存，以提高加载速度。

## Svelte 迁移指南

### 利用 SvelteKit 路由

可以尝试将 OPDS 浏览器的内部状态映射到 SvelteKit 的 **URL Search Params**，这样可以利用浏览器原生的后退按钮，而不必维护脆弱的内部历史栈。

**URL 设计**: `/opds?url=https://catalog.feed&view=feed`

### 数据加载 (`+page.ts`)

利用 SvelteKit 的 `load` 函数在导航发生前预加载 Feed 数据。

```typescript
// src/routes/opds/+page.ts
export const load = async ({ url, fetch }) => {
  const feedUrl = url.searchParams.get('url');
  if (!feedUrl) return {};

  const response = await fetch(`/api/proxy?url=${encodeURIComponent(feedUrl)}`);
  const xml = await response.text();
  const feed = parseOpds(xml); // Utility function

  return { feed };
};
```

### 组件结构

- `src/routes/opds/+page.svelte`: 主视图容器。
- `src/lib/components/opds/Feed.svelte`
- `src/lib/components/opds/Entry.svelte`

这样，当用户点击一个 Feed 链接时，只需导航到 `?url=new_feed_url`，SvelteKit 会自动重新运行 `load` 函数并更新页面，无需手动管理 History Stack。这是一个巨大的架构简化。
