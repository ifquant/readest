# 滚轮翻页功能分析 (Scroll Wheel Page Turning)

滚轮翻页是指在**分页模式 (Paginated Mode)** 下，用户可以使用鼠标滚轮来切换上一页或下一页，而不是滚动页面内容。

## 1. 核心流程

这一功能涉及跨 Context 通信：从渲染书籍的 `<iframe>` 到 React 主应用层。

```mermaid
graph TD
    Iframe[Iframe / ShadowDOM] --> |wheel Event| Handler[iframeEventHandlers.ts]
    Handler --> |postMessage: iframe-wheel| MainWindow[主窗口]
    MainWindow --> |Listening| usePagination[usePagination Hook]
    usePagination --> |Logic Check| Action{翻页 or 忽略?}
    Action -- 翻页 --> FoliateView[view.next() / prev()]
    Action -- 忽略 --> NativeScroll[原生滚动]
```

## 2. 事件捕获 (`iframeEventHandlers.ts`)

书籍内容渲染在独立的 Context 中（为了隔离样式和安全）。我们无法直接在 React 组件上监听 iframe 内部的滚动事件。

- **`handleWheel`**: 被绑定到 `doc` (书籍文档) 上。
- **转发**: 它捕获原生的 `WheelEvent`，提取关键信息（`deltaX`, `deltaY`），并通过 `window.postMessage` 发送类型为 `iframe-wheel` 的消息。

```typescript
// iframeEventHandlers.ts
export const handleWheel = (bookKey: string, event: WheelEvent) => {
  window.postMessage(
    {
      type: 'iframe-wheel',
      bookKey,
      deltaY: event.deltaY,
      // ...其他属性
    },
    '*',
  );
};
```

## 3. 逻辑处理 (`usePagination.ts`)

`usePagination` Hook 中的 `handlePageFlip` 函数负责消费这些消息。

### 3.1 触发条件

滚轮翻页仅在以下条件满足时触发：

1.  **分页模式**: `!viewSettings.scrolled`。如果当前是“滚动模式”，则由 iframe 自行处理原生滚动，React 层忽略此事件。
2.  **非固定布局**: 对于 PDF/漫画 (Fixed Layout)，通常会有自己的缩放/平移逻辑。代码中检查 `!bookData.isFixedLayout` 或缩放比例。

### 3.2 翻页动作

- **向下滚动 (`deltaY > 0`)**: 调用 `view.next(1)`，进入下一页。
- **向上滚动 (`deltaY < 0`)**: 调用 `view.prev(1)`，返回上一页。

## 4. 连续滚动 (`handleContinuousScroll`)

如果是**滚动模式 (`scrolled: true`)**，虽然上述逻辑会忽略事件，但代码中存在另一个函数 `handleContinuousScroll` 处理“跨章节连续滚动”。

- **检测边界**: 当用户滚动到当前章节的顶部（`start <= 0`）或底部（`end >= viewSize`）并继续滚动时。
- **自动加载**: 系统会自动跳转到上一章的末尾或下一章的开头，从而模拟出整本书连续滚动的体验。
