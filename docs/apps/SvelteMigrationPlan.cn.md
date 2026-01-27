# Readest Svelte 迁移主计划 (Master Migration Plan)

基于对 `src/app` 及其子模块的深度分析，本文档制定了将 Readest 从 Next.js (React) 迁移至 SvelteKit 的完整技术路线图。

## 1. 架构映射 (Architecture Mapping)

### 1.1 路由层 (Routing)

从 Next.js App Router 迁移至 SvelteKit Filesystem Routing。

| Next.js Component          | SvelteKit Equivalent                     | 说明                                 |
| :------------------------- | :--------------------------------------- | :----------------------------------- |
| `src/app/layout.tsx`       | `src/routes/+layout.svelte`              | 全局外壳 (Providers, Theme, Context) |
| `src/app/page.tsx`         | `src/routes/+page.svelte`                | 首页 (重定向逻辑)                    |
| `src/app/library/page.tsx` | `src/routes/library/+page.svelte`        | 书架页 (需拆分为多个组件)            |
| `src/app/reader/page.tsx`  | `src/routes/reader/+page.svelte`         | 阅读器页 (核心重难点)                |
| `src/app/opds/page.tsx`    | `src/routes/opds/[...path]/+page.svelte` | OPDS (建议改为动态路由而非 SPA)      |
| `src/app/api/...`          | `src/routes/api/.../+server.ts`          | API Endpoints (BFF 层)               |

### 1.2 状态管理 (State Management)

从 Zustand/Context API 迁移至 Svelte Stores / Runes。

| React Pattern               | Svelte Pattern                     | 迁移策略                                              |
| :-------------------------- | :--------------------------------- | :---------------------------------------------------- |
| `useLibraryStore` (Zustand) | `library.svelte.ts` (Global State) | 使用 Svelte 5 `$state` 和 `$derived` 重写核心 Store。 |
| `Context.Provider`          | `setContext` / `getContext`        | 依赖注入 (UI Theme, I18n)。                           |
| `useState` (Local)          | `$state`                           | 组件局部状态直接替换。                                |
| `useEffect` (Side Effects)  | `$effect`                          | 副作用处理 (DOM 操作, 事件监听)。                     |

---

## 2. 迁移阶段规划 (Phased Execution)

为了最大程度降低风险，建议采用 **"绞杀者模式" (Strangler Fig Pattern)**，逐步替换，但在 Monorepo 环境下，更现实的是**模块化重写**。

### Phase 1: 基础设施 (Infrastructure) - [Week 1-2]

1.  **初始化 SvelteKit 项目**: 在 `apps/readest-svelte` 创建新工程。
2.  **移植底层服务 (`src/services`)**:
    - `AppService`, `StorageService`, `Database` 是纯 TS 代码，90% 可直接复用。
    - 适配 Tauri 2.0 API (如果尚未完成)。
3.  **移植基础 Store**: `SettingsStore`, `ThemeStore`。
4.  **配置构建工具**: 确保 Tailwind CSS, PostCSS, Vite 插件 (Alias) 配置对齐。

### Phase 2: 核心 UI 组件库 (Atomic Design) - [Week 3]

1.  **移植通用组件**: `Button`, `Dialog`, `Dropdown`, `Input`。
2.  **移植图标系统**: `react-icons` -> `unplugin-icons` 或 保持 SVG 引入。
3.  **样式迁移**: 搬运 `index.css` 和 Tailwind 配置。

### Phase 3: 功能模块 - 书架 (Library) - [Week 4-5]

1.  **实现 `Library/page.svelte`**:
    - 移植 `Bookshelf`, `BookshelfItem`。
    - 重构 **拖拽上传** 和 **多选模式** (使用 Svelte Actions `use:drag`, `use:drop`)。
2.  **实现模态窗口**: `MigrateData`, `TransferQueue`, `Grouping`.
3.  **数据层对接**: 确保 IndexedDB (Web) 和 FS (Tauri) 数据读取正常。

### Phase 4: 功能模块 - 阅读器 (Reader) - [Week 6-8] **(攻坚战)**

1.  **移植 `Reader` 核心**:
    - 集成 `foliate-js`。
    - 利用 Svelte 的 `<svelte:element>` 处理 Custom Elements (`<foliate-view>`)。
2.  **重构子模块**:
    - **Annotator**: 重写选区监听 (`useTextSelector` -> `$effect`)，重做 Popup 定位逻辑。
    - **Notebook & Sidebar**: 重写拖拽调整大小逻辑 (`useDrag` -> Action)。
    - **FooterBar & TTS**: 移植播放控制和 UI。
3.  **性能优化**: 利用 Svelte 细粒度更新优化页码刷新和阅读进度保存。

### Phase 5: 边缘模块与收尾 (Wrap up) - [Week 9]

1.  **OPDS 浏览器**: 移植 `src/app/opds`。
2.  **Auth & User**: 移植登录、支付流程。
3.  **API Routes**: 迁移 `src/app/api` 到 SvelteKit `+server.ts`。
4.  **E2E 测试**: 验证所有关键链路。

---

## 3. 风险与对策 (Risk Management)

### 3.1 风险：`foliate-js` 集成

- **问题**: `foliate-js` 深度依赖 DOM 操作，React 的 Virtual DOM 有时会干扰它，但 Svelte 这种更接近原生 DOM 的框架理论上会更友好。
- **对策**: 确保在 `onMount` 中初始化 Custom Elements，并使用 bind:this 获取真实 DOM 引用。

### 3.2 风险：Tauri 兼容性

- **问题**: SSR (Server-Side Rendering) 在 Tauri 环境下不可用（必须是 SSG/SPA）。
- **对策**: 配置 SvelteKit adapter 为 `@sveltekit/adapter-static`，启用 `fallback: 'index.html'` (SPA 模式)。

### 3.3 风险：状态同步

- **问题**: 迁移过程中，React 和 Svelte 代码可能共存于不同分支，逻辑可能分叉。
- **对策**: **核心业务逻辑 (Services/Libs) 必须保持框架无关**。禁止在 Service 层引入 React 特定 Hook 或 Svelte Store，只暴露纯 JS 接口或 Observable。

---

## 4. 关键重构点 (Key Refactoring Opportunities)

借此迁移机会，建议进行以下重构：

| 模块            | 当前痛点                                   | Svelte 改进方案                                                   |
| :-------------- | :----------------------------------------- | :---------------------------------------------------------------- |
| **Annotator**   | `Annotator.tsx` 过于庞大，逻辑与 UI 耦合。 | 拆分为 `SelectionManager` (纯逻辑) 和 `AnnotationLayer` (纯 UI)。 |
| **Search**      | 搜索逻辑分散在多个组件的 `useMemo` 中。    | 使用 Derived Store 集中管理过滤逻辑。                             |
| **Modal**       | Portal 处理繁琐。                          | 使用全局 Modal Store 简化调用。                                   |
| **Drag & Drop** | 在组件内部手动绑定大量事件。               | 封装为通用的 `use:draggable` Action。                             |
