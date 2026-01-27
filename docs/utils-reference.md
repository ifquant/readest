# 工具模块参考 (Utility Modules Reference)

本文档提供了 `apps/readest-app/src/utils` 中所有工具模块的详细分析，并附带了迁移至 Svelte 5 的指南。

---

## Group 1: a-c

### `a11y.ts`

**功能:** 无障碍功能辅助，特别是焦点管理。
**核心函数:**

- `preventAccess(target)`: 对所有兄弟元素设置 `aria-hidden="true"`，用于模态框打开时屏蔽背景内容。
  **Svelte 迁移指南:**
- **重构建议:** 当前实现直接操作 DOM。在 Svelte 中，应将其转换为 **Svelte Action** (`use:trapFocus` 或类似的) 或使用 `svelte:window` / 状态来管理 `aria-hidden`。
- **推荐库:** 考虑使用 `focus-trap` 或类似库，并将其封装为 Svelte Action。

### `access.ts`

**功能:** 管理用户访问权限、订阅计划、配额和 JWT 解码。
**核心函数:**

- `getSubscriptionPlan`: 解码 JWT 以获取用户计划 (Free/Pro/etc)。
- `getAccessToken`: 获取当前 Token (LocalStorage 或 Supabase Session)。
  **Svelte 迁移指南:**
- **SSR 安全:** 访问 `localStorage` 必须通过 `browser` 检查 (`import { browser } from '$app/environment'`) 或在 `onMount` 中进行。
- **状态管理:** 考虑将用户计划状态放入 Svelte Store (`userStore`)。

### `book.ts`

**功能:** 书籍元数据处理、文件名生成和格式化。
**核心函数:**

- `getRemoteBookFilename`: 根据存储类型 (S3/R2) 生成路径。
- `formatAuthors`: 格式化作者列表 (支持多语言)。
- `formatSize`: 文件大小格式化。
  **Svelte 迁移指南:**
- **逻辑:** 纯工具函数，直接迁移。

### `bridge.ts`

**功能:** Tauri `invoke` 命令的类型安全包装器。
**核心函数:**

- `invoke`: 泛型包装器，定义了所有 Native 与前端通信的接口 (FileSystem, SystemUI, etc)。
  **Svelte 迁移指南:**
- **直接迁移:** 这是与 Rust 后端通信的核心，直接保留。

### `cfi.ts`

**功能:** EPUB CFI (Canonical Fragment Identifier) 比较工具。
**核心函数:**

- `isCfiInLocation`: 检查 CFI 是否在指定位置范围内。
  **Svelte 迁移指南:**
- **逻辑:** 纯工具函数。

### `color.ts`

**功能:** 颜色处理与转换 (OKLCH, Hex)。
**核心函数:**

- `hexToOklch`: Hex 转 OKLCH 颜色空间。
- `getContrastColor`: 计算对比色。
  **Svelte 迁移指南:**
- **逻辑:** 纯工具函数。

### `config.ts`

**功能:** 阅读区域布局配置计算。
**核心函数:**

- `getMaxInlineSize`: 计算阅读器最大宽度。
  **Svelte 迁移指南:**
- **SSR 安全:** 涉及 `window.innerWidth`，需确保仅在客户端运行。

### `cors.ts`

**功能:** Next.js API 路由的 CORS 中间件。
**Svelte 迁移指南:**

- **移除:** 这是 Next.js 专用的。
- **SvelteKit 替代:** 在 `hooks.server.ts` 的 `handle` 函数中处理 API 路由的 CORS 头。

### `css.ts`

**功能:** CSS 字符串验证与格式化。
**核心函数:**

- `validateCSS`, `formatCSS`.
  **Svelte 迁移指南:**
- **逻辑:** 纯工具函数。

---

## Group 2: d-f

### `debounce.ts`

**功能:** 防抖工具函数。
**核心函数:**

- `debounce`, `debounceByText`.
  **Svelte 迁移指南:**
- **逻辑:** 纯工具函数。

### `deepl.ts`

**功能:** DeepL 翻译 API 客户端。
**核心函数:**

- `translate`: 发送 JSON-RPC 请求到 DeepL。
  **Svelte 迁移指南:**
- **逻辑:** 纯工具函数。

### `diff.ts`

**功能:** 文本/数组 Diff 算法实现。
**Svelte 迁移指南:**

- **逻辑:** 纯算法。

### `error.ts`

**功能:** 全局错误处理 (ChunkLoadError 重载逻辑)。
**Svelte 迁移指南:**

- **SvelteKit:** 迁移至 `hooks.client.ts` (`handleError`) 或根布局的 `<svelte:window on:error={...}/>`。

### `event.ts`

**功能:** 自定义事件总线 (Event Bus)。
**核心函数:**

- `EventDispatcher`:用于组件间通信。
  **Svelte 迁移指南:**
- **推荐重构:** Svelte 5 推荐使用 **Runes** (`$state`, `$derived`) 或 **Stores** 进行状态共享，而非基于事件的总线。对于跨组件通知，可以直接使用 Svelte 的响应式系统。

### `fetch.ts`

**功能:** Fetch API 包装器 (超时、Auth 头)。
**核心函数:**

- `fetchWithTimeout`, `fetchWithAuth`.
  **Svelte 迁移指南:**
- **SSR 安全:** `fetchWithAuth` 访问 LocalStorage，需注意。建议使用 SvelteKit 的 `fetch` (load 函数中)。

### `file.ts`

**功能:** **核心** 文件对象封装 (`NativeFile`, `RemoteFile`)。
**核心函数:**

- `NativeFile`: 封装 Tauri `plugin-fs` 读取本地文件。
- `RemoteFile`: 封装 HTTP Range Request 读取远程文件。
- `read`: 支持分块读取和 LRU 缓存。
  **Svelte 迁移指南:**
- **直接迁移:** 阅读引擎核心，逻辑复杂且不依赖 UI 框架，直接保留。

### `files.ts`

**功能:** 文件系统辅助 (复制文件)。
**核心函数:**

- `copyFiles`: 使用 `AppService` 复制文件。
  **Svelte 迁移指南:**
- **逻辑:** 依赖服务层，直接迁移。

### `font.ts`

**功能:** **复杂** 字体文件二进制解析 (TTF/OTF)。
**核心函数:**

- `getFontFamilyName`, `getFontWeight`: 解析二进制数据获取元数据。
  **Svelte 迁移指南:**
- **Web Worker:** 解析大字体文件可能阻塞主线程，建议在 SvelteKit 中将其移至 Web Worker (使用 Vite worker import)。

---

## Group 3: g-l

### `grid.ts`

**功能:** CSS Grid 模板生成辅助。
**核心函数:**

- `getGridTemplate`: 计算行/列模板。
  **Svelte 迁移指南:**
- **逻辑:** 纯工具函数。

### `highlightjs.ts`

**功能:** 代码块语法高亮管理。
**核心函数:**

- `manageSyntaxHighlighting`: **直接操作 DOM**。查询 `<pre>` 标签并应用高亮。
  **Svelte 迁移指南:**
- **重构为 Action:** 创建 `use:syntaxHighlight` Action，应用于阅读器容器。
- **避免全局查询:** Action 接收容器节点，仅查询容器内的代码块，避免 `document.querySelectorAll`。

### `iap.ts`

**功能:** 应用内购买 (IAP) 服务封装。
**Svelte 迁移指南:**

- **逻辑:** Tauri 包装器，直接迁移。

### `image.ts`

**功能:** 图片获取并转 Base64 (使用 Canvas)。
**核心函数:**

- `fetchImageAsBase64`: 依赖 `document.createElement('canvas')`。
  **Svelte 迁移指南:**
- **仅限客户端:** 必须在浏览器环境运行。

### `insets.ts`

**功能:** 计算阅读器安全区域 (Insets)。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `lang.ts`

**功能:** 语言检测与标准化。
**核心函数:**

- `detectLanguage`: 使用 `franc` 库。
- `isCJK`: 检测中日韩字符。
  **Svelte 迁移指南:**
- **逻辑:** 纯工具函数。

### `lru.ts`

**功能:** LRU 缓存实现。
**Svelte 迁移指南:**

- **逻辑:** 纯数据结构。

---

## Group 4: m-p

### `md5.ts`

**功能:** MD5 哈希工具。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `misc.ts`

**功能:** 杂项工具 (ID 生成, 文件名清理, 环境检测)。
**核心函数:**

- `getOSPlatform`, `makeSafeFilename`.
  **Svelte 迁移指南:**
- **SSR 安全:** 访问 `navigator` 需加 Guard。

### `nav.ts`

**功能:** 路由导航封装。
**当前:** 使用 `useRouter` (Next.js/React)。
**Svelte 迁移指南:**

- **完全重写:** 替换为 SvelteKit 的 `$app/navigation`。
  - `router.push('/url')` -> `goto('/url')`。

### `network.ts`

**功能:** LAN 地址检测。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `node.ts`

**功能:** DOM TreeWalker 过滤器 (拒绝 script/style 等)。
**Svelte 迁移指南:**

- **逻辑:** 纯 DOM 工具。

### `number.ts`

**功能:** 数字格式化 (中文数字)。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `object.ts`

**功能:** 对象存储 (S3/R2) 签名 URL 生成。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `open.ts`

**功能:** 拦截 `window.open` 以适配 Tauri。
**Svelte 迁移指南:**

- **初始化:** 在根布局 (`+layout.svelte`) 的 `onMount` 中调用。

### `os.ts`

**功能:** OS 特定文本 (如 "Reveal in Finder")。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `path.ts`

**功能:** 路径处理。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `permission.ts`

**功能:** Android 存储权限请求。
**Svelte 迁移指南:**

- **逻辑:** Tauri 包装器，直接迁移。

### `polyfill.ts`

**功能:** `Object.groupBy` Polyfill。
**Svelte 迁移指南:**

- **入口:** 在应用入口处引入。

### `progress.ts`

**功能:** 阅读进度格式化。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

---

## Group 5: q-s

### `queue.ts`

**功能:** 异步队列。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `r2.ts` / `s3.ts`

**功能:** R2 / S3 存储客户端。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `rtl.ts`

**功能:** RTL 文本方向检测。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `sanitize.ts`

**功能:** 字符串清洗。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `sel.ts`

**功能:** **复杂** 文本选择与定位逻辑。
**核心函数:**

- `getPosition`: 计算选区在其容器中的坐标 (处理 iframe 偏移)。
- `getTextFromRange`: 提取选区文本。
  **Svelte 迁移指南:**
- **DOM 依赖:** 强依赖 `Range` 和 DOM API。逻辑本身通用，但调用方需适配 Svelte 事件处理。

### `serializer.ts`

**功能:** 配置序列化。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `simplecc.ts`

**功能:** 简繁体转换 (Wasm)。
**Svelte 迁移指南:**

- **静态资源:** 确保 `.wasm` 文件在 `static` 目录中正确配置。

### `ssml.ts`

**功能:** TTS SSML 生成与解析。
**Svelte 迁移指南:**

- **逻辑:** 纯字符串处理。

### `storage.ts`

**功能:** 存储后端选择。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `style.ts`

**功能:** **核心** 样式生成与注入。
**核心函数:**

- `getStyles`: 生成用户样式表 CSS 字符串。
- `applyTableStyle`: **直接 DOM 操作**，修复表格布局。
  **Svelte 迁移指南:**
- **Action 化:** 将 `applyTableStyle` 等直接操作 DOM 的函数转换为 Svelte Action。
- **样式注入:** `getStyles` 的结果应通过 `<style>` 标签或 CSS 变量注入。

### `supabase.ts`

**功能:** Supabase 客户端创建。
**Svelte 迁移指南:**

- **Env:** 使用 `$app/environment` 和 `$env/static/public`。

### `svg.ts`

**功能:** SVG 转 PNG。
**Svelte 迁移指南:**

- **客户端专用:** 依赖 Canvas API。

---

## Group 6: t-z

### `telemetry.ts`

**功能:** PostHog 埋点。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `throttle.ts`

**功能:** 节流函数。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `time.ts`

**功能:** Day.js 配置。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `toc.ts`

**功能:** 目录 (TOC) 处理。
**核心函数:**

- `findTocItemBS`: 二分查找定位章节。
- `updateToc`: 计算页码与章节对应关系。
  **Svelte 迁移指南:**
- **逻辑:** 纯工具函数。

### `transfer.ts` / `transform.ts`

**功能:** 前后端数据模型转换 (DTO)。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `txt.ts`

**功能:** **复杂** TXT 转 EPUB (浏览器端)。
**核心函数:**

- `TxtToEpubConverter`: 编码检测、正则分章、Zip 打包。
  **Svelte 迁移指南:**
- **Web Worker:** 强烈建议移至 Web Worker 运行以避免卡顿。

### `ua.ts`

**功能:** User Agent 解析。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `usage.ts`

**功能:** 用量统计 (RPC)。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `validation.ts`

**功能:** 数据验证 (ISBN, 日期)。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `version.ts`

**功能:** 获取版本号。
**Svelte 迁移指南:**

- **Vite:** 建议使用 `import.meta.env.PACKAGE_VERSION` (需配置) 或保留导入。

### `walk.ts`

**功能:** 递归 DOM 遍历。
**Svelte 迁移指南:**

- **逻辑:** 纯 DOM 工具。

### `window.ts`

**功能:** Tauri 窗口管理。
**Svelte 迁移指南:**

- **逻辑:** 直接保留。

### `word.ts`

**功能:** 单词边界检测 (多语言)。
**Svelte 迁移指南:**

- **逻辑:** 纯工具函数。

### `xcfi.ts`

**功能:** **复杂** CFI 与 XPointer (KOReader) 互转。
**Svelte 迁移指南:**

- **逻辑:** 纯 DOM/算法逻辑，直接保留。
