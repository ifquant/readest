# 阅读器核心分析 (Reader Core)

`src/app/reader` 实现了基于 `foliate-js` 的电子书渲染核心。其架构采用了典型的 "控制器-容器-渲染器" 分层模式。

## 1. 架构分层

### 1.1 全局控制 (`Reader.tsx`)

- **System Integration**: 处理 Android 返回键 (`native-key-down`)、屏幕亮度、系统状态栏显隐。
- **Modal Layer**: 挂载全局弹窗 (`KOSyncSettings`, `ProofreadRules`)。
- **Suspense**: 负责代码分割加载。

### 1.2 多书容器 (`ReaderContent.tsx`)

支持同时打开多本书（分屏模式）。

- **Initialization**: 解析 URL 中的 `ids`，为每本书创建独立的 `ViewState`。
- **Close Sequence**: 负责协调 "保存进度 -> 关闭视图 -> 刷新 Library" 的退出流程。
- **Layout**: 渲染 "主要内容区" (`BooksGrid`) 及其周边的 `SideBar`, `Notebook`。

### 1.3 渲染适配器 (`FoliateViewer.tsx`)

这是最复杂的组件，负责将 Web Components (`<foliate-view>`) 桥接到 React。

- **View Creation**: 动态 import `foliate-js` 并挂载 Custom Element。
- **Style Bridge**: 计算视口 Insets，将 React 中的配置 (`ViewSettings`) 转换为 CSS 注入到 iframe 中。
  - 处理深色模式、字体、背景纹理。
  - 处理 CJK 竖排 (`vertical-rl`)。
- **Event Bridge**: 监听 iframe 内的 `click`/`touch`/`wheel` 事件并穿透到主线程。
- **Content Transformer**: 在渲染前拦截 HTML/CSS，注入自定义样式或各类处理器（如 `proofread`, `simplecc`）。

## 2. 关键实现细节

### 2.1 Iframe 隔离与穿透

Readest 使用 Shadow DOM + Iframe 隔离电子书内容。

- **样式注入**: 通过 `view.renderer.setStyles` 或直接操作 DOM 节点，将用户配置的样式应用到 iframe 内容。
- **脚本执行**: Tauri 环境下，iframe 默认禁止脚本。组件内实现了手动 `eval` 内联脚本的逻辑，以支持交互式电子书。

### 2.2 离屏渲染与销毁

当关闭书籍时，不仅要销毁 React 组件，还必须显式调用 `view.close()` 和 `view.remove()` 以清理内存中的 Blob URL 和 DOM 节点，防止内存泄漏。

## 3. Svelte 迁移指南

### Web Component 集成

Svelte 对 Web Components (Custom Elements) 有原生支持，比 React 更友好。
无需 `useRef` + `useEffect` 手动挂载，可以直接在模板中使用：

```svelte
<script>
    import 'foliate-js/view.js';
    let view;

    // Actions 实现事件监听
    function bindEvents(node) {
        node.addEventListener('load', handleLoad);
        return { destroy() { node.removeEventListener('load', handleLoad) } };
    }
</script>

<foliate-view
    bind:this={view}
    use:bindEvents
    class="w-full h-full"
></foliate-view>
```

### Store 架构优化

目前的 `useReaderStore` 混合了 ViewState (临时) 和 Settings (持久)。
建议拆分：

- `BookSession`: 一个 Svelte 类，管理单个书籍实例的生命周期（进度、缓存、View 引用）。
- `ReaderContext`: 管理当前打开的所有 Sessions。

### Iframe 事件处理

Svelte 的 Action (`use:action`) 非常适合处理这种跨 Iframe 的事件绑定。可以封装一个 `useIframeEvents` action，自动处理 add/remove event listener。
