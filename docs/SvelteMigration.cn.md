# Svelte 迁移实施总纲 (Master Svelte Migration Plan)

本文档是将 Readest App 从 Next.js (React) 迁移至 SvelteKit 的完整执行路线图。基于对代码库的全面分析，我们将迁移过程划分为 5 个阶段。

## 阶段 1: 基础设施搭建 (Infrastructure)

**目标**: 建立 SvelteKit 项目骨架，确保底层工具链和类型系统就绪。

### 1.1 项目初始化

- [ ] 在 `apps/` 下初始化新的 SvelteKit 项目 (`apps/readest-svelte`)。
- [ ] 配置 Monorepo 工具 (Turborepo) 和包管理器 (pnpm)。
- [ ] 安装依赖: `tailwindcss`, `@tauri-apps/api`, `foliate-js`, `lucide-svelte` 等。

### 1.2 样式与资源

- [ ] **Tailwind**: 迁移 `tailwind.config.ts`, 确保 `daisyui` 插件配置一致。
- [ ] **Global CSS**: 移植 `src/styles/globals.css`。
- [ ] **Theme**: 移植 `src/styles/themes.ts` 和 `fonts.ts`。
- [ ] **Assets**: 复制 `public/` 资源。

### 1.3 核心类型与工具 (Types & Utils)

- [ ] **Types**: 直接复制 `src/types/*.ts` (Book, System, Quota 等)。这些是纯 TS 定义，无需修改。
- [ ] **Utils**: 移植 `src/utils/*.ts`。
  - _注意_: 检查所有使用 `files` 或 `window` 的工具函数，确保包含 `browser` 环境检查 (`import { browser } from '$app/environment'`)。

### 1.4 核心库 (Libs)

- [ ] **Document**: 移植 `src/libs/document.ts` (Book Parser)。
- [ ] **TTS**: 移植服务 `src/libs/edgeTTS.ts`, `mediaSession.ts`。
- [ ] **Storage/Sync/Payment**: 移植其余业务逻辑库。

## 阶段 2: 状态管理重构 (State Management)

**目标**: 将 Zustand Stores 转换为 Svelte Stores。这是最关键的逻辑迁移。

### 2.1 全局 Store 转换

- [ ] **Settings**: `settingsStore.ts` -> `src/lib/stores/settings.ts` (使用 `writable` + `localStorage` 同步)。
- [ ] **Reader**: `readerStore.ts` -> `src/lib/stores/reader.ts`。
- [ ] **Library**: `libraryStore.ts` -> `src/lib/stores/library.ts` (包含图书列表和筛选状态)。
- [ ] **Transfer**: `transferStore.ts` -> `src/lib/stores/transfer.ts`.

### 2.2 响应式逻辑

- [ ] 将 React Hooks (`useSync`, `useBookShortcuts`) 重构为 Svelte Actions 或自定义 Stores。

## 阶段 3: 服务层迁移 (Services Layer)

**目标**: 建立单例服务模式，处理平台差异。

### 3.1 AppService

- [ ] 移植 `AppService` 接口及 `Native/Web` 实现。
- [ ] 创建单例初始化逻辑 (`src/lib/services/index.ts`)，在应用启动时 (`+layout.ts` 或 `hooks.client.ts`) 注入。

### 3.2 模块化服务

- [ ] **TTSController**: 适配为 Svelte 风格的单例，使用 Store 暴露播放状态。
- [ ] **TransferManager**: 确保队列逻辑与新的 Svelte Store 绑定。
- [ ] **Translator**: 移植翻译服务和缓存层。

## 阶段 4: 组件迁移 (Components)

**目标**: 自底向上构建 UI 组件库。

### 4.1 基础组件 (Primitives)

- [ ] **UI Kit**: Button, Input, Modal, Dropdown, Slider, Toggle, Menu。
- [ ] **Icons**: 替换 `react-icons` 为 `lucide-svelte` 或保留 SVG 方案。

### 4.2 业务组件

- [ ] **Library**: `BookCover`, `BookList`, `FilterBar`, `ImportDialog`.
- [ ] **Reader**: `ReaderView`, `ControlPanel`, `TocPanel`, `NotePanel`.
- [ ] **Settings**: 各类设置面板。

### 4.3 布局组件

- [ ] `Sidebar`, `TitleBar` (Windows/Mac 适配), `MobileNav`.

## 阶段 5: 路由与集成 (Routing & Integration)

**目标**: 组装页面，完成应用。

### 5.1 页面路由

- [ ] **Root**: `src/routes/+layout.svelte` (包含全剧 Context, Toasts, Modals)。
- [ ] **Library**: `src/routes/+page.svelte`.
- [ ] **Reader**: `src/routes/reader/[id]/+page.svelte`.
- [ ] **Settings**: `src/routes/settings/+page.svelte`.
- [ ] **Auth**: `src/routes/auth/+page.svelte`.

### 5.2 数据加载

- [ ] 使用 `+page.ts` 的 `load` 函数预加载数据（如 `getStorageStats`）。

### 5.3 平台集成

- [ ] 验证 Tauri 事件监听 (`window.__TAURI__`)。
- [ ] 验证 PWA Service Worker。

## 验收清单

- [ ] 能够正确导入并解析 EPUB/PDF。
- [ ] 能够进行 TTS 朗读。
- [ ] 明暗主题切换正常。
- [ ] 能够同步数据到服务端。
- [ ] Tauri 打包运行无报错。
