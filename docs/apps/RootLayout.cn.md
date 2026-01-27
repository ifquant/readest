# 根布局与应用结构 (Root Layout & Structure)

`src/app` 采用了 Next.js App Router 架构。虽然 SvelteKit 也使用文件系统路由，但在布局和上下文管理上有显著差异。

## 1. 根布局 (`layout.tsx`)

### 职责

- **Metadata**: 定义 SEO 元数据（OpenGraph, Twitter Cards, PWA Manifest）。
- **Global Styles**: 引入 `globals.css` (Tailwind)。
- **Context Providers**: 包裹全应用状态。
  - `EnvProvider`: 初始化 `AppService` (核心服务)。
  - `Providers`: 可能包含其它 Context (如 `ThemeProvider`, `QueryClientProvider` 等)。
- **Platform Specifics**: 针对 Tauri 平台添加 `edge-to-edge` CSS 类。

### SvelteKit 迁移指南

#### 布局迁移 (`src/routes/+layout.svelte`)

SvelteKit 的 Layout 类似，但更简洁。

```svelte
<script>
  import '../app.css'; // globals.css
  import { onMount } from 'svelte';

  // 对应 Metadata
  $: title = 'Readest';
</script>

<svelte:head>
  <title>{title}</title>
  <!-- Meta tags -->
</svelte:head>

<slot />
```

#### Provider 迁移

SvelteKit 不太推荐 React 式的 "Provider Hell"。

- `EnvProvider` (AppService): 建议在 `src/hooks.client.ts` 或根 Layout 的 `onMount` 中初始化全局单例，/store 导出。
- 其它状态：使用 Svelte Store 或 Context API (setContext/getContext)，但通常不需要包裹整个 DOM 树。

## 2. 首页 (`page.tsx`)

目前的实现仅仅是引入并渲染 `LibraryPage`。

```typescript
import LibraryPage from './library/page';
export default function HomePage() { return <LibraryPage />; }
```

### SvelteKit 迁移

直接在 `src/routes/+page.svelte` 中重定向，或者直接通过路由重写。

```typescript
// src/routes/+page.server.ts
import { redirect } from '@sveltejs/kit';

export function load() {
  throw redirect(307, '/library');
}
```

## 3. 全局错误处理 (`error.tsx`)

React 的 Error Boundary 机置。

- 捕获渲染错误。
- 上报 PostHog。
- 提供 UI (Try Again)。

### SvelteKit 迁移 (`+error.svelte`)

SvelteKit 提供 `+error.svelte` 处理加载时错误，以及 `src/hooks.client.ts` (`handleError`) 处理运行时错误。

```typescript
// src/hooks.client.ts
export const handleError = ({ error }) => {
  posthog.captureException(error);
};
```
