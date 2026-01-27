# 书架页分析 (Library Page)

`src/app/library/page.tsx` 是应用的主入口和核心界面。它不仅仅是一个展示层，还承担了大量的控制器逻辑。

## 1. 核心职责

### 1.1 初始化流程 (`isInitiating`)

- **鉴权**: 检查 `token` 和 `keepLogin` 设置，若失效则跳转 `/auth`。
- **加载数据**: 并行加载 `Settings` 和 `LibraryBooks` (从 IndexedDB 或 FS)。
- **Open With**: 处理从外部应用（如文件管理器）打开文件的请求。会触发 `processOpenWithFiles` 逻辑，自动导入并打开阅读器。
- **Last Open**: 恢复上次阅读的书籍（如果开启了 `openLastBooks`）。

### 1.2 导入机制 (`importBooks`)

支持多种导入方式，且包含复杂的错误处理和进度反馈：

- **File Selection**: 调用 `useFileSelector` (Web `src="file"`, Native Dialog)。
- **Directory Import**: (仅 Native) 递归扫描文件夹，过滤支持的扩展名。
- **Drag & Drop**: 通过 `useDragDropImport` 钩子处理。
- **OPDS**: 通过 `CatalogManager` 组件下载。

导入后会自动：

1.  解析元数据。
2.  更新 IndexedDB/FS。
3.  (可选) 触发自动上传备份到云端。
4.  推送 Toast 通知。

### 1.3 状态管理

目前使用了 `useState` 混合 Zustand Store (`useLibraryStore`, `useTransferStore`)。

- `currentGroupPath`: 当前所在的分组/文件夹路径。
- `isSelectMode`: 多选模式状态 (全选/反选)。
- `syncProgress`: 同步进度条。

## 2. 界面结构

- **LibraryHeader**: 顶部栏，包含搜索、排序、布局切换、导入按钮。
- **Breadcrumbs**: 显示当前分组路径，支持点击导航。
- **Bookshelf**: 核心组件，根据 `currentGroupPath` 过滤并渲染书籍列表。
  - 提供了 Grid 和 List 两种视图。
  - 支持虚拟滚动 (`react-window` 或类似机制，虽然代码中引用了 `overlayscrollbars-react`)。
- **Modals**: 包含 `SettingsDialog`, `BookDetailModal`, `UpdaterWindow` 等全局弹窗。

## 3. Svelte 迁移指南

### 架构重构：拆分控制器

`page.tsx` 过于庞大（近 1000 行）。在 SvelteKit 中，应将逻辑拆分：

1.  **Data Loading (`+page.ts`)**:
    负责加载 `library` 和 `settings` 初始数据。

    ```typescript
    export const load = async ({ parent }) => {
      const { appService } = await parent();
      const library = await appService.loadLibraryBooks();
      return { library };
    };
    ```

2.  **Import Controller (`lib/controllers/import.ts`)**:
    将 `importBooks`, `processFile`, `errorMap` 等逻辑提取为纯 TS 模块或作为一个 Svelte Store (`createImportStore`)。

3.  **State Management**:
    使用 Svelte 5 的 Runes 或 Svelte Store 替代 `useState`。
    ```typescript
    // LibraryState.svelte.ts (Svelte 5 Runes)
    export class LibraryState {
      isSelectMode = $state(false);
      currentPath = $state<string | null>(null);

      toggleSelectMode() {
        this.isSelectMode = !this.isSelectMode;
      }
    }
    ```

### 组件拆分

- **`src/routes/library/+page.svelte`**: 只保留布局结构。
- **`src/lib/components/library/Header.svelte`**: 顶部栏。
- **`src/lib/components/library/Grid.svelte`**: 书架网格。
- **`src/lib/components/library/ImportHandler.svelte`**: 处理拖拽和文件选择逻辑（无 UI 组件）。

### 性能优化

React 中为了避免重渲染使用了大量 `useCallback` 和 `React.memo`。
Svelte 的细粒度响应式特性将自动解决大部分性能问题，无需显式优化。
对于大型书架列表，仍建议使用 `@sveltejs/svelte-virtual-list` 或类似库。
