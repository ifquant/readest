# 气泡脚注分析 (Popover Footnote)

Readest 支持在不跳转页面的情况下，以**气泡弹窗**的形式预览脚注内容。这大大改善了阅读体验，避免了查看注脚时频繁的页面上下文切换。

## 1. 触发机制

系统支持两种脚注识别与触发方式：**标准 EPUB 链接** 和 **非标/文本属性提取**。

### 1.1 标准链接 (`FootnoteHandler`)

- **来源**: 基于 `foliate-js` 的 `FootnoteHandler` 模块。
- **识别**: 监听视图的 `link` 事件 (`onLinkClick`)。如果链接指向的内容被识别为 Aside、Footnote 或 Endnote（通常通过 `epub:type="noteref"` 或特定的 href 模式识别）。
- **行为**: 阻止默认跳转 (`e.preventDefault()`)，并调用 `footnoteHandler.handle(bookDoc, e)` 获取脚注内容，准备在弹窗中渲染。

### 1.2 非标/文本属性提取 (`iframeEventHandlers.ts`)

部分中文电子书（如多看、掌阅格式）使用非标准的 HTML 结构或属性来存储脚注。

- **识别**: 在点击事件 (`handleClick`) 中，检查点击元素是否包含特定的类名：
  - `.js_readerFooterNote` (微信读书/通用)
  - `.zhangyue-footnote` (掌阅)
  - `.duokan-footnote` (多看)
- **提取**: 直接从 DOM 元素的属性中提取文本内容：
  - `data-wr-footernote`
  - `zy-footnote`
  - `alt`
- **派发**: 如果提取成功，通过 `eventDispatcher` 发送 `footnote-popup` 事件，绕过标准的链接处理流程。

## 2. 渲染流程 (`FootnotePopup.tsx`)

`FootnotePopup` 组件监听 `footnote-popup` 事件以及 `FootnoteHandler` 的回调，负责决定弹窗的位置和内容。

### 2.1 弹窗定位

- **计算锚点**: 使用 `getPosition` 和 `getPopupPosition` 工具函数。它需要获取点击元素在屏幕上的绝对坐标（`rect`），以及主阅读器的容器位置（`gridRect`）。
- **自适应大小**:
  - **横排模式**: 弹窗宽度受限于屏幕宽度，高度自适应。
  - **直排模式**: 弹窗高度受限于屏幕高度，宽度自适应。
  - 如果内容过多，弹窗内部会自动滚动。

### 2.2 内容渲染

- **富文本 (Standard)**: 对于标准 EPUB 脚注，`foliate-js` 会返回一个文档片段 (Fragment)。Readest 创建一个迷你的 `<foliate-view>` 实例放入弹窗中。这个迷你视图拥有独立的渲染器，应用了特定的样式（`getFootnoteStyles`），确保脚注内的样式（如斜体、图片）也能正确显示。
- **纯文本 (Proprietary)**: 对于通过属性提取的脚注，直接创建一个 `<p>` 标签显示纯文本内容。

## 3. 样式隔离

为了保证主文档样式不污染脚注弹窗，或者脚注弹窗拥有更适合阅读的字号/背景：

- 系统会为迷你视图注入主文档的**字体设置**（`mountCustomFont`）。
- 应用特定的 CSS 变量（背景色与主阅读器一致或略有区分）。
- 强制重置边距 (`margin: 0`) 和流式布局 (`flow: scrolled`)，因为注脚通常是短文本，不需要分页。
