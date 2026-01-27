# 阅读器组件分析 (Reader Components)

本文档分析 `src/app/reader/components` 目录下的 UI 组件，它们构成了阅读器的 "外壳"。

## 1. 核心导航栏 (`HeaderBar.tsx`)

`HeaderBar` 是阅读器顶部的工具栏，其呈现逻辑极其动态，需适配多种状态：

- **交互**: 鼠标悬停显示 (Desktop) / 点击显示 (Mobile)。
- **系统适配**:
  - Windows/Linux: 显示 `WindowButtons` (最小化/最大化/关闭)。
  - macOS: 处理 Traffic Light (红绿灯) 的避让逻辑 (`pl-20` vs `pl-4`)。
- **功能入口**:
  - 集成了一系列 "Toggler" 组件 (`SidebarToggler`, `SettingsToggler`, `NotebookToggler`)，这些组件实际上是开关 Svelte Store 或 Zustand Store 的状态。
  - **Quick Action**: 允许用户将 "高亮" 等常用操作固定在顶部栏。

## 2. 侧边栏架构 (`sidebar/SideBar.tsx`)

侧边栏是功能最密集的区域，包含目录 (TOC)、书签、全文搜索。

### 2.1 布局模式

侧边栏支持两种模式，由 `useSidebarStore` 控制：

- **Pinned (固定)**: 挤压阅读器内容区域，永久显示。
- **Floating (或者 Overlay)**: 覆盖在内容之上，有遮罩层。

### 2.2 手势交互 (`useDrag`)

实现了复杂的拖拽逻辑：

- **Desktop**: 拖拽右边缘调整宽度 (`MIN_WIDTH` ~ `MAX_WIDTH`)。
- **Mobile**: 底部抽屉模式 (Bottom Sheet)，支持下滑关闭 (`handleVerticalDragEnd`)。

### 2.3 内容切换

侧边栏内部是一个 Tab 容器 (`SidebarContent`):

- **TOC**: 章节跳转。
- **Bookmarks**: 书签列表。
- **Annotations**: 笔记列表。
- **Search**: 当触发搜索时，侧边栏内容会被 `SearchResults` 临时替换。

## 3. 笔记分屏 (`notebook/Notebook.tsx`)

(根据引用推断)
Readest 支持 "双屏模式"，右侧可以打开一个独立的 Markdown 编辑器 (`Notebook.tsx`)，支持边读边写。

## 4. Svelte 迁移指南

### 4.1 手势逻辑

目前的 `useDrag` Hook 和大量的 DOM 操作 (`document.querySelector`) 在 React 中稍显繁琐。
Svelte Action 是处理拖拽的绝佳场景：

```typescript
// actions/draggable.ts
export function draggable(node, params) {
    node.addEventListener('mousedown', handleStart);
    // ...
    return { destroy() { ... } }
}
```

在模板中使用：`<div use:draggable on:dragmove={handleResize}></div>`。

### 4.2 状态管理

目前的 `HeaderBar` 通过大量 Props 传递状态 (`isTopLeft`, `isHoveredAnim`)，并依赖 `useReaderStore` 等多个 Store。
建议重构为上下文模式：

- 在 `Reader.svelte` 顶层设置 `setContext('reader-ui', ...)`。
- 子组件通过 `getContext` 获取统一的 UI 状态流。
