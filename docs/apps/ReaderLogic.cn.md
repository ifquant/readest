# 阅读器核心逻辑分析 (Reader Logic)

本文档补充分析 `src/app/reader` 中不可见的**核心业务逻辑**，包括渲染引擎集成、多端同步算法和即时翻译系统。

## 1. 渲染引擎集成 (`FoliateViewer.tsx`)

`FoliateViewer` 是 Web Component (`<foliate-view>`) 的 React 包装器，它不仅是渲染容器，还是**内容转换器**。

### 1.1 动态内容注入 (Content Transformer)

当电子书内容加载时，代码通过 `book.transformTarget` 拦截并修改内容：

- **CSS 注入**: user stylesheet (字体、字号、行高) 在此处注入。
- **HTML 净化**: `sanitizer` 移除恶意脚本。
- **繁简转换**: `simplecc` 进行即时简繁转换。
- **标点挤压**: `punctuation` 优化中文排版。

### 1.2 脚本沙箱 (Script Sandboxing)

在 Tauri 环境下，`<iframe sandbox>` 默认禁止执行脚本。
为了支持交互式 Epub（如含 JS 的绘本），`FoliateViewer` 实现了 `evalInlineScripts`：
手动抓取 iframe 内的 `<script>` 标签内容，并通过 `iframe.contentWindow.eval()` 在受控环境下执行。

### 1.3 并行视图同步 (Parallel View)

支持双语对照阅读或多版本对照。

- **机制**: 监听 `onRendererRelocate` 事件。
- **同步**: 当主视图滚动时，通过 calculating Anchor Fraction (百分比位置) 驱动其他 `parallelView` 滚动到相同位置。

---

## 2. KOReader 同步协议 (`hooks/useKOSync.ts`)

Readest 兼容 KOReader 的同步服务器 (KOSync)，实现了复杂的冲突解决策略。

### 2.1 同步状态机

`idle` -> `checking` (Pull) -> `synced` / `conflict` -> `pushing`。

### 2.2 冲突解决 (Conflict Resolution)

当本地进度与云端进度时间戳不一致时，根据 `settings.kosync.strategy` 决定：

- **Send**: 强制覆盖云端。
- **Receive**: 强制使用云端。
- **Prompt**: 弹出 `KOSyncConflictResolver` 对话框，展示双方的章节名和百分比，让用户选择。

### 2.3 格式适配

- **流式 (Epub)**: 使用 XPointer (`/body/text()[1]`) 定位。
- **版式 (PDF)**: 直接使用页码 (`pageIndex`) 定位。

---

## 3. 即时翻译系统 (`hooks/useTextTranslation.ts`)

这是一个 **DOM 侵入式** 的翻译实现，支持“并在翻译” (Para-translation)。

### 3.1 懒加载翻译 (Lazy Translation)

为了性能，不会一次性翻译整本书。

- **观察器**: 使用 `IntersectionObserver` 监听可视区域内的文本节点 (`p`, `div`, `span`)。
- 当节点进入视口时，触发翻译 API。

### 3.2 DOM 注入

翻译结果不是悬浮层，而是直接插入 DOM：

```html
<p>
  Original Text
  <font class="translation-target">
    <br />
    <!-- 换行 -->
    Translated Text
  </font>
</p>
```

这种方式保证了翻译内容随原书排版流动，支持调整字号和样式。

---

## 4. Svelte 迁移指南

### 4.1 渲染器组件

Foliate 是 Custom Element，在 Svelte 中使用非常自然：

```svelte
<foliate-view
  bind:this={view}
  on:load={handleLoad}
  on:relocate={handleRelocate}
></foliate-view>
```

不再需要像 React 那样手动 `document.createElement` 和 `appendChild`。

### 4.2 Hooks -> Actions/Stores

- **useKOSync**: 这是一个纯逻辑 Hook。应重构为 `KOSyncManager` 类或 Store，与 UI 解耦。
- **useTextTranslation**: 这是一个典型的 DOM 操作 Hook。在 Svelte 中应实现为 Action:
  ```svelte
  <div use:translate={{ targetLang: 'zh-CN' }}>...</div>
  ```
  Action 能够自动处理生命周期 (mount/destroy)，非常适合 IntersectionObserver 的管理。

### 4.3 拖拽导入 (`useDragDropImport`)

Tauri 的 `onDragDropEvent` 是全局监听。
在 SvelteKit 中，建议在 `+layout.svelte` 中统一监听，并通过全局 Store (`importQueue`) 分发文件，而不是在每个页面重复监听。
