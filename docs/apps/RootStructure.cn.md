# 根目录结构分析 (Root Structure)

本文档分析 `src/app` 根目录下的基础设施文件，它们构成了应用的骨架。

## 1. 根布局 (`layout.tsx`)

这是整个应用的最外层包装器 (Root Shell)。

### 1.1 平台适配

Readest 是一个跨平台应用 (Web + Tauri)，`layout.tsx` 承担了样式归一化的职责：

- **CSS Class**: 如果检测到 `NEXT_PUBLIC_APP_PLATFORM === 'tauri'`，会在 `html` 标签上添加 `edge-to-edge` 类。
  - 这意味着 Tauri 端会禁用浏览器的默认滚动条，并启用沉浸式窗口样式 (MacOS Traffic Light 适配)。

### 1.2 PWA 配置

包含了极其详尽的 `<meta>` 标签：

- `apple-mobile-web-app-capable`: 允许以 Standalone 模式运行。
- `viewport-fit=cover`: 适配 iPhone 刘海屏。
- `manifest.json`: 指向 PWA 清单文件。

### 1.3 依赖注入 (`Providers`)

整个应用的状态树通过两层 Provider 初始化：

1.  **EnvProvider**: 注入环境配置 (`AppService`)，这是应用与底层系统 (OS/Browser) 交互的桥梁。
2.  **Providers**: (位于 `src/components/Providers.tsx`) 聚合了业务层 Context，如 Theme, Auth, QueryClient 等。

---

## 2. 鉴权与重定向 (`page.tsx`)

`src/app/page.tsx` 通常很简洁（只有 123 字节），它的主要职责是**路由守卫**。

- 检查用户登录状态 (Supabase Session)。
- 已登录 -> 重定向至 `/library`。
- 未登录 -> 展示 Landing Page 或重定向至 `/auth`。

---

## 3. Svelte 迁移指南

### 3.1 布局迁移 (+layout.svelte)

SvelteKit 的 Layout 系统更强大。

- 把 `Providers` 拆分为布局中的逻辑。
- 使用 `onMount` 来处理仅客户端的初始化逻辑 (如 Tauri Window 设置)。
- PWA Meta 标签应移至 `src/app.html`。

### 3.2 环境变量

Next.js 使用 `process.env`，SvelteKit 使用 `$env/static/public`。
你需要全局搜索并替换 `NEXT_PUBLIC_` 变量。

### 3.3 样式隔离

`globals.css` 应在 `+layout.svelte` 中导入。
Tailwind 的 `edge-to-edge` 类逻辑可以在 `<svelte:head>` 或 `+layout.server.ts` 中根据 User-Agent 或构建时的 Env 动态处理。
