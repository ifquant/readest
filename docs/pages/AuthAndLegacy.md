# 认证、更新与遗留路由深度解析

## 1. 认证模块 (`src/app/auth`)

Readest 的认证系统是**混合式**的，同时支持 Web (Supabase) 和 Native (OAuth via Deep Link)。

### 核心页面 (`src/app/auth/page.tsx`)

这是一个巨型组件 (15KB)，集成了登录、注册、找回密码拥有多种状态视图。

- **状态管理**: 使用本地 React State 管理 `view` ('sign_in', 'sign_up', 'magic_link' 等)。
- **Native 集成**:
  - **OAuth**: 通过 Custom Tab 或 Safari View Controller 打开 OAuth URL。
  - **Deep Link**: 监听 `scheme://auth-callback` 来捕获 Native 登录回调。

### Svelte 迁移指南

建议将这个巨型页面拆分为多个子路由或组件：

- `src/routes/auth/+layout.svelte`: 共享的 Auth 布局（Logo, 背景）。
- `src/routes/auth/login/+page.svelte`
- `src/routes/auth/register/+page.svelte`
- `src/routes/auth/callback/+page.svelte`: 专门处理 OAuth 回调。

```svelte
<!-- src/routes/auth/login/+page.svelte -->
<script>
  import { supabase } from '$lib/supabase';

  async function handleLogin() {
    const { error } = await supabase.auth.signInWithPassword({...});
  }
</script>
```

## 2. 更新模块 (`src/app/updater`)

这是一个专门用于展示更新日志和执行更新的独立页面。

- `src/app/updater/page.tsx`: 非常简单，通常嵌入在 `UpdaterWindow` 组件中，或者在移动端作为独立页面展示。
- **逻辑**: 依赖全局的 `UpdaterWindow` 组件（见之前分析）来驱动更新流程。

## 3. 遗留路由: Reader Multi-View (`src/pages/reader/[ids].tsx`)

这是一个非常有趣的发现。

- **用途**: 它似乎是为了支持 **多窗口/分屏模式** 而保留的 Pages Router 路由。
- **实现**: 它手动包裹了所有的 Context Providers (`AuthProvider`, `EnvProvider` 等)。
- **原因**: Next.js App Router 在早期版本中对于某些动态路由或纯客户端渲染 (CSR) 的支持可能不如 Pages Router 灵活，或者这是一个为了兼容旧版 Deep Link 的遗留入口。
- **关键参数**: `ids`。它可以接受形如 `id1,id2` 的参数，这与 `Reader` 组件的多视图能力直接对应。

### Svelte 迁移

SvelteKit 的路由参数非常灵活，不需要这种变通方案。

```typescript
// src/routes/reader/[...ids]/+page.svelte
// URL: /reader/book1/book2
import { page } from '$app/stores';

$: bookIds = $page.params.ids.split('/');
```

## 4. 中间件 (`middleware.ts`)

目前主要用于处理 `/api/*` 路由的 CORS (跨域资源共享) 设置。

- **白名单**: `web.readest.com`, `tauri.localhost`, `localhost:3000`。
- **SvelteKit 对应**: `src/hooks.server.ts` 中的 `handle` 函数。

```typescript
// src/hooks.server.ts
export const handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api')) {
    if (event.request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
  }
  const response = await resolve(event);
  // Add CORS headers to response
  return response;
};
```
