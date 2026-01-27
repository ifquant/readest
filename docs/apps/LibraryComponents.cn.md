# 书架组件分析 (Library Components)

本目录 (`src/app/library/components`) 包含了构建书架界面的所有 UI 组件。

## 1. 核心组件结构

### 1.1 书架网格 (`Bookshelf.tsx`)

- **职责**: 渲染书籍/分组的 Grid 或 List 视图。
- **数据源**: 接收 `libraryBooks`，进行本地过滤 (Search) 和排序 (Sort)。此逻辑目前直接写在组件内 (`useMemo`)。
- **交互**: 处理 "拖拽上传"、"多选模式"、"批量操作" (删除、分组)。

### 1.2 列表项 (`BookshelfItem.tsx` & `BookItem.tsx`)

这是一个层级结构：`Bookshelf` -> `BookshelfItem` -> `BookItem` / `GroupItem`。

- **BookshelfItem**: 逻辑包装器。
  - **输入**: 处理键盘 (Enter/Space) 和 触摸 (Long Press) 事件。
  - **Context Menu**: 构建 Native Context Menu (打开、详情、Show in Finder、删除)。
  - **分组算法**: `generateBookshelfItems` 函数负责将平铺的 `Book[]` 转换为包含 `BooksGroup` 的树状结构。
- **BookItem**: 纯 UI 组件，展示封面、标题、进度条。

### 1.3 顶部栏 (`LibraryHeader.tsx`)

- 包含全局搜索框 (Debounced Input)。
- 集成三大菜单：
  - `ImportMenu`: 导入文件/文件夹/OPDS。
  - `ViewMenu`: 切换 Grid/List，调整排序方式。
  - `SettingsMenu`: 打开设置弹窗。

## 2. 关键交互模式

### 2.1 选择模式 (Selection Mode)

- 当用户长按某书或点击 "选择" 按钮时，进入多选模式。
- `BookshelfItem` 会渲染 Checkbox 遮罩。
- 底部出现 `SelectModeActions.tsx` 工具栏 (删除、移动到分组、Mark as Read)。

### 2.2 虚拟文件系统 (Grouping)

- 书架支持 "文件夹" 概念 (`groupId`)。
- `Bookshelf` 根据 URL Query `?group=xxx` 过滤显示内容，模拟文件系统导航。

## 3. Svelte 迁移指南

### 3.1 状态逻辑提取

目前 `Bookshelf.tsx` 和 `BookshelfItem.tsx` 中混杂了大量业务逻辑（如分组算法、排序算法）。
建议迁移时：

- **Derived Stores**: 使用 Svelte 的 Derived Store (`$derived`) 来计算 过滤/排序/分组 后的列表，避免在 UI 组件中写复杂 `useMemo`。
  ```typescript
  // $lib/stores/shelf.svelte.ts
  export const filteredBooks = derived([library, searchQuery], ([lib, q]) => ...);
  export const groupedBooks = derived([filteredBooks, currentGroup], ...)
  ```

### 3.2 事件处理简化

`BookshelfItem` 中为了处理 Long Press 和 Context Menu 写了大量胶水代码。
Svelte Action (`use:longpress`, `use:contextmenu`) 可以优雅地封装这些交互逻辑，保持组件模板的一目了然。

### 3.3 组件拆分

`LibraryHeader` 组件过于庞大。建议拆分为：

- `SearchInput.svelte`
- `SortControls.svelte`
- `ImportControls.svelte`
  每个组件独立管理自己的 Dropdown 状态。
