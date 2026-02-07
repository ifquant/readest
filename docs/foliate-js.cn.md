# Foliate-js 集成指南

`foliate-js` 是 Readest 用于显示电子书的核心渲染引擎。它是一个基于标准 Web API 和 Custom Elements 构建的现代化、跨框架库。本项目使用的是位于 `packages/foliate-js` 的本地工作区版本 `foliate-js`。

## 概览

Foliate-js 负责处理不同电子书格式（EPUB, PDF, MOBI 等）的解析繁重工作，并在浏览器中进行渲染。它主要包含三个层级：

1.  **加载器 (Loaders)**: 负责解析特定文件格式并将其转换为统一的 "Book" 接口的模块。
2.  **渲染器 (Renderers)**: 负责显示内容的 Custom Elements（分为分页布局或固定布局）。
3.  **视图 (View)**: 高阶的 `<foliate-view>` custom element，用于管理书籍对象、渲染器、历史记录以及用户交互。

## 架构与核心组件

### 1. Book 接口 (`src/libs/document.ts`)

在 Readest 中，`src/libs/document.ts` 充当原始文件与 `foliate-js` 之间的桥梁。它导出了 `DocumentLoader` 和各种辅助函数。

当打开一个文件时，`foliate-js` (通过 `makeBook` 或特定格式的加载器) 返回一个 **Book** 对象。关键属性包括：

*   `sections`: 章节数组 (Sections)。
*   `toc`: 目录树 (Table of Contents)。
*   `metadata`: 书籍元数据（标题、作者等）。
*   `rendition`: 布局信息（例如 `pre-paginated` (预分页) vs `reflowable` (流式)）。
*   `resolveHref(href)`: 将链接解析为章节索引和详细位置。

### 2. 视图 (`FoliateView` / `<foliate-view>`)

`<foliate-view>` (对应 `packages/foliate-js/view.js` 中的 `View` 类) 是我们要交互的主要组件。Readest 将其封装在 React 组件 `FoliateViewer.tsx` 中。

关键能力：
*   **导航**: `goTo`, `next`, `prev`。
*   **状态**: `history` (历史), `lastLocation` (最后位置)。
*   **功能**: 文本搜索, TTS 集成, 批注。

## Readest 中的集成

### React 包装器 (`FoliateViewer.tsx`)
`FoliateViewer` 组件将命令式的 Custom Element API 封装为声明式的 React 组件。

*   **初始化**: 它使用 `document.createElement('foliate-view')` 手动创建 `<foliate-view>` 元素，并将其挂载到 container ref 上。
*   **事件监听**: 它使用 `useFoliateEvents` hook 来监听 `load` 和 `relocate` 自定义事件。
*   **样式**: 样式通过 `view.renderer.setStyles` 注入，CSS 属性（如 `gap`, `max-inline-size`）通过 `setAttribute` 设置。

### 类型定义 (`src/types/view.ts`)
我们在 `src/types/view.ts` 中定义了视图的 TypeScript 接口，以便在与 custom element 交互时提供类型安全。

## API 参考

### `<foliate-view>` 方法

| 方法 | 描述 |
| :--- | :--- |
| `open(book: Book)` | 加载书籍对象。 |
| `goTo(target)` | 导航到目标位置。目标可以是：<br>- `number` (章节索引)<br>- `string` (Href 或 CFI)<br>- `{ index, anchor }` 对象 |
| `goToFraction(fraction)` | 导航到全书的百分比位置 (0-1)。 |
| `next()` / `prev()` | 翻页。 |
| `addAnnotation(note)` | 添加高亮或笔记。返回 `{ index, label }`。 |
| `initTTS()` | 为当前文档初始化 TTS 引擎。 |
| `search(options)` | 执行搜索（通常通过 async generator 返回结果）。 |

### `<foliate-view>` 事件

这些是 **Custom Events**。在 React 中，你必须使用 ref 和 `addEventListener` (或我们的辅助 hook) 来监听它们。

| 事件 | Detail 属性 | 描述 |
| :--- | :--- | :--- |
| `load` | `{ doc, index }` | 当一个章节加载到 iframe 中时触发。`doc` 是 iframe 的 `Document` 对象。 |
| `relocate` | `{ reason, range, index, fraction, cfi }` | 当阅读位置改变时触发。用于追踪阅读进度。 |

## 常见任务

### 1. 样式化阅读器

样式通过两种方式应用：

1.  **视图属性 (View Attributes)**: 分页器接受用于配置布局的属性。
    ```javascript
    view.renderer.setAttribute('gap', '5%');
    view.renderer.setAttribute('max-inline-size', '800px');
    view.renderer.setAttribute('animated', ''); // 启用滑动动画
    ```

2.  **CSS 注入**: 自定义 CSS（字体、颜色、行高数值）被注入到 Shadow DOM 或 iframe 中。
    ```javascript
    view.renderer.setStyles?.('body { color: red; }');
    ```

### 2. 处理批注 (Annotations)

Foliate-js 使用 `Overlayer` 在文本上层渲染 SVG 高亮。

```javascript
// 添加批注
const { index, label } = await view.addAnnotation({
    value: "epubcfi(...)", // 要高亮的 CFI 范围
    color: "yellow",       // 颜色由 overlayer 实现或 CSS 处理
    style: "highlight"     // 'highlight' | 'underline' | etc
});

// 删除批注
view.deleteAnnotation({ value: "epubcfi(...)" });
```

### 3. 文本转语音 (TTS)

TTS 是在 *当前* 章节的文档上初始化的。

```javascript
// 初始化
await view.initTTS('sentence'); // 粒度: 'word' | 'sentence'

// view.tts 对象现在可用，可生成 SSML
const ssml = view.tts.next(); 
```

## 调试

由于 `foliate-js` 使用了 Shadow DOM 和 Iframe：
1.  **审查元素**: 你会看到 `<foliate-view>` -> `#shadow-root` -> `<foliate-paginator>` -> `#shadow-root` -> `<iframe>`。
2.  **控制台**: 你可以通过 React 组件的 ref 获取 view 实例，或者在开发者工具中选中 DOM 元素 (`$0`)。例如 `$0.goTo(1)`。

## 维护记录

### PDF 体验与核心升级 (2025-2026)
- **最新版本**: 升级 PDF.js 至 v5.4 (`f443513d`)，保持核心渲染库的先进性。
- **预渲染优化**: 支持 PDF 下一页预渲染 (`29fd7aad`)，显著提升翻页流畅度。
- **手势交互**: 在 PDF 模式下支持手型工具拖拽平移 (`133ae252`, `2941fcc3`)，优化触控和鼠标操作体验。
- **视图缩放**: 修复了 PDF 在缩放模式下的居中对齐问题 (`3b9d318f`, `983589f0`)，并添加了 `scale-factor` 和 `spread` 属性支持 (`9c2b1faf`)。
- **无障碍性**: 将 PDF iframe 的 Shadow DOM 模式改为 `open` (`aa04e012`)，提升对辅助技术的支持。

### 墨水屏 (E-ink) 与设备适配 (2025-2026)
- **墨水屏模式**: 针对墨水屏设备禁用了页面滑动动画 (`47be9d81`) 和页面滑动手势 (`d0eeb793`)，以减少残影和提升刷新响应。
- **折叠屏适配**: 优化了折叠屏设备（略高于宽度的屏幕）的横屏布局检测逻辑 (`2823999e`)。
- **Safari 兼容**: 修复了 Safari/WebKit 下 `getClientRects` 不随 CSS zoom 缩放的问题 (`fcfdd20c`)，以及 Regex Lookbehind 断言导致的崩溃问题 (`11cfc194`, `f087826b`)。

### 批注与交互增强 (2025-2026)
- **气泡式批注**: 新增垂直气泡批注 (`bab0bccb`) 和侧边栏抽屉 (`873b5459`)，提供更现代的笔记交互。
- **即时批注**: 支持在创建批注时锁定滚动 (`ffb82484`)，防止误触。
- **手写笔支持**: 修复了手写笔 (Stylus) 选择文本时不灵敏的问题 (`d66f1263`)。
- **高亮优化**: 优化了跨段落高亮的分割逻辑，并支持了标题标签 (`h1`-`h4`) 的高亮 (`920676bd`)。

### 排版与渲染引擎 (2025)
- **全出血布局**: 修复了容器尺寸计算，使其能正确支持全出血 (Full-bleed) 图片布局 (`22554ea3`)。
- **精确控制**: 引入了 `--available-width/height` CSS 变量 (`18fb2e7a`, `260ae08e`) 和像素级页边距控制 (`e2a9054d`)，解决了部分自适应布局错乱问题。
- **脚注支持**: 增加了对定义列表 (`<dl>`) (`25b4bc51`) 和纯锚点 (`0e0096d1`) 形式脚注的解析支持。

### TTS (文本转语音) 增强 (2025)
- **标记导航**: TTS 引擎新增 `prevMark` 和 `nextMark` 方法 (`26b6df4f`)，支持在朗读时前后跳转语句。
- **断句优化**: 改进了分词器，避免在缩写词后错误断句 (`f087826b`)。

### 封面与元数据处理 (2025)
- **封面解析优化**: 调整了封面图片的解析优先级，优先从 `manifest` 中查找明确标记为封面的图片，其次是 `guide`，最后才是 `meta` 标签，并支持解析 CBZ 的 zip 注释元数据 (`d5c581c3`)。
- **发布者去重**: 修复了在解析 `dc:creator` 和 `dc:contributor` 时，如果已存在发布者信息，不再重复映射的问题 (`8dd3c9b3`)。

### 视觉与背景增强 (2025)
- **暗色模式纹理**: 允许在暗色模式下显示背景纹理（只要未明确设置 `bg-texture-id`），增强了阅读器的视觉自定义能力 (`508eb889`)。
- **背景色覆盖**: 支持通过 `--override-color` 变量强制覆盖背景色 (`a3a12715`)。

### 交互微调 (2025)
- **气泡批注**: 新增垂直气泡批注 (`bab0bccb`) 和侧边栏抽屉 (`873b5459`)，提供更现代的笔记交互。
- **即时批注**: 支持在创建批注时锁定滚动 (`ffb82484`)，防止误触。
- **翻页吸附**: 调整了分页视图下的吸附 (Snap) 容差阈值 (`4f05eeb6`) 和灵敏度 (`e37106dc`)，使触摸滑动翻页更加自然。
- **搜索优化**: 实现了搜索结果缓存机制 (`4eb5ca4`)，并在缩放模式下也能正确滚动到居中位置 (`3b9d318`)。

### 稳定性修复 (2025)
- **NCX 解析**: 修复了 NCX 文件中 HTML 实体导致的 XML 解析错误 (`43f3081`)。
- **Comic 布局**: 修复了某些漫画书籍的布局渲染问题 (`75725c2`)。
- **列数计算**: 修复了非整数高度可能导致列数计算错误的问题 (`d15091c`)。
- **滚动可视范围**: 修复了滚动模式下的可视范围计算 (`c80ead5`)。
- **最大宽度**: 确保 `max-inline-size` 设置得到正确遵循 (`0e0096d`)。

### OPDS 与通用稳定性 (2025)
- **OPDS 搜索**: 修复了 OPDS 搜索链接的选择逻辑 (`869d156`)，并优先使用 ATOM 格式 (`f2d10c16`)。
- **Safari 兼容**: 额外修复了旧版 Safari 浏览器中因解构赋值导致的运行时错误 (`f03d592a`)。

### MOBI 与 KF8 格式增强 (2025)
- **性能优化**: 针对大型 MOBI 书籍，优化了文本分段 (Text Sectioning) 的处理速度，显著提升加载性能 (`55c0027d`)。
- **多字节字符修复**: 修复了中日韩 (CJK) 等多字节字符在 KF8/MOBI 片段选择器中的偏移量计算错误，解决了无法正确跳转或定位的问题 (`f1d4a429`, `b1f72c03`)。
- **内容转换**: 为 KF8 文件添加了 `transformTarget` 支持，允许在渲染前对内容进行转换处理 (`f2d32152`)。
- **空片段处理**: 修复了 MOBI 解析中对空片段的处理逻辑，增强了鲁棒性 (`6b11e174`)。

### 架构与开发者 API 改进 (2025)
- **资源加载控制**: 新增 `load` 自定义事件，允许开发者拦截并控制 manifest item 的加载，例如实现特定资源的过滤或替换 (`bdae4730`)。
- **查询缓存**: 为 manifest 建立了基于 ID 的查找缓存 map，优化了频繁查找 ID 时的性能 (`d7affcf9`)。
- **TTS 高亮扩展**: `initTTS` 方法新增可选的 `highlight` 回调参数，允许外部自定义朗读时的高亮逻辑 (`0d4a92ae`)。
- **后台动画优化**: 修复了页面不可见（后台运行）时 `requestAnimationFrame` 导致的动画阻塞问题，确保后台切回时的状态正确 (`9fd2209b`)。
- **文本遍历**: `textWalker` 支持传入可选的 `filter` 函数，提高了文本节点的筛选灵活性 (`4ee127d8`)。

### 浏览器兼容性与细节修复 (2024-10 综合补丁)
- **提交者**: chrox.huang@gmail.com
- **Commit**: `f087826b`
- **详情**: 该补丁包含了大量针对旧版浏览器（特别是 WebKit 613-615）的兼容性修复与细节调整，包括：
    1.  **Polyfill 支持**: 引入 `construct-style-sheets-polyfill` 以支持不支持 `CSSStyleSheet` 构造函数的旧版 WebKit。
    2.  **正则兼容**: 移除了旧版 WebKit 不支持的正则 Lookbehind 断言。
    3.  **PDF.js 构建**: 切换为使用非打包的 legacy build PDF.js，解决了 Web Worker 加载路径问题。
    4.  **iOS 滚动修复**: 修复了 iOS 浏览器上选择文本时意外触发页面滚动的问题。
    5.  **Zip 图片回退**: 当 manifest 中找不到图片时，尝试直接从 zip entries 中查找，增强了对不规范 EPUB 的容错性。
    6.  **OPF 兼容**: 修复了 OPF 项目名称和背景样式的一些特殊兼容性问题。

### PDF 懒加载优化 (2024-10)
- **提交者**: chrox.huang@gmail.com
- **问题**: 原版实现直接使用 `await file.arrayBuffer()` 将整个 PDF 文件加载到内存中。对于数百 MB 的扫描版 PDF，这会导致极其严重的内存压力，甚至导致应用崩溃 (OOM)。
- **修复**: 使用 `pdfjsLib.PDFDataRangeTransport` 接口实现了按需加载。通过 `file.slice(begin, end)` 仅读取 PDF.js 请求的字节范围，极大降低了内存占用并提高了首屏打开速度。
- **Commit**: `f24e611c`
