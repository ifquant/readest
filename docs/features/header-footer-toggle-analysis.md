# 页眉页脚开关功能分析 (Header/Footer Toggle)

该功能允许用户自定义阅读界面，通过隐藏页眉和页脚来获得沉浸式的阅读体验。此配置是**每本书独立**的 (`ViewSettings`)，但也支持全局默认设置。

## 1. 配置管理 (`LayoutPanel.tsx`)

用户在“布局设置”面板中控制以下状态：

- **Show Header**: 控制顶部信息栏（章节标题、关闭按钮等）。
- **Show Footer**: 控制底部信息栏（阅读进度、剩余时间等）。
- **Show Bars on Scroll**: 仅在“滚动模式”下生效，决定由于滚动而自动隐藏的页眉页脚是否应该显示。
- **Tap to Toggle Footer**: 允许点击屏幕切换页脚显隐。

当用户切换开关时：

1.  **状态更新**: React 状态 `showHeader`/`showFooter` 更新。
2.  **自动边距调整**:
    - 如果开启 Header/Footer，系统会自动检查页边距 (`marginTopPx` / `marginBottomPx`)。如果当前边距小于 Header/Footer 所需的最小高度（通常为 44px 左右），会自动增加边距，防止内容被遮挡。
    - `setMarginTopPx` 和 `setMarginBottomPx` 会被触发更新。
3.  **持久化**: 通过 `saveViewSettings` 将配置写入数据库。

## 2. 渲染逻辑 (`BooksGrid.tsx`)

`BooksGrid` 是阅读器的主容器，它根据 `viewSettings` 决定渲染哪些子组件。

### 2.1 条件渲染

```typescript
const showHeader = viewSettings.showHeader && (scrolled ? showBarsOnScroll : true);
const showFooter = viewSettings.showFooter && (scrolled ? showBarsOnScroll : true);

// 渲染页眉
{showHeader && (
  <SectionInfo ... />
)}

// 渲染页脚
{showFooter && (
  <ProgressInfoView ... /> // 进度条、页码
)}
{showFooter && (
  <FooterBar ... /> // 移动端底部栏
)}
```

### 2.2 布局计算 (Insets)

Header 和 Footer 的存在会直接影响书籍内容的渲染区域（Viewport）。

- **Compact vs Full Margin**: 在 `src/utils/insets.ts` 中，如果 Header/Footer 隐藏，系统会切换使用一套更小的边距配置 (`compactMarginPx`)，从而最大化利用屏幕空间。
- **动态 CSS**: `BooksGrid` 会计算 `contentInsets`，并将其传递给 `<FoliateViewer>`，确保 `<iframe>` 的 padding 正确，避免文字渲染在不可见区域。

## 3. 滚动模式特殊处理

在**滚动模式 (Scrolled Mode)** 下，交互逻辑略有不同：

- 默认情况下，Header/Footer 可能会随着滚动自动隐藏（类似浏览器的 URL 栏）。
- **Show Bars on Scroll**: 如果此选项开启，Header/Footer 将强制固定显示，或者遵循更复杂的显隐逻辑（依赖于 `usePagination` 中的滚动监听）。
- **Tap Interaction**: 用户可以通过点击屏幕中央区域唤起或隐藏这些栏 (`setHoveredBookKey`)。

## 4. UI 组件

- **`HeaderBar`**: 包含返回按钮、书名、多窗口关闭按钮。
- **`SectionInfo`**: 显示当前章节标题（通常位于右上角或左上角，取决于排版方向）。
- **`ProgressInfoView`**: 包含进度条滑块、当前页码/总页码、剩余阅读时间估算。
- **`FooterBar`**: 移动端专用的底部操作栏（目录、设置、进度跳转等）。
