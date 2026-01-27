# Svelte 5 全项目代码改进与避坑指南 (完整版)

本文档基于对 `apps/readest-app` 全量源码的审计，针对 **全局基础架构 (Infrastructure)** 和 **隐藏性能瓶颈** 提供深度改进方案。

## 1. 架构级反模式 (Architectural Anti-Patterns)

### 1.1 全局事件总线 (Global Event Bus)

**位置**: `src/utils/event.ts`
**现状**:

- 使用单例 `EventDispatcher` 类作为全应用的通信中枢。
- **问题**: - **隐式依赖**: 组件 A 触发事件，组件 B、C、D 响应，缺乏明确的引用关系，导致调试噩梦。- **逻辑黑盒**: `dispatchSync` 实现了一套非标准的冒泡机制，容易在重构中破坏。
  **Svelte 5 改进**:
- **状态类事件 (Toast)**: 使用 `ToastService` Store。任何组件调用 `toastService.show()`，UI 层自动响应。
- **交互类事件 (Iframe Click)**:
  - 使用标准的 `CustomEvent`。
  - 在 Action 中 `node.dispatchEvent(new CustomEvent('iframe-click'))`。
  - 父组件使用标准的 `on:iframe-click` 监听。

### 1.2 敏感信息前端泄露 (Secret Leakage)

**位置**: `src/utils/r2.ts`, `src/utils/s3.ts`
**现状**:

- `process.env['R2_SECRET_ACCESS_KEY']` 被直接编译进前端 bundle。
- **问题**: 任何人只需检查 Source Map 或 Network 请求即可获得完整的 AWS/Cloudflare 读写权限。
  **Svelte 5 改进**:
- **Strict Separation**: 所有的 Secret 只能出现在 `src/routes/+page.server.ts` 或 `src/lib/server/` 目录下。
- **Runtime Check**: SvelteKit 会自动阻止以 `$env/static/private` 导入的变量在客户端代码中使用。

### 1.3 TTS 生命周期耦合 (Lifecycle Coupling)

**位置**: `src/app/reader/components/tts/TTSControl.tsx`
**现状**:

- 音频播放控制 (`TTSController`) 和后台保活逻辑与 React 组件生命周期强绑定。
- **问题**: 用户一旦导航离开阅读器页面，组件卸载，音频立即停止/销毁，无法实现"后台播放"或"跨页面播放"。
  **改进**:
- **Service Pattern**: `TTSService` 必须独立于 UI 存在（单例模式）。
- **Global Store**: UI 组件仅作为 `TTSService` 状态的订阅者 (`$tts.isPlaying`)，不持有核心逻辑。

### 1.4 Context Hell 与启动闪烁 (Startup Check)

**位置**: `src/components/Providers.tsx`
**现状**:

- 使用 `useEffect` 异步加载设置，导致应用启动时先渲染默认态，然后"闪烁"成用户设置态。
- 巨大的 Provider 嵌套树 (`CSPostHogProvider` -> `AuthProvider` -> `IconContext` -> `SyncProvider`)。
  **改进**:
- **Layout Loading**: 利用 SvelteKit 的 `load` 函数在渲染前加载关键设置。
- **Flat Stores**: 使用 Svelte Store 替代 Context API，消除 Provider 嵌套金字塔。

### 1.5 隐式组件通信 (Component-Driven Events)

**位置**: `src/components/UpdaterWindow.tsx`
**现状**:

- 通过 `document.getElementById('updater_window').dispatchEvent()` 来控制弹窗显示。
- **问题**: 这实际上是在 React 中重新发明了 jQuery。
  **改进**:
- **Store Driven**: `updater.showUpdateDialog()` 修改 Store 状态。
- **Reactive**: `<UpdateDialog bind:open={$updater.showDialog} />`。

### 1.6 状态耦合与衍生状态滥用 (State Coupling)

**位置**: `src/store/readerStore.ts` (Lines 284-343)
**现状**:

- `setProgress` 函数在更新自身状态的同时，还手动去调用 `libraryStore` 和 `bookDataStore` 的 setter。
- **风险**: 这导致 Store 之间紧密耦合。如果一个 Store 发生重构，另一个会悄无声息地崩溃。这也违反了 Flux/Zustand 的"单向数据流"原则，人为创造了"衍生状态维护"的复杂性。
  **改进**:
- **Single Source of Truth**: 统一使用数据库 (`IndexedDB`) 作为可信源。UI 仅订阅数据库变化 (`LiveQuery`)，不再维护冗余的中间状态。

### 1.7 "上帝插件" (God Plugin) 单体设计

**位置**: `src/utils/bridge.ts`
**现状**:

- 一个文件 `bridge.ts` 封装了 20 多个不相关的 Native 方法（文件、剪贴板、屏幕、UI），全部调用同一个 `native-bridge` 插件。
- **风险**: 前端与底层实现强耦合。如果底层拆分插件，前端需要重构所有调用点。此外，类型定义维护困难。
  **改进**:
- **Modularity**: 按领域拆分为 `DisplayService`, `FileSystemService`, `SystemEventService`。

### 1.8 服务的重复实例化 (Repeated Instantiation)

**位置**: `src/libs/payment/iap/client.ts`
**现状**:

- 几乎每个导出的函数内部都执行 `const iapService = new IAPService()`。
- **风险**: 如果 `IAPService` 的构造函数包含昂贵的初始化逻辑（如建立 Native 连接），这将严重拖慢 UI 响应，甚至导致连接泄漏。
  **改进**:
- **Singleton**: 使用单例模式 `getInstance()` 或在模块顶层实例化一次。

### 1.9 手动的时间戳管理 (Manual Timestamp Management)

**位置**: `src/hooks/useSync.ts`
**现状**:

- 依赖三个独立的状态变量 (`lastSyncedAtBooks`, `lastSyncedAtConfigs`) 来追踪同步进度。
- **风险**: - 状态容易不同步，导致已修改的数据被漏掉或重复上传。- 依赖客户端时间，如果用户修改了系统时间，同步逻辑会彻底失效。
  **改进**:
- **Atomic Transaction**: 同步服务应采用事务性设计。
- **Server-Time Authority**: 总是使用服务端返回的时间戳或 Logic Clock (Vector Clock) 作为基准。

### 1.10 "浏览器内的浏览器" (Browser-in-a-Page)

**位置**: `src/app/opds/page.tsx`
**现状**:

- 一个 600 行的组件在 React Router 内部手动实现了一套 History Stack 和 View Router (`ViewMode`).
- **问题**: - **破坏原生导航**: 浏览器的后退按钮无法回退 OPDS 的导航层级。- **深度链接失效**: 无法直接分享或保存某个深层目录的链接。
  **改进**:
- **URL Checkpointing**: 将当前 OPDS 目录的 URL 直接作为 Query Param (`?src=...`) 放入真实路由，让 SvelteKit 的路由器处理导航。

### 1.11 灾难性的内存文件系统 (Naive In-Memory File System)

**位置**: `src/services/webAppService.ts`
**现状**:

- `readDir` 直接调用 `store.getAll()`。
- **问题**: 这意味着每次列出目录时，都会将**整个 IndexedDB 数据库**（包含所有书籍的二进制内容）加载到内存中。这是**绝对不可接受**的性能灾难，随着书库增长，一定会导致浏览器崩溃。
  **改进**:
- **OPFS**: 迁移至 `Origin Private File System` API。
- **IDB Cursor**: 如果必须用 IndexedDB，改用 `IDBKeyRange` 或 Cursor 仅遍历 Keys，绝不加载 `value`。

### 1.12 命令式的交互逻辑 (Imperative Interaction Logic)

**位置**: `src/hooks/usePullToRefresh.ts`
**现状**:

- 手动 `createElement`, `innerHTML`, `dom.style.transform`。
- **风格**: 这是 jQuery 时代的写法，与 React/Svelte 的声明式理念背道而驰。
  **改进**:
- **Declarative Motion**: 使用 Svelte Motion 或 Spring 动画。 `<div style:transform="...">`。

### 1.13 副作用满满的 Store (Impure Store)

**位置**: `src/store/themeStore.ts`
**现状**:

- `setThemeMode` 不仅更新状态，还直接 `document.documentElement.setAttribute`，写入 `localStorage`。
- **问题**: 这使得 Store 难以测试，且在服务端渲染 (SSR) 时需要大量 `typeof window !== 'undefined'` 自保代码。
  **改进**:
- **Reactive Head**: 使用 SvelteKit 的 `<svelte:head>` 或 `<svelte:body>` 响应式绑定属性。
- **Effect**: 仅在 `$effect` 中处理 localStorage 同步。

### 1.14 "书库页面" 上帝组件 (The Library "God Component")

**位置**: `src/app/library/page.tsx`
**现状**:

- 这个 900 行的组件同时管理 UI 渲染、文件拖拽、数据同步、快捷键响应、窗口状态、和登录校验。
- **危害**: - **极难维护**: 牵一发而动全身。- **渲染性能差**: 任何一个微小的状态变化（如同步进度），都可能导致整个庞大的组件树重新渲染。
  **改进**:
- **ViewModel Pattern**: 将所有业务逻辑抽离到 `LibraryState.svelte.ts`。
- **Use Components**: 将 SearchBar、Grid、Header 拆分为独立的、只关注 Prop 的纯 UI 组件。

### 1.15 手动实现的模态框与手势 (Manual Dialog & Gestures)

**位置**: `src/components/Dialog.tsx`
**现状**:

- 使用 `style.transform` 直接操作 DOM 实现下拉关闭手势。
- 手动维护 Focus Trap 和 Back Button 拦截。
  **改进**:
- **HTML Dialog**: 使用原生 `<dialog>` 元素。
- **Declarative Motion**: 使用 Svelte Motion 或 Spring 动画。

### 1.16 认证逻辑与组件强耦合 (Auth Component Coupling)

**位置**: `src/app/auth/page.tsx`
**现状**:

- 包含 Web, Tauri, iOS, Android 四种平台的认证流，全部堆砌在组件内部。
- 依赖 `localStorage` 进行简单的重定向状态管理。
  **改进**:
- **AuthService**: 将平台差异逻辑移至服务层。
- **State Machine**: 使用状态机管理认证流程。

### 1.17 支付逻辑视图耦合 (Payment Logic Coupling)

**位置**: `src/app/user/page.tsx`
**现状**:

- 在 UI 组件内部直接调用 `createStripeCheckoutSession` 和处理 IAP 恢复逻辑。
- **风险**: 支付逻辑分散，难以维护和测试。如果添加新的支付方式，`ProfilePage` 会进一步膨胀。
  **改进**:
- **PaymentService**: 建立统一的支付服务层，屏蔽底层提供商差异。

### 1.18 表单状态传递冗余 (Prop Drilling in Forms)

**位置**: `src/components/metadata/BookDetailEdit.tsx`
**现状**:

- 父组件将 `fieldSources`, `lockedFields`, `fieldErrors` 等 10+ 个属性透传给子组件。
  **改进**:
- **Context/Store**: 使用 Svelte 5 的 Context 或 Ephemeral Store (`new BookEditState()`) 封装表单状态。

### 1.19 遥测初始化的模块副作用 (Module Side-Effect Telemetry)

**位置**: `src/context/PHContext.tsx`
**现状**:

- 在模块顶层 (Line 21) 直接判断 `typeof window` 并初始化 PostHog。
- **风险**: 这会导致在导入该模块时立即执行代码，可能在 SSR 环境或测试环境中导致不可预测的行为。
  **改进**:
- **Explicit Init**: 仅在 `hooks.client.ts` 或组件的 `onMount` 中显式调用 `init`。

### 1.20 不安全的 Script Eval (Unsafe Script Eval)

**位置**: `src/app/reader/components/FoliateViewer.tsx` (Lines 243-257)
**现状**:

- `evalInlineScripts` 遍历 iframe 中的 `script` 标签并手动 `eval()`。
- **风险**: - **安全**: 如果书本内容包含恶意 JS（XSS），`eval` 给予了它执行权限。- **可维护性**: 这是一种针对 Tauri/WebView 不执行 iframe 脚本的 Hack，随着 WebView 更新，这种代码可能变得多余甚至有害。
  **改进**:
- **CSP**: 使用内容安全策略 (CSP) 明确控制脚本执行。
- **Sandboxing**: 如果必须执行脚本，应限制在受控的 Sandbox 中，而不是直接 `eval`。

### 1.21 复杂的布局抖动 (Layout Thrashing)

**位置**: `src/components/settings/SettingsDialog.tsx` (Lines 125-145)
**现状**:

- 为了检测 Tab 标签是否太长，代码创建了 DOM 节点的克隆 (`cloneNode`)，插入 Body，测量宽度，然后删除。
- **性能**: 这种强制回接 (Reflow/Layout) 操作非常昂贵，尤其是在 Resize 时被频繁触发。
  **改进**:
- **CSS Container Queries**: 使用现代 CSS `@container` 查询自动调整布局。
- **ResizeObserver**: 使用 Svelte Action 监听尺寸变化，仅在必要时更新状态。

### 1.22 魔法数字 Z-Index (Magic Number Z-Index)

**位置**: `src/app/reader/components/Reader.tsx` (Comments)
**现状**:

- 依赖一套硬编码的 Z-Index 系统 (99, 50, 45, 40...)。
  **风险**:
- 随着应用复杂度增加，很容易出现 Z-Index 冲突（层叠上下文陷阱）。
  **改进**:
- **CSS Variables / Tailwind**: 统一在 `index.css` 或 Tailwind 配置中定义层级常量。

## 2. 性能瓶颈 (Performance Bottlenecks)

### 2.1 无限制的列表渲染

**位置**: `src/app/reader/components/sidebar/SearchResults.tsx`
**现状**:

- 直接 `results.map` 渲染所有搜索结果。
- **隐患**: 如果一本书有 1000 个匹配项，DOM 节点数将瞬间激增，导致侧边栏卡顿甚至崩溃。
- **内存泄漏**: `useScrollToItem` 为每个结果项创建了一个 Hook 实例和 `useRef`，内存占用随结果数线性增长。
  **Svelte 5 改进**:
- **虚拟滚动**: **必须** 使用 `@tanstack/svelte-virtual`。哪怕只有 100 项，虚拟化也能显著降低初始化时间。
- **扁平化数据**: 将嵌套的 `SearchResult` 结构（章节 -> 结果）在逻辑层扁平化为一维数组，方便虚拟化列表渲染。

### 2.2 重度 Hook 逻辑 (Heavy Hooks)

**位置**: `src/app/reader/hooks/useTextSelector.ts` (Line 9-258)
**现状**:

- 混合了 React State (`useState`), Refs (`useRef`), DOM Event Listeners, 和定时器 (`setTimeout`)。
- 负责处理极其复杂的选中、弹窗、iOS 兼容性。
  **Svelte 5 改进**:
- **Action 模式**: 将所有 DOM 事件监听逻辑封装为 `use:textSelector` Action。
- **分离关注点**:
  - `Action`: 仅负责捕捉事件，抛出 `on:select` 或 `on:menu` 事件。
  - `Component`: 仅负责响应事件并更新状态。
  - 这使得 DOM 交互逻辑（难测试）与 业务状态逻辑（易测试）分离。

### 2.3 主线程 CSS 解析 (CSS Parsing on Main Thread)

**位置**: `src/utils/style.ts` (Line 617 `transformStylesheet`)
**现状**:

- 使用复杂的正则表达式 `/([^{]+)({[^}]+})/g` 在运行时解析 CSS 字符串。
- **隐患**: - **ReDoS 攻击**: 恶意的 CSS 可能导致正则回溯爆炸，卡死页面。- **UI 阻塞**: 解析 1MB 大小的 CSS 文件可能导致数百毫秒的掉帧。
  **改进**:
- **Off-Main-Thread**: 移至 Web Worker 处理。
- **Lexer**: 使用专用的 CSS Tokenizer 而非 RegEx。

### 2.4 Blob 对象内存泄漏 (Blob Memory Leak)

**位置**: `src/libs/edgeTTS.ts`
**现状**:

- 使用 LRU Cache 缓存 200 个 Blob 对象。
- `URL.revokeObjectURL` 仅在 Cache 满时才调用。对于移动端设备，200 个 MP3 片段（约 50-100MB）会造成显著内存压力，且容易被系统 Kill。
  **改进**:
- **Eager Revocation**: 播放完毕立即释放 Blob URL。
- **Persistent Cache**: 如果为了节省流量，应存入 IndexedDB (File Handle)，不占用 RAM。

### 2.5 同步竞态风险 (Sync Race Conditions)

**位置**: `src/libs/sync.ts`
**现状**:

- `pushChanges` (Line 66) 使用粗暴的"覆盖式"上传，未检查服务端版本。
- **风险**: 存在典型的数据覆盖风险。若用户在两台设备先后阅读，较早的那个同步操作（如果因网络延迟晚到）可能会覆盖较新的阅读进度。
  **改进**:
- **Vector Clock / Timestamp Check**: 上传前必须附带 `lastUpdatedAt`，如果服务端发现记录已更新，应拒绝上传并返回最新数据触发 Merge。

### 2.6 I18n Bundle 体积膨胀

**位置**: `src/i18n/i18n.ts`
**现状**:

- 动态导入完整 `i18next` 实例 + HTTP Backend。
- **问题**: Webpack/Vite 往往难以对这种动态导入模式进行完美 Tree-shaking，导致首屏 JS 体积增大。
  **改进**:
- **Paraglide-JS**: 采用编译时生成方案，每个语言包都是独立的 JS 模块，浏览器仅需加载当前语言的极小 chunk。

### 2.7 认证状态的脆弱持久化 (Fragile Auth Persistence)

**位置**: `src/context/AuthContext.tsx`
**现状**:

- 使用 `useEffect` 手动监听 Supabase 事件并将 Token/User 写入 `localStorage`。
- **风险**: - **Race Condition**: 页面加载时 `useState` 读取一次，`useEffect` 初始化又可能触发一次写入，导致状态不一致。- **XSS 风险**: Token 存储在 localStorage 中容易被 XSS 脚本窃取。
  **改进**:
- **HttpOnly Cookie**: 服务端使用 Cookie 存储 Session，前端仅通过 API 获取状态，不接触敏感 Token。

### 2.8 手动任务调度 (Manual Task Scheduling)

**位置**: `src/app/reader/components/sidebar/SearchBar.tsx` (Line 292)
**现状**:

- 使用 `await new Promise((resolve) => setTimeout(resolve, 0))` 进行手动的时间片轮转，以避免阻塞 UI。
- **缺陷**: - 这是一种"穷人的 Worker"。对于数万个搜索结果，即使有 Yield，主线程依然会处于高负载状态，导致滚动掉帧。- 代码可读性差，混合了生成器和 Promise 逻辑。
  **改进**:
- **Web Worker**: 将整个搜索逻辑移入 Worker。UI 线程只负责接收消息并渲染。

### 2.9 主线程大文本转换 (Main Thread Content Transformation)

**位置**: `src/services/transformers/simplecc.ts`
**现状**:

- 在主线程同步遍历 DOM Tree 并替换文本 (繁简转换)。
- **缺陷**: - 典型的 "Stop the World" 操作。对于长章节，这会冻结浏览器。
  **改进**:
- **Off-Main-Thread**: 在 Worker 中处理文本字符串，或利用 Rust/Wasm (Tauri Backend) 进行极速转换。

### 2.10 危险的缓存加载策略 (Dangerous Cache Loading)

**位置**: `src/services/translators/cache.ts`
**现状**:

- 启动时调用 `loadCacheFromDB` 将 IndexedDB 中的所有数据载入内存对象的 `memoryCache` 字段。
- **风险**: - **OOM**: 随着用户使用时间增长，翻译缓存可能达到数百 MB。在移动端上，这会导致应用被系统强制杀死 (OOM Killer)。
  **改进**:
- **Lazy Load**: 放弃“全部加载到内存”的策略。仅在查询时读取 IDB，并使用固定大小的 LRU Cache (例如 50 条) 缓存热点数据。

### 2.11 衍生状态计算阻塞 (Derived State Blocking)

**位置**: `src/app/reader/components/notebook/Notebook.tsx` (Lines 189-203)
**现状**:

- 使用 `useMemo` 对所有笔记进行过滤和排序。每当输入框变化 (`searchTerm`)，React 都会在主线程重新分配大量数组。
- **缺陷**: - 对于高频输入事件，这会导致键盘输入延迟。
  **改进**:
- **Fine-Grained Reactivity**: 使用 Svelte 5 的 `$derived`。仅在源数据变化时计算的特性，配合 Svelte 的高效更新机制，几乎能消除输入延迟。
- **Debounce**: 对搜索输入进行防抖处理。

### 2.12 字体 Blob 引起的内存泄漏 (Font Memory Leak)

**位置**: `src/store/customFontStore.ts`
**现状**:

- 将自定义字体文件 (可能几 MB) 读取为 Blob，并生成 `blob:` URL。只有在 `beforeunload` 时才尝试释放。
- **风险**: - 单页应用 (SPA) 用户可能长时间不刷新页面。- 移动端 PWA 进入后台时可能被直接终止，导致 Blob 占用的内存无法及时归还系统 (尽管 OS 会回收，但进程存活期间内存压力大)。
  **改进**:
- **CSS Font Loading API**: 尽可能使用标准的 `FontFace` API 加载字体，而不是手动管理 Blob URL。
- **Store-bound Cleanup**: 将 URL 的生命周期与 Svelte Store 或 Component 绑定 (`onDestroy`)。

### 2.13 主线程上的书籍解析 (Blocking Book Parsing)

**位置**: `src/utils/txt.ts` (Line 53 `convert`)
**现状**:

- 使用复杂的正则表达式和 `TextDecoder` 在**主线程**同步解析整个 TXT 文件。
- **缺陷**: - 对于 10MB 以上的小说，这会彻底冻结 UI数秒，给用户造成"死机"的假象。- 在内存中同时持有 `ArrayBuffer`, `decodedString(10MB)`, 和 `chapters` 数组，造成极高的内存峰值。
  **改进**:
- **Worker + Streams**: 必须将 Parsing 逻辑移至 Worker。如果可能，使用 Streams API 分块读取和处理，避免一次性加载。

### 2.14 同步的简繁转换 (Synchronous Chinese Conversion)

**位置**: `src/utils/toc.ts` (Line 93 `convertTocLabels`)
**现状**:

- 在更新目录时，同步调用 `simplecc` 进行简繁转换。
- **风险**: - 如果目录项很多（如网络小说 2000 章），每个标题都跑一遍转换，会造成明显的 UI 卡顿。
  **改进**:
- **Async Pattern**: 将转换结果作为 Promise 或 Async Signal。UI 先显示原始内容，转换完成后自动刷新。

### 2.15 纹理与图片资源泄漏 (Texture Memory Leaks)

**位置**: `src/store/customTextureStore.ts`
**现状**:

- 与字体 Store 类似，使用 `URL.createObjectURL` 创建背景纹理的 Blob URL，且仅在 `beforeunload` 时清理。
- **风险**: - 快速切换多个背景纹理（例如用户在浏览主题设置）会迅速消耗内存，直到触发 GC 或崩溃。
  **改进**:
- **Disposable Pattern**: 实现 `dispose()` 方法，并在组件卸载或纹理替换时显式调用。
- **WeakRef**: 考虑使用 WeakRef 来追踪和自动释放不再使用的 Blob。

### 2.16 布局抖动于批注器 (Layout Thrashing in Annotator)

**位置**: `src/app/reader/components/annotator/Annotator.tsx`
**现状**:

- 使用 `getBoundingClientRect` 在 `scroll` 事件中频繁计算弹出菜单位置 (Line 113)。
- **风险**: 强制重排 (Forced Reflow) 会导致滚动掉帧。
  **改进**:
- **@floating-ui**: 将位置计算移交给专业库，它使用 `IntersectionObserver` 和优化的计算策略。

### 2.17 手动实现的几何计算 (Manual Geometry Math)

**位置**: `src/utils/sel.ts`
**现状**:

- 包含数百行手动计算矩形重叠、坐标转换的代码。
- **风险**: 难以维护，且容易在复杂的 CSS 变换（如缩放、3D 变换）下失效。
  **改进**:
- **Standard Library**: 废弃该文件，使用 `@floating-ui` 的中间件。

### 2.18 过程式拖拽状态 (Procedural Drag State)

**位置**: `src/app/reader/components/annotator/AnnotationRangeEditor.tsx`
**现状**:

- 使用 `useRef` + `PointerCapture` API 手动管理拖拽。
  **改进**:
- **Declarative Actions**: 封装 `use:draggable` action，提供 `on:dragstart`, `on:drag`, `on:dragend` 事件。

### 2.19 主线程搜索阻塞 (Blocking Search Logic)

**位置**: `src/app/reader/components/sidebar/SearchBar.tsx`
**现状**:

- 使用 `setTimeout(..., 0)` (Line 292) 试图防止 UI 冻结。这被称为 "Yielding to Main Thread"，但并不是真正的并行。对于密集计算（正则匹配），这依然会造成显著的 Frame Drop。
  **改进**:
- **Web Worker**: 必须将搜索逻辑完全移出主线程。

### 2.20 God Component: TTSControl

**位置**: `src/app/reader/components/tts/TTSControl.tsx`
**现状**:

- 单个文件 770 行，混合了 UI 渲染、音频会话管理、SSML 解析和 Tauri 桥接。
- 逻辑重复：`FooterBar` 挂载此组件，导致如果用户打开了多个分屏书籍，可能会初始化多个 MediaSession 控制器，产生竞争条件。
  **改进**:
- **Singleton Pattern**: TTS 应作为一个全局单例服务存在，无论打开多少本书，只有一个音频输出源。

### 2.21 脆弱的目录滚动同步 (Fragile TOC Scrolling)

**位置**: `src/app/reader/components/sidebar/TOCView.tsx`
**现状**:

- 使用 `interactionCooldown` (Line 55) 来区分“用户点击”和“自动跟随”。这种基于时间的逻辑非常不可靠（例如用户快速连续点击）。
  **改进**:
- **Source of Truth**: 明确区分 `UserIntent` 和 `SystemUpdate`。仅在 `SystemUpdate` 且 `UserIdle` 时触发自动滚动。

### 2.22 主线程列表过滤 (Main Thread Filtering)

**位置**: `src/app/library/utils/libraryUtils.ts`
**现状**:

- `createBookFilter` (Line 4) 在每次渲染时都会为搜索词创建新的 `RegExp` (Line 9)，且如果正则失败会回退到字符串匹配。
- 整个过滤过程在主线程同步执行。对于拥有几千本书的用户，输入搜索词时会导致严重的输入延迟。
  **改进**:
- **Worker Offloading**: 将过滤逻辑移至 Web Worker。
- **RegExp Caching**: 缓存正则表达式实例。

### 2.23 只有轮询的同步 (Polling-based Sync)

**位置**: `src/app/library/hooks/useBooksSync.ts`
**现状**:

- 依赖 `throttle` (Line 48) 限制 `handleAutoSync` 的频率。这种“拉取”模式在多设备实时性上较差，且浪费资源。
  **改进**:
- **WebSocket / Server-Sent Events (SSE)**: 实现服务端推送通知，仅在数据真正变更时触发同步。

### 2.24 隐式导入逻辑 (Implicit Import Logic)

**位置**: `src/app/library/page.tsx`
**现状**:

- `importBooks` (Line 394) 函数包含大量 UI 混合逻辑（Toast, Loading State），且并发控制 (`concurrency = 4`) 是硬编码的。
  **改进**:
- **Import Queue**: 如果用户一次拖入上百本书，应创建一个持久化的导入队列，并在后台处理，允许用户导航离开当前页面而不中断导入。

### 2.25 混合状态的 Store (Mixed State Stores)

**位置**: `src/store/readerStore.ts`
**现状**:

- 同时管理 `viewSettings` (如果不保存则丢失)、`progress` (需同步到服务器) 和 `ribbonVisible` (纯 UI 临时状态)。这导致在进行“保存”、“同步”操作时需要小心翼翼地剔除临时字段。
  **改进**:
- **Segregation**: 严格分离 `AppUIState` (Runes), `UserSettings` (Persisted Store) 和 `UserData` (Syncable Store)。

### 2.26 巨型设置面板 (Monolithic Settings Panels)

**位置**: `src/app/reader/components/settings/LayoutPanel.tsx` (31KB)
**现状**:

- 包含了页边距、行高、字间距、翻页模式、双栏模式等所有布局控制。逻辑高度耦合，难以复用或单独测试。
  **改进**:
- **Component Composition**: 拆分为独立的小型控制组件。

### 2.27 手动重置传播 (Manual Reset Propagation)

**位置**: `src/components/settings/SettingsDialog.tsx`
**现状**:

- 父组件通过 `onRegisterReset` 回调获取子组件的重置函数。这是一种反模式 (Anti-pattern)，不仅增加了耦合，还破坏了数据流的单向性。
  **改进**:
- **Store Actions**: 重置逻辑应直接定义在 Store Action 中，UI 组件只需调用 Store 方法，无需组件间通信。

## 第三部分：核心功能模块 (Core Modules)

### 3.1 组件内的 OAuth Server (OAuth Server in Component)

**位置**: `src/app/auth/page.tsx`
**现状**:

- 在 React 组件的 `useEffect` 中启动和停止 Node.js http server (用于 Tauri OAuth 回调)。如果组件异常卸载或重渲染，可能导致端口占用或服务未正确关闭。
  **改进**:
- **Service Lifecycle**: 这种应用级的副作用应由 `AuthService` 在应用启动/销毁时管理，而不是绑定到某个 UI 页面的生命周期。

### 3.2 混合支付逻辑 (Mixed Payment Logic)

**位置**: `src/app/user/page.tsx`
**现状**:

- `handleStripeSubscribe` 和 `handleIAPSubscribe` 直接写在组件内，包含了复杂的 Try-Catch 和 Toast 逻辑。
  **改进**:
- **Unified Interface**: 定义 `PaymentProvider` 接口，根据环境注入 `StripeProvider` 或 `IAPProvider`。

### 3.3 存储管理巨石 (Storage Manager Monolith)

**位置**: `src/app/user/components/StorageManager.tsx`
**现状**:

- 单文件 571 行，混合了 API 调用、数据转换（按 BookHash 分组）、UI 渲染（表格、分页）和交互逻辑（多选、删除）。
  **改进**:
- **Separation of Concerns**: 逻辑层提取到 `useStorage` (or Store)，UI 层拆分为展示组件。

### 3.4 手动历史栈 (Manual History Stack)

**位置**: `src/app/opds/page.tsx`
**现状**:

- 维护了一个 `HistoryEntry[]` 数组来模拟浏览器的前进后退。这在处理复杂的用户导航（如深层链接、刷新）时非常脆弱且难以维护。
  **改进**:
- **State-based Routing**: 如果是类似 SPA 的体验，应使用状态机；或者直接利用 URL Query Params (`?url=...`) 让浏览器原生历史栈接管。

### 3.5 UI中的 OPDS 解析 (OPDS Parsing in UI)

**位置**: `src/app/opds/page.tsx`
**现状**:

- XML 解析 logic (`DOMParser`, `getFeed`, `getPublication`) 直接散落在组件的 `loadOPDS` 方法中。
  **改进**:
- **Data Access Layer**: 封装 `OPDSRepository`，组件只负责渲染解析后的 `Feed` 或 `Publication` 对象。

### 3.6 服务层依赖 UI (Service Depends on UI)

**位置**: `src/services/transferManager.ts`
**现状**:

- `initialize` 方法要求传入 `translationFn`。这意味着底层服务需要知道如何“翻译”文本，这是典型的层级倒置。
  **改进**:
- **Error Codes**: 服务层抛出 `UploadError({ code: 'QUOTA_EXCEEDED' })`，UI 层捕获并显示 `t('errors.quota_exceeded')`。

### 3.7 硬编码的代理逻辑 (Hardcoded Proxy Logic)

**位置**: `src/app/api/opds/proxy/route.ts`
**现状**:

- 包含针对 Cloudflare Workers 的 URL 参数解析 workaround (`%26` issue)。手动构建 CORS Headers。
  **改进**:
- **Middleware**: 如果可能，将通用代理逻辑提取为 Middleware 或 Helper Function，统一处理 CORS 和 Error Handling。
- **Robust Parsing**: 使用更健壮的 URL 解析库或配置，避免手动字符串截取 (`substring`) 来修复编码问题。

### 3.8 内存中的音频缓存 (In-Memory Audio Cache)

**位置**: `src/libs/edgeTTS.ts`
**现状**:

- 使用 `LRUCache<string, Blob>` 缓存 TTS 音频。这会占用大量内存，且页面刷新后即丢失。
  **改进**:
- **Cache API**: 使用浏览器原生的 Cache API (`window.caches`)，将 TTS 片段持久化到磁盘，既节省内存又支持跨会话复用。

### 3.9 主线程解压 (Main Thread Decompression)

**位置**: `src/libs/document.ts`
**现状**:

- `ZipReader` 在主线程运行 (配置了 `useWebWorkers: false`)。解压大型 EPUB/CBZ 会导致界面卡顿。
  **改进**:
- **Worker Offloading**: 启用 `zip.js` 的 Worker 模式，或将整个 `DocumentLoader` 移入 Comlink Worker。

### 3.10 平台判断散落在业务逻辑中 (Platform Checks Scattered)

**位置**: `src/libs/mediaSession.ts`, `src/libs/storage.ts`
**现状**:

- 大量的 `if (isTauriAppPlatform())` 判断。
  **改进**:
- **Platform Abstraction**: 定义 `IPlatformAdapter` 接口，包含 `fs`, `media`, `clipboard` 等子模块。在应用启动时注入具体的 `WebAdapter` 或 `TauriAdapter`。

### 3.11 CSS 字符串拼接 (CSS String Concatenation)

**位置**: `src/utils/style.ts`
**现状**:

- 使用 Template Literals 手动构建复杂的 CSS 规则。这种方式难以阅读，且没有任何语法检查或压缩。
  **改进**:
- **CSS-in-JS / Preprocessors**: 即使不引入运行时 CSS-in-JS 库，也可以使用更结构化的方式管理这些样式，或者利用 CSS Variables 极大简化 JS 侧的逻辑。

### 3.12 XHR 与 Fetch 混用 (Mixing XHR and Fetch)

**位置**: `src/utils/transfer.ts`
**现状**:

- `webUpload` 使用 `XMLHttpRequest` (为了获取进度)，而 `webDownload` 使用 `fetch` + `Reader`。
  **改进**:
- **Unified Fetch**: 现代浏览器已支持 `fetch` 的 upload progress (虽然标准尚在完善，但用 Axios 或封装 XHR 统一接口更好)。保持一致性有助于维护。

### 3.13 事件总线滥用 (Event Bus Abuse)

**位置**: `src/components/Toast.tsx`, `src/utils/event.ts`
**现状**:

- 使用自定义的 `eventDispatcher` 实现 Toast 和 Native Events 的通信。这是一种隐式依赖，难以追踪数据流。
  **改进**:
- **Store-based State**: 使用 Svelte Store 替代 Event Bus。组件直接订阅 Store，逻辑更清晰可测。

### 3.14 更新逻辑与 UI 耦合 (Updater Logic Coupled with UI)

**位置**: `src/components/UpdaterWindow.tsx`
**现状**:

- `useEffect` 中包含了大量的业务逻辑（检查更新、下载 APK、翻译 Changelog）。
  **改进**:
- **Updater Service**: 提取 `UpdaterService` 处理检查和下载逻辑。 UI 只负责展示状态 (`status: 'checking' | 'available' | 'downloading'`).

### 3.15 复杂的 Hook 状态管理 (Complex Hook State Management)

**位置**: `src/hooks/useSync.ts`
**现状**:

- 使用了 15 个 `useState` 来管理同步的各个阶段和结果。这使得逻辑极其难以维护和测试。
  **改进**:
- **Reducer / State Machine**: 对于这种复杂的多状态流程，应使用 `useReducer` 或状态机来管理。在 Svelte 中，可以使用单个 Store 对象包含所有相关状态。

### 3.16 翻译逻辑中的 UI 耦合 (UI Coupling in Translation Logic)

**位置**: `src/hooks/useTranslator.ts`
**现状**:

- 在 `catch` 块中直接调用 `eventDispatcher` 显示 Toast。这使得该 Hook 难以在无 UI 上下文（如后台任务）中使用。
  **改进**:
- **Error Propagation**: Hook 或 Service 应抛出标准化的错误，由 UI 组件捕获并决定如何展示（Toast 或 Alert）。

### 3.17 文件系统抽象的混合使用 (Mixed Usage of FS Abstraction)

**位置**: `src/services/nativeAppService.ts`
**现状**:

- 混用了 `Raw Tauri API` (`readDir`, `stat`) 和封装的 `FileSystem` 接口。
  **改进**:
- **Strict Layering**: 强制所有文件操作都通过 `FileSystem` 接口进行，禁止直接调用底层 API，以确保 `WebAppService` 和 `NativeAppService` 的行为一致性。

### 3.18 TTS 状态的事件驱动 (Event-driven TTS State)

**位置**: `src/services/tts/TTSController.ts`
**现状**:

- 继承自 `EventTarget`，使用 `dispatchEvent` 通知 UI 变化。这种模式在 React/Svelte 中不如 Store 直观。
  **改进**:
- **Store Reactivity**: 使用 Svelte Store 替代 `EventTarget`。UI 组件直接订阅 `$tts.state` 或 `$tts.highlight`，无需手动添加监听器。

### 3.19 混合路由导致的架构混乱 (Architectural Confusion from Hybrid Routing)

**位置**: `src/app/reader` vs `src/pages/reader`
**现状**:

- 两个路由目录并存，增加了理解路由优先级的难度。
  **改进**:
- **Unified Router**: SvelteKit 的统一路由模型将彻底解决这个问题。所有路由逻辑都应在 `src/routes` 下。

### 3.20 Store 的高耦合 (High Coupling in Logic Stores)

**位置**: `src/store/readerStore.ts`
**现状**:

- `readerStore` 直接导入并修改其他 Store (`useBookDataStore`, `useLibraryStore`)。这种副作用使得状态变更难以追踪。
  **改进**:
- **Reactive Dependencies**: 在 Svelte 5 中，使用 `$effect` 或 `$derived` 来声明式地处理状态依赖，而不是在 Setter 中命令式地修改其他 Store。

### 3.21 上帝组件的反模式 (God Component Anti-pattern)

**位置**: `src/app/library/page.tsx` (32KB), `Annotator.tsx` (33KB)
**现状**:

- 单个文件包含过多的职责（UI、业务逻辑、数据获取、事件处理）。导致可读性差，难以维护。
  **改进**:
- **Component Decomposition**: 严格遵循单一职责原则。将逻辑提取到 Hooks (在 Svelte 中为 `.svelte.ts` 模块) 或拆分为子组件。

### 3.22 手动 DOM 事件管理 (Manual DOM Event Management)

**位置**: `src/app/reader/components/FoliateViewer.tsx`
**现状**:

- 在 `useEffect` 中手动 `addEventListener` 和 `removeEventListener`。容易导致内存泄漏或不一致。
  **改进**:
- **Svelte Actions / Directives**: 使用 Svelte 的 `on:event` 指令或 Actions 来自动管理事件监听器的生命周期。

### 3.23 认证逻辑的副作用 (Side Effects in Auth Logic)

**位置**: `src/context/AuthContext.tsx`
**现状**:

- 在 `useEffect` 中手动同步 Session 到 LocalStorage 和 PostHog。
  **改进**:
- **Reactive Effects**: 使用 Svelte 5 的 `$effect` 监听 Auth Store 的变化，自动处理副作用，使逻辑更声明式。

### 3.24 OPDS 的手动历史管理 (Manual History Management in OPDS)

**位置**: `src/app/opds/page.tsx`
**现状**:

- 为了在单个页面内导航 OPDS Feeds，手动实现了 `history` 数组和索引管理。这破坏了浏览器的原生导航体验。
  **改进**:
- **URL-driven State**: 将 OPDS URL 映射到应用路由。每次点击 Feed Link 都是一次真正的页面跳转 (`goto`)。这让浏览器历史记录自然工作。

### 3.25 认证逻辑的平台耦合 (Platform Coupling in Auth Page)

**位置**: `src/app/auth/page.tsx`
**现状**:

- 页面组件中充斥着大量的 `if (isTauri) ... else if (isIOS) ...` 判断。
  **改进**:
- **Strategy Pattern**: 使用策略模式将不同平台的认证流程（DeepLink vs Redirect vs Native SDK）分离到独立的模块中。

### 3.26 单体同步 API (Monolithic Sync API)

**位置**: `src/pages/api/sync.ts`
**现状**:

- 单个文件处理了所有类型的同步（书、笔记、配置），逻辑分支复杂，难以测试。
  **改进**:
- **Modular Services**: 将不同实体的同步逻辑拆分为独立的服务类 (`BookSyncService`, `NoteSyncService`)，API 层只负责路由分发。

### 3.27 运行时样式注入带来的闪烁风险 (FOUC Risk from Runtime Style Injection)

**位置**: `src/styles/themes.ts`
**现状**:

- 依赖 JS 在运行时计算颜色并注入 `<style>` 标签。可能会导致页面加载时的样式闪烁 (FOUC) 或性能开销。
  **改进**:
- **CSS Variables**: 尽可能利用 CSS 变量的继承特性。在 SSR 阶段即注入关键变量（如果是 Cookie 存储的主题），或者使用类似 `svelte-themes` 的库来处理主题切换，确保无闪烁体验。

### 3.28 更新逻辑的 UI 耦合 (UI Coupling in Updater Logic)

**位置**: `src/components/UpdaterWindow.tsx`
**现状**:

- 更新检查、下载进度追踪、文件系统操作都直接写在 UI 组件内。
  **改进**:
- **Service Layer**: 抽离 `UpdaterService`。UI 组件只应该订阅 `updaterService.progress` 状态。

### 3.29 TTS 客户端的协议实现细节暴露 (Protocol Details Leaked in TTS Client)

**位置**: `src/libs/edgeTTS.ts`
**现状**:

- WebSocket 握手、Header 构造等低级细节暴露在业务逻辑层。
  **改进**:
- **Protocol Encapsulation**: 进一步封装 WebSocket 通信细节，对外只暴露 `speak(text, voice)` 和 `stop()` 接口。使用 RxJS 或 Svelte Store 处理音频流事件。

### 3.30 客户端 Provider 地狱 (Client-side Provider Hell)

**位置**: `src/components/Providers.tsx`
**现状**:

- 典型的 React Provider 嵌套层级 (`AuthProvider` > `IconContext` > `SyncProvider`)。
  **改进**:
- **Svelte Context/Store**: Svelte 的 Context 是基于组件树的，但很多全剧状态更适合单例 Store。减少不必要的 Context Provider 嵌套，直接导入 Store 使用。

### 3.31 工具函数的 SSR 兼容性 (SSR Compatibility of Utils)

**位置**: `src/utils/style.ts` 等
**现状**:

- 部分工具函数可能直接引用 `window` 或 `document`，导致在 SvelteKit SSR 运行时报错。
  **改进**:
- **Browser Guard**: 在迁移时，为所有涉及 DOM 的工具函数添加 `if (typeof window !== 'undefined')` 检查，或将其重构为仅在 Action/Effect 中调用。

### 3.32 阅读器视图的高耦合编排 (High Coupling in Reader Composition)

**位置**: `src/app/reader/components/BooksGrid.tsx`
**现状**:

- 该组件不仅负责布局，还负责实例化所有辅助 UI（Header, Footer, Annotator, SearchNav）。这导致每次 View 渲染时都要处理大量子组件。
  **改进**:
- **Context/Slot-based Composition**: 使用 Svelte 的 Context API 将辅助 UI 与 Viewer 解耦。例如，`HeaderBar` 可以是一个独立的消费者组件，而不是由 Grid 硬编码传递 Props。

### 3.33 设置对象的上帝类型 (God Object for ViewSettings)

**位置**: `src/types/book.ts`
**现状**:

- `ViewSettings` 接口继承了 10 个以上的小接口，导致任何一处设置变更都可能触发整个 View 的重新渲染检查。
  **改进**:
- **Granular Stores**: 将 Font, Layout, Theme 等设置拆分为独立的 Store slice。组件只订阅它关心的那部分设置（例如：字体设置组件只订阅 `FontSettings`）。

### 3.34 应用服务职责过重 (Overloaded AppService Responsibilities)

**位置**: `src/services/appService.ts`
**现状**:

- `AppService` 是一个典型的上帝类，既管文件 IO，又管业务逻辑（如导入书），还管设置。导致其难以测试和维护。
  **改进**:
- **Service Decomposition**: 按领域拆分服务 (`LibraryService`, `SettingsService`, `FileService`)。使用依赖注入（通过 Context 或 Module Imports）来管理这些服务。

### 3.35 转换器的 DOM 操作副作用 (DOM Manipulation Side-effects in Transformers)

**位置**: `src/services/transformers/proofread.ts`
**现状**:

- 直接使用 `TreeWalker` 修改 DOM 节点内容，这可能破坏框架（React/Svelte）对 DOM 的引用，导致 Hydration 错误或更新丢失。
  **改进**:
- **Virtual/Abstract Processing**: 在渲染前对文本/HTML 字符串进行处理，而不是修改挂载后的 DOM。

### 3.36 翻译逻辑与 UI 耦合 (Translation Logic Coupling)

**位置**: `src/hooks/useTranslator.ts`
**现状**:

- 缓存策略、API 调用、错误处理都混合在 Hook 中。
  **改进**:
- **Pure Logic Extraction**: 将 `cache`, `polish`, `preprocess` 等逻辑封装为纯函数或类方法，Hook 仅负责调用和状态展示。

### 3.37 标注器状态复杂性 (Annotator State Complexity)

**位置**: `src/app/reader/components/annotator/Annotator.tsx`
**现状**:

- 使用大量的 `useState` 来维护各种 Popup 的可见性和位置，导致组件渲染逻辑非常脆弱且难以扩展。
  **改进**:
- **Finite State Machine (FSM)**: 定义明确的状态（如 `IDLE`, `SELECTING`, `SHOW_MENU`, `EDIT_NOTE`），确保同一时间只有一个交互模式处于激活状态。

### 3.38 书库组件职责不清 (Library Component Responsibilities)

**位置**: `src/app/library/page.tsx`
**现状**:

- 视图层混合了大量业务逻辑（如下载更新、导入文件），违反了关注点分离原则。
  **改进**:
- **Controller/View Separation**: 将业务逻辑移至 Svelte Actions 或 Controllers，View 层只负责渲染数据。

### 3.39 字体加载的硬编码与副作用 (Hardcoded Font Loading & Side Effects)

**位置**: `src/styles/fonts.ts`
**现状**:

- 直接操作 `document.head`，且包含大量硬编码的 CDN URL，不仅难以维护，还可能在不同网络环境下导致加载失败。
  **改进**:
- **Configurable Font Sources**: 将 CDN URL 移至配置文件。使用标准的样式加载机制替代手动 DOM 操作。

### 3.40 样式生成逻辑的脆弱性 (Fragility of Style Generation)

**位置**: `src/utils/style.ts`
**现状**:

- 使用巨大的模板字符串拼接 CSS，难以维护，且缺乏类型安全。任何 CSS 语法错误都只会在运行时发现。
  **改进**:
- **CSS-in-JS / Typed CSS**: 考虑使用类型安全的 CSS 生成库，或者彻底转向 CSS 变量驱动的架构。

### 3.41 主线程阻塞风险 (Main Thread Blocking Risk)

**位置**: `src/utils/txt.ts`
**现状**:

- TXT 转 EPUB 的转换逻辑包含大量同步的正则表达式匹配和 ZIP 压缩操作，会严重阻塞主线程。
  **改进**:
- **Mandatory Worker**: 强制将此模块运行在 Web Worker 中。

### 3.42 阅读器状态混合 (Mixed Reader State)

**位置**: `src/store/readerStore.ts`
**现状**:

- Store 既存储需要同步的关键业务数据（阅读进度），又存储纯 UI 状态（Ribbon显隐）。导致状态快照体积大，且难以分离副作用。
  **改进**:
- **Split Persistence**: 将需要持久化的数据与仅运行时需要的 UI 状态拆分到不同的 State Roots。

### 3.43 更新检查的隐式 UI 调用 (Implicit UI Call in Updates)

**位置**: `src/helpers/updater.ts`
**现状**:

- 辅助函数内部直接修改了全局组件的状态，破坏了单向数据流。
  **改进**:
- **Observable Pattern**: 更新服务仅暴露状态 (`updateAvailable`, `version`)，由 UI 组件主动订阅。

### 3.44 设置同步的“useEffect 地狱” (useEffect Hell in Settings)

**位置**: `src/components/settings/LayoutPanel.tsx`, `FontPanel.tsx`
**现状**:

- 每个设置项都有一个独立的 `useState` 和一个对应的 `useEffect` 来保存更改。这种 O(N) 的样板代码极难维护且性能低效。
  **改进**:
- **Reactive Object**: 使用 Svelte 5 的 `$effect` 监听整个设置对象（Deep State），或者使用 Proxy Store 来自动处理同步。

### 3.45 单体同步 API (Monolithic Sync API)

**位置**: `src/pages/api/sync.ts`
**现状**:

- 所有的同步逻辑（书籍、配置、笔记）都塞在一个 API 路由中。难以测试和扩展。
  **改进**:
- **Route Splitting**: 拆分为 `/api/sync/books`, `/api/sync/notes` 等，或者使用 GraphQL/RPC 风格的单一入口但内部模块化分发。

### 3.46 UI 交互逻辑的组件耦合 (UI Interaction Coupling)

**位置**: `src/components/Dialog.tsx`
**现状**:

- 复杂的拖拽逻辑直接写在组件通过 `useDrag` 钩子调用，与渲染逻辑混杂。
  **改进**:
- **Svelte Actions**: 将 DOM 交互逻辑（拖拽、按键监听、焦点捕获）提取为可复用的 Actions (`use:drag_dismiss`, `use:trap_focus`)。

### 3.47 原生调用的类型安全缺失 (Lack of Safety in Native Calls)

**位置**: `src/services/nativeAppService.ts` (implied)
**现状**:

- `invoke` 调用通常使用 loose types 或 `any`。Tauri v2 提供了更好的类型生成工具。
  **改进**:
- **Generated Types**: 使用 `tauri-specta` 或手动维护的严格类型定义，确保 JS 端与 Rust 端的参数/返回值完全匹配。

### 3.48 手动 DOM 注入 (Manual DOM Injection)

**位置**: `src/hooks/usePullToRefresh.ts`
**现状**:

- Hook 内部通过 `document.createElement` 创建并插入 Loading 指示器。这违反了声名式 UI 的原则，难以自定义样式。
  **改进**:
- **Component-driven**: Action 仅处理手势逻辑，通过 Slot 或 Prop 控制 Loading 指示器的显示，交由 Svelte 渲染引擎处理 DOM 更新。

### 3.49 复杂的表单锁定逻辑 (Complex Form Locking Logic)

**位置**: `src/components/metadata/BookDetailEdit.tsx`
**现状**:

- 字段的锁定状态 (`lockedFields`) 与字段值 (`metadata`) 是分离的状态对象，导致保存和重置逻辑复杂且易错。
  **改进**:
- **Rich Model**: 使用带有元数据的字段对象 (e.g. `{ value: string, locked: boolean, source: string }`)，统一管理字段的所有属性。

### 3.50 命令式组件句柄 (Imperative Component Handles)

**位置**: `src/components/TextEditor.tsx`
**现状**:

- 使用 `useImperativeHandle` 暴露 `getValue` 和 `focus` 方法。这是 React 中处理父子组件交互的“逃生舱”，但在 Svelte 中是反模式。
  **改进**:
- **Declarative Bindings**: 使用 `bind:value` 实现双向数据流，使用 `export function focus()` 暴露方法（如果确实必要），更推荐使用声明式状态控制聚焦。

### 3.51 路由架构分裂 (Split Routing Architecture)

**位置**: `src/pages` vs `src/app`
**现状**:

- 同时维护两套路由系统的约定（`_app.tsx` vs `layout.tsx`），增加了心智负担和上下文切换成本。
  **改进**:
- **Unified Routing**: 统一使用文件系统路由（SvelteKit default），利用 Layout Groups 处理不同区域（Reader vs Library）的布局差异。

### 3.52 过于宽泛的 Service Worker 缓存 (Broad SW Caching)

**位置**: `src/sw.ts`
**现状**:

- 对 `/library` 和 `/reader` 下的所有导航请求都使用了 `NetworkFirst` 策略，且过期时间长达 2 年（对于 script/style）。如果发版频繁，可能会导致旧版本缓存难以清除。
  **改进**:
- **Versioned Cache**: 使用 SvelteKit 的 `version` 环境变量作为 Cache Key 的一部分，确保新版本发布时立即让旧缓存失效。

### 3.53 目录结构扁平化不足 (Insufficient Directory Flattening)

**位置**: `src/app/reader`
**现状**:

- 平铺了 80+ 个文件，缺乏模块化组织，难以快速定位功能模块。
  **改进**:
- **Domain Division**: 按功能域分组（e.g. `reader/settings`, `reader/navigation`, `reader/annotations`）。

### 3.54 OPDS 状态管理混乱 (Chaotic OPDS State)

**位置**: `src/app/opds/page.tsx`
**现状**:

- 浏览历史 (`history`) 和当前视图状态 (`viewMode`) 混合在组件内部，导致很难从外部（如 Deep Link）恢复特定状态，也很难进行单元测试。
  **改进**:
- **FSM Store**: 将 OPDS 浏览逻辑提取为独立的 Store 状态机，与 UI 彻底解耦。

### 3.55 文件缓存策略硬编码 (Hardcoded File Caching)

**位置**: `src/utils/file.ts`
**现状**:

- `MAX_CACHE_ITEMS_SIZE` 和 `MAX_CACHE_CHUNK_SIZE` 是硬编码的静态属性，无法根据设备内存动态调整。
  **改进**:
- **Configurable Cache**: 允许在实例化 `NativeFile`/`RemoteFile` 时传入缓存配置，或者根据系统内存（Tauri API 可获取）动态调整缓存大小。

### 3.56 DOM 逻辑与计算耦合 (Coupling of DOM and Math)

**位置**: `src/utils/sel.ts`
**现状**:

- 几何计算（矩阵变换、坐标偏移）与 DOM 读取 (`getComputedStyle`, `getBoundingClientRect`) 混合在一起。难以在 Worker 或非 DOM 环境中测试计算逻辑。
  **改进**:
- **Logic Extraction**: 提取纯几何计算函数 (`Frame`, `Rect`, `Matrix` type definitions)，使 `sel.ts` 变成一个纯逻辑层，只接受数据对象而非 DOM 节点。

### 3.57 巨型图书馆组件 (Monolithic Library Component)

**位置**: `src/app/library/page.tsx`
**现状**:

- 单个文件承担了过多职责（UI, Sync, Import, Shortcuts），违反了单一职责原则，导致维护困难。
  **改进**:
- **Feature Splitting**: 将 "导入逻辑"、"选择模式逻辑"、"同步状态" 拆分为独立的 Svelte 5 Runes 类 (`ImportManager`, `SelectionManager`)。

### 3.58 硬编码的 iFrame 假设 (Hardcoded iFrame Assumptions)

**位置**: `src/utils/sel.ts`
**现状**:

- `getIframeElement` 假设特定的 DOM 结构来寻找父级 iframe。如果阅读器架构变更（例如不再使用 iframe 而使用 Shadow DOM），此逻辑将失效。
  **改进**:
- **Abstract Context**: 定义通用的上下文接口，不再依赖具体标签名。

### 3.59 复杂的 Provider 嵌套 (Provider Nesting Hell)

**位置**: `src/components/Providers.tsx`
**现状**:

- 即使是小型应用，也堆叠了 6-7 层 Context Provider。这在 React 中很常见，但在 Svelte 中是多余的。
  **改进**:
- **Context Flattness**: 利用 Svelte 的响应式 Store 和顶层 Layout 初始化，消除组件树中的 Provider 嵌套。

### 3.60 主线程繁重文本处理 (Heavy Text Processing on Main Thread)

**位置**: `src/services/transformers/proofread.ts`
**现状**:

- 文本校对逻辑（包括大量正则匹配）在主线程同步运行。对于长文本，这会造成 UI 掉帧。
  **改进**:
- **Workerize**: 强制所有文本 Transformer 在 Web Worker 中运行。

### 3.61 更新组件职责过重 (Overloaded Updater Component)

**位置**: `src/components/UpdaterWindow.tsx`
**现状**:

- 一个 UI 组件包含了网络请求、版本比较 (`semver`)、Markdown 解析、自动翻译 API 调用甚至文件系统操作。这是典型的 "God Component"。
  **改进**:
- **Logic Separation**: 将更新检查、日志翻译、文件下载拆分为 `UpdateService`。UI 层只应包含 `UpdateDialog.svelte`。

### 3.62 Edge TTS 协议硬编码 (Hardcoded Edge TTS Protocol)

**位置**: `src/libs/edgeTTS.ts`
**现状**:

- WebSocket 握手逻辑 (`Sec-MS-GEC`, `TrustedClientToken`) 与业务逻辑紧密耦合。如果 API 变动，整个类都需要修改。
  **改进**:
- **Protocol Driver**: 将底层协议封装为 `EdgeProtocolDriver`，业务层只关心 TTS 接口。

### 3.63 支付逻辑分散 (Scattered Payment Logic)

**位置**: `src/libs/payment`
**现状**:

- Stripe 和 IAP 的逻辑分散在不同目录，缺乏统一的 `PaymentProvider` 抽象层。调用方需要手动判断平台。
  **改进**:
- **Unified Provider**: 实现 `PaymentProvider` 接口，工厂模式根据平台返回实例。业务代码不应出现 `if (isAndrod)` 的支付逻辑。

### 3.64 样式生成逻辑耦合 (Coupled Style Generation)

**位置**: `src/components/settings/LayoutPanel.tsx`
**现状**:

- 组件不仅负责 UI 展示，还负责计算 CSS 值（如 `compactMarginTopPx` vs `marginTopPx`）并直接修改 DOM。
  **改进**:
- **Style Store**: 创建 `ReaderStyleStore`，输入为用户设置，输出为纯 CSS 变量对象。UI 组件只修改 Store，阅读器组件只消费 CSS 变量。

### 3.65 E-ink 逻辑硬编码 (Hardcoded E-ink Logic)

**位置**: `src-tauri/src/lib.rs`
**现状**:

- E-ink 设备的检测和优化逻辑（如背景色变白）硬编码在 Rust 初始化代码中，前端通过 `window.__READEST_IS_EINK` 获取。
  **改进**:
- **Capability Store**: 建立 `DeviceCapabilityStore`，前端通过 Tauri Command 动态查询设备特性，而不是依赖注入的全局变量。

### 3.66 支付协议拦截分散 (Scattered Payment Protocol Handling)

**位置**: `src-tauri/src/lib.rs`
**现状**:

- `alipays` 协议的拦截逻辑直接写在 `on_navigation` 回调中。
  **改进**:
- **Deep Link Manager**: 统一管理所有 Deep Link (`readest://`, `alipays://`) 的路由分发逻辑。

### 3.67 同步状态分散 (Fragmented Sync State)

**位置**: `src/hooks/useSync.ts`
**现状**:

- 同步状态 (`syncingBooks`, `syncingNotes` 等) 分散在多个 `useState` 中，容易导致竞态条件及 UI 展示不一致 (如 "Syncing..." 闪烁)。
  **改进**:
- **Atomic State**: 使用状态机 (FSM) 管理同步生命周期 (`IDLE` -> `SYNCING_METADATA` -> `SYNCING_CONTENT` -> `SUCCESS/ERROR`)。

### 3.68 图片缓存易失 (Volatile Image Cache)

**位置**: `src/components/CachedImage.tsx`
**现状**:

- 图片缓存仅存储在内存 Map 中 (`imageUrlCache`)。刷新页面后，所有封面图都需要重新获取（虽然浏览器有 HTTP 缓存，但在处理 Blob/Auth URL 时通常无效）。
  **改进**:
- **Cache API**: 利用浏览器的 Cache API 或 IndexedDB 存储封面图 Blob，支持离线浏览 Library。

### 3.69 翻译逻辑阻塞 UI (Translation Blocking UI)

**位置**: `src/hooks/useTranslator.ts`
**现状**:

- `translate` 函数等待所有文本翻译完成后才返回 (`Promise.all`)。对于长段落，用户感知延迟高。
  **改进**:
- **Incremental Update**: 修改 Store 支持增量更新，翻译完一句显示一句 (类似于流式响应)。

### 3.70 元数据 API 依赖 (Metadata API Dependency)

**位置**: `src/libs/metadata.ts`
**现状**:

- 即使是 Tauri 应用，也必须通过 `fetchWithAuth` 请求服务器端的 `/api/metadata/search`。这引入了不必要的网络延迟，且不支持离线搜索（如果用户有本地插件或 API Key）。
  **改进**:
- **Local Shim**: 在 Tauri 环境中，如果在“设置”中填入了用户自己的 API Key，应直接在本地调用 `MetadataService`，绕过服务器。

### 3.71 TTS 双重实现 (Dual TTS Implementation)

**位置**: `src/libs/edgeTTS.ts` 与 `src/app/api/tts/edge/route.ts`
**现状**:

- 客户端和服务端都实例化了 `EdgeSpeechTTS`。虽然代码复用，但维护了两套环境（Node.js Runtime vs Browser Runtime）的兼容性。
  **改进**:
- **Environment Agnostic**: 确保 `EdgeSpeechTTS` 严格遵循 Web Standards (`fetch`, `WebSocket`)，减少对特定 Runtime API (`node-fetch` vs `window.fetch`) 的依赖，利用 `cross-fetch` 或 SvelteKit 的 polyfills。

### 3.72 阅读器组件 Effect 迷宫 (Reader Component Effect Maze)

**位置**: `src/app/reader/components/FoliateViewer.tsx`
**现状**:

- 充斥着大量的 `useEffect` (20+ 个)，分别监听不同的 Props 变化（如 `isDarkMode`, `backgroundTexture`, `zoomLevel`）。这使得阅读器的更新逻辑极其难以追踪和调试。
  **改进**:
- **Runes Reactivity**: 利用 Svelte 5 的 Runes (`$effect`)，将相关联的副作用组合在一起。例如，样式相关的更新可以在一个 `$effect` 块中处理，自动追踪依赖。

### 3.73 脚注渲染开销 (Footnote Rendering Overhead)

**位置**: `src/app/reader/components/FootnotePopup.tsx`
**现状**:

- 每次显示脚注时，都会创建一个新的 `foliate-view` 实例并进行完整渲染。虽然只是显示一小段文本，但开销相对较大。
  **改进**:
- **Lightweight Renderer**: 对于简单的 HTML 脚注，直接解析并渲染 sanitized HTML，而不是启动完整的 Epub 渲染引擎。仅对复杂脚注（如包含图片或复杂布局）使用完整引擎。

### 3.74 手动样式注入 (Manual Style Injection)

**位置**: `src/styles/themes.ts` -> `applyCustomTheme`
**现状**:

- 使用 `document.createElement('style')` 手动管理主题 CSS。这在 SSR (服务端渲染) 场景下会导致闪烁 (FOUC)，且难以维护。
  **改进**:
- **CSS Variables Store**: 利用 Svelte 5 的响应性，将主题变量直接绑定到 `:root` 或 `<body>` 的 `style` 属性上 (`style:--primary={color}`)，或者生成内联 Critical CSS。

### 3.75 复杂的手势 Hook (Complex Gesture Hooks)

**位置**: `src/app/reader/hooks/useInstantAnnotation.ts`
**现状**:

- 所有的 Pointer Event 处理逻辑都耦合在 React Hook 中，不仅处理数据逻辑（创建高亮），还处理视图逻辑（计算坐标、绘制临时高亮）。
  **改进**:
- **Decoupled Logic**: 将几何计算逻辑（坐标 -> Range）提取为纯函数。UI 交互逻辑作为 Action 挂载到 DOM 元素上。业务逻辑（保存高亮）通过 Store 方法调用。

### 3.76 同步文本转换阻塞 (Blocking Text Transformation)

**位置**: `src/services/transformers`
**现状**:

- 所有的 Transformer（包括繁简转换、复杂的正则替换）都在主线程同步运行。对于大章节，这会导致明显的掉帧。
  **改进**:
- **Web Worker Offload**: 必须将所有 `Transformer` 逻辑移至 Worker 线程。主线程只负责发送文本和接收处理后的 HTML。

### 3.77 支付逻辑各平台耦合 (Coupled Payment Logic)

**位置**: `src/libs/payment/iap/client.ts`
**现状**:

- 虽然试图抽象，但代码中仍有大量的 `if (Platform === 'ios')` 等判断，难以扩展新的支付方式（如 Alipay Desktop）。
  **改进**:
- **Strategy Pattern**: 使用策略模式完全分离各平台的支付实现。核心业务逻辑只与抽象接口交互。

### 3.78 KOReader 同步逻辑耦合 (KOReader Sync Coupling)

**位置**: `src/app/reader/hooks/useKOSync.ts`
**现状**:

- 同步逻辑与 UI 提示 (`toast`, `prompt`) 深度耦合。转换逻辑 (`XCFI`) 混杂在 Hook 中。
  **改进**:
- **Background Sync**: 将 KOReader 同步完全移入后台服务（或 Service Worker）。UI 仅响应 Store 的状态变化（如 `lastSyncedAt` 更新）。

### 3.79 快捷键事件总线 (Event Bus for Shortcuts)

**位置**: `src/app/reader/hooks/useBookShortcuts.ts`
**现状**:

- 使用自定义的 `eventDispatcher` (`CustomEvent`) 来触发 zoom 等操作，绕过了 React 的状态流。这使得追踪数据流变得困难。
  **改进**:
- **Direct Store Actions**: 快捷键应直接调用 Store 的 Action (如 `readerStore.zoomIn()`)，而不是广播事件。仅在跨组件边界（如 iframe 通信）时使用事件。

### 3.80 标注器职责过载 (Annotator Overload)

**位置**: `src/app/reader/components/annotator/Annotator.tsx`
**现状**:

- 单个文件承担了过多的职责：它是事件监听器、是绘图控制器、也是 UI 容器。修改任何一个小功能（如更改高亮颜色逻辑）都有可能破坏选择逻辑。
  **改进**:
- **Separation of Concerns**: 严格分离 `Input` (Events), `State` (Selection), `Output` (Drawing), `UI` (Popup)。

### 3.81 侧边栏物理动画缺失 (No Physics in Sidebar)

**位置**: `src/app/reader/components/sidebar/SideBar.tsx`
**现状**:

- 使用简单的 CSS `transition` 和 `setTimeout` 来处理侧边栏的关闭动画，这就导致在快速拖拽时手感生硬（linear movement）。
  **改进**:
- **Spring Animation**: 使用基于物理的弹簧动画（Svelte Motion），让侧边栏的拖拽和回弹更符合直觉。

### 3.82 搜索逻辑与 UI 耦合 (Search Logic Coupling)

**位置**: `src/app/reader/components/sidebar/SearchBar.tsx`
**现状**:

- 搜索算法（迭代 generator）直接写在组件的 `handleSearch` 方法中。如果想在全局搜索或后台搜索中使用相同逻辑，将无法复用。
  **改进**:
- **Service Extraction**: 提取 `BookSearchService`，使其接受 `bookKey` 和 `query`，返回一个 `Observable` 或 `Store`，UI 仅订阅结果。

### 3.83 服务层返回类型不一致 (Service Return Inconsistency)

**位置**: `src/services/appService.ts`
**现状**:

- 某些方法返回 `Promise<File>`, 某些返回 `Promise<string>` (Path)，某些直接抛出异常。错误处理策略在 Native 和 Web 实现之间不一致。
  **改进**:
- **Unified Result Type**: 使用 `Result<T, E>` 模式（类似 Rust）来标准化服务层的返回值，强制调用方处理错误。

### 3.84 更新逻辑阻塞 (Blocking Updater)

**位置**: `src/components/UpdaterWindow.tsx`
**现状**:

- 检查更新和下载逻辑在组件 Effect 中运行。如果网络请求挂起，可能会导致组件渲染阻塞或白屏。
  **改进**:
- **Background Worker**: 将更新检查和下载移至 Shared Worker 或 Rust 后台线程。前端只显示进度条。

### 3.85 手动 Auth 同步冗余 (Redundant Auth Sync)

**位置**: `src/context/AuthContext.tsx`
**现状**:

- 代码手动监听 `onAuthStateChange` 并将 Tokens 写入 `localStorage`。实际上 Supabase JS Client 默认就会处理持久化。
  **改进**:
- **Native Persistence**: 配置 Supabase Client 使用 `AsyncStorage` (Tauri) 或 `localStorage` (Web)，移除手动同步代码，减少状态不一致的风险。

### 3.86 支付逻辑混杂在 UI 中 (Payment Logic in UI)

**位置**: `src/app/user/page.tsx`
**现状**:

- `handleStripeSubscribe` 和 `handleIAPSubscribe` 等核心支付流程逻辑直接写在 UI 组件中。
  **改进**:
- **Payment Controller**: 将支付流程提取到 `PaymentController` 或 `PaymentStore` 中，处理复杂的异步状态（Loading, Error, Success Redirect）。

### 3.87 全局变量注入隐患 (Global Variable Injection)

**位置**: `src-tauri/src/lib.rs`
**现状**:

- Rust 端通过 `window.eval("window.OPEN_WITH_FILES = ...")` 注入数据。这种方式在现代前端框架中容易造成 Race Condition（前端初始化早于注入）。
  **改进**:
- **Event Driven**: 改为 Rust 发送 `file-opened` 事件，前端监听该事件，而不是依赖全局变量注入。

### 3.88 更新检查逻辑分散 (Scattered Updater Logic)

**位置**: `src/helpers/updater.ts` vs `src/components/UpdaterWindow.tsx`
**现状**:

- 更新检查逻辑分散在两个地方，Android 和 Desktop 的处理逻辑不一致。
  **改进**:
- **Unified Strategy**: 建立统一的 `UpdateStrategy` 接口，屏蔽平台差异（GitHub API vs JSON Manifest）。

### 3.89 硬编码的缓存策略 (Hardcoded SW Config)

**位置**: `src/sw.ts`
**现状**:

- 缓存策略（如 `maxAgeSeconds`）硬编码在文件中，难以根据用户偏好（如“节省数据模式”）调整。
  **改进**:
- **Dynamic Policy**: 虽然 SW 构建时是静态的，但可以通过 postMessage 从主线程传递配置，动态调整运行时缓存行为（如暂停预加载）。

### 3.90 CORS 手动处理 (Manual CORS)

**位置**: `src/middleware.ts`
**现状**:

- 手动拼接 CORS 头，容易遗漏 OPTIONS 请求处理。
  **改进**:
- **Standard Middleware**: 使用标准库（如 `cors` 包或 SvelteKit `handle` 中的标准模式）来处理跨域请求。

### 3.91 同步逻辑与组件生命周期耦合 (Sync Logic Coupling)

**位置**: `src/hooks/useSync.ts`
**现状**:

- 同步触发逻辑绑定在 `useEffect` 中，依赖 React 组件的挂载/卸载。这使得在后台或 Service Worker 中继续同步变得困难。
  **改进**:
- **Independent Service**: 将同步逻辑解耦为独立服务，可以在组件树之外运行（例如在 Web Worker 或后台任务中）。

### 3.92 翻译配额检查硬编码 (Hardcoded Quota Check)

**位置**: `src/hooks/useTranslator.ts`
**现状**:

- 代码通过检查错误消息字符串 (`err.message.includes(...)`) 来判断是否超出配额。这种脆弱的字符串匹配容易在 API 变更时失效。
  **改进**:
- **Structured Error**: 定义明确的 `QuotaExceededError` 类型，并在 Service 层抛出，UI 层通过 `instanceof` 或错误代码来捕获处理。

### 3.93 书架页面逻辑臃肿 (God Component LibraryPage)

**位置**: `src/app/library/page.tsx`
**现状**:

- 单个文件超过 800 行，混合了 UI 布局、数据获取、文件系统操作、同步逻辑和更新检查。
  **改进**:
- **Separation of Concerns**: 严格遵循 MVVM 或 MVC 模式，将数据逻辑移至 Store/Controller，UI 只负责展示。

### 3.94 缺乏列表虚拟化 (Lack of Virtualization)

**位置**: `src/app/library/components/Bookshelf.tsx`
**现状**:

- 在拥有大量书籍时，直接渲染所有 DOM 节点会导致页面卡顿，尤其是在移动设备或 Electron/Tauri 低端设备上。
  **改进**:
- **Virtual Scroll**: 引入虚拟滚动机制，只渲染视口内的书籍元素。

### 3.95 导航逻辑碎片化 (Fragmented Navigation Logic)

**位置**: `src/app/reader/components/footerbar/FooterBar.tsx` vs `src/hooks/useShortcuts.ts`
**现状**:

- 翻页和跳转逻辑在 UI 组件和快捷键 Hook 中重复实现。修改一处容易遗漏另一处（例如添加翻页动画时）。
  **改进**:
- **Centralized Command**: 建立统一的导航命令中心，UI 和快捷键都只是触发命令的入口。

### 3.96 Markdown 安全隐患 (Markdown Security)

**位置**: `BooknoteItem.tsx`
**现状**:

- 使用 `dangerouslySetInnerHTML` 渲染 `marked.parse` 的结果。虽然 `marked` 有一定防护，但缺乏统一的 Sanitization 策略。
  **改进**:
- **Sanitized Component**: 建立强制 Sanitization 的 Markdown 组件，防止 XSS 攻击（尤其是在引入云端共享笔记功能后）。

### 3.97 TTS 控制器与 UI 耦合 (TTS Logic Coupling)

**位置**: `src/app/reader/components/tts/TTSControl.tsx`
**现状**:

- TTS 的生命周期管理（Init, Speak, Stop）与 UI 组件的挂载状态绑定。切换页面可能导致 TTS 意外停止。
  **改进**:
- **Global Background Service**: TTS Service 应该在全局上下文中运行（类似 Spotify 播放器），UI 只是一个遥控器。

### 3.98 硬编码的文件路径逻辑 (Hardcoded Paths)

**位置**: `src/services/nativeAppService.ts`
**现状**:

- `getPathResolver` 中硬编码了 `Settings`, `Data`, `Books` 等目录名。如果未来目录结构调整，修改成本高。
  **改进**:
- **Configuration Driven**: 将目录结构配置提取到单独的 `DirectoryConfig` 文件中，或从 Rust 后端动态获取配置。

### 3.99 开放的 OPDS 代理风险 (Open Proxy Risk)

**位置**: `src/app/api/opds/proxy/route.ts`
**现状**:

- OPDS 代理接口没有严格的鉴权限制（虽然检查了 auth 参数，但未校验 Session），可能被滥用于访问内网资源或作为跳板。
  **改进**:
- **Authentication Guard**: 强制要求用户登录后才能使用 Proxy 服务。设置请求频率限制 (Rate Limiting)。

### 3.100 客户端 WebSocket 密钥暴露 (Client-Side Secrets)

**位置**: `src/libs/edgeTTS.ts`
**现状**:

- `EDGE_API_TOKEN` (TrustedClientToken) 被硬编码在客户端代码中。虽然是公共 Token，但最好隐藏在服务端。
  **改进**:
- **Server-Side Only**: 强制 Edge TTS 的 WebSocket 连接只在服务端进行，客户端只接收音频流。

### 3.101 手动样式注入性能差 (Manual Style Injection)

**位置**: `src/styles/themes.ts`
**现状**:

- 每次切换主题时，`applyCustomTheme` 会创建并插入新的 `<style>` 标签。这会导致浏览器重排 (Reflow)。
  **改进**:
- **CSS Variables**: 将所有主题变量定义为 CSS Variables，仅通过修改 `html` 标签的 `data-theme` 属性来切换值，由 CSS 引擎原生处理。

### 3.102 脆弱的更新日志解析 (Fragile Changelog Parsing)

**位置**: `src/components/UpdaterWindow.tsx`
**现状**:

- `parseNumberedList` 使用简单的正则拆分更新日志，对于复杂的 Markdown 格式容易失效。
  **改进**:
- **Structured Data**: 更新接口 (`READEST_UPDATER_FILE`) 应返回结构化的 JSON 数据，包含 title, date, notes 数组，而不是纯文本或 Markdown 字符串。

### 3.103 主线程繁重计算 (Heavy Computation on Main Thread)

**位置**: `src/utils/txt.ts`
**现状**:

- TXT 解析（正则匹配数十万字）和 ZIP 打包都在 UI 线程执行。这会导致大文件导入时界面假死。
  **改进**:
- **Web Worker**: 强制将所有文件转换逻辑移至 Web Worker。

### 3.104 脆弱的 CSS 正则处理 (Fragile CSS Regex)

**位置**: `src/utils/style.ts` (`transformStylesheet`)
**现状**:

- 使用正则表达式处理 CSS 字符串（如移除 `text-align: center`），容易误伤或处理不彻底（例如注释中的代码）。
  **改进**:
- **CSS Parser**: 使用真正的 CSS AST 解析器（如 `css-tree` 或 `postcss` 的浏览器版本）来安全地转换用户样式表。

### 3.105 硬编码的 Tauri 配置 (Hardcoded Config)

**位置**: `src-tauri/tauri.conf.json`
**现状**:

- CSP策略 (`security.csp`) 和文件关联 (`fileAssociations`) 硬编码在 `tauri.conf.json` 中，不够灵活。
  **改进**:
- **Capability Based**: 使用 Tauri v2 的 Capabilities 系统，根据不同构建目标（AppStore vs Sideload）动态应用不同的权限集合。

### 3.106 上帝类反模式 (God Object Patterns)

**位置**: `src/services/appService.ts`
**现状**:

- `AppService` 承担了太多的职责（FS, Settings, Import, Cloud Sync），导致代码行数超过 900 行，且难以测试。
  **改进**:
- **Composition**: 拆分职责到独立的小型服务中，`AppService` 仅作为外观模式 (Facade) 或完全移除。

### 3.107 Web 端文件系统性能瓶颈 (IndexedDB FS Performance)

**位置**: `src/services/webAppService.ts` (`readDir`)
**现状**:

- `readDir` 实现是通过 `store.getAll()` 获取**所有**文件，然后并在内存中过滤路径。随着文件数量增加（例如缓存了 1000 本书），这将导致巨大的性能开销和内存占用。
  **改进**:
- **Thumbnails/Indices**: 为文件系统每一层目录建立索引，或使用 `IDBKeyRange` 进行范围查询，避免全表扫描。

### 3.108 DOM 操作副作用 (DOM Side Effects in Logic)

**位置**: `src/hooks/useFileSelector.ts` (`selectFileWeb`)
**现状**:

- 为了选择文件，代码动态创建 `<input>` 元素并添加到 `body`，然后监听 `onchange`。这是一种命令式的 DOM 操作，难以测试且容易残留垃圾元素。
  **改进**:
- **Declarative Component**: 使用 Svelte 的声明式组件 `<FilePicker bind:this={picker} />`，通过组件方法触发文件选择。

### 3.109 零散的辅助函数 (Scattered Helpers)

**位置**: `src/helpers/*`
**现状**:

- `helpers` 目录逐渐变成了一个杂乱的“大杂烩”，存放了各种无处安放的逻辑。这违反了高内聚原则。
  **改进**:
- **Service Encapsulation**: 将业务逻辑归类到相关的 Service 或 Store 中，废除 `helpers` 目录。

### 3.110 WebSocket 连接管理 (WebSocket Connection Management)

**位置**: `src/libs/edgeTTS.ts`
**现状**:

- `EdgeSpeechTTS` 在每次请求时通过 `fetchEdgeSpeechWs` 创建新的 WebSocket 连接，或者使用复杂的逻辑生成 Auth Token。频繁握手会增加延迟。
  **改进**:
- **Persistent Connection**: 在 `PlatformService` 中维护一个长连接池，复用 WebSocket 连接以提高 TTS 响应速度。

### 3.111 文档加载器抽象漏洞 (Document Loader Leaks)

**位置**: `src/libs/document.ts`
**现状**:

- `DocumentLoader` 类直接依赖 `zip.js` 和 `foliate-js` 的具体实现，并且混合了文件类型检测逻辑。
  **改进**:
- **Factory Pattern**: 使用 `DocumentLoaderFactory` 根据 MIME 类型返回专门的 Loader 实例 (e.g. `EpubLoader`, `PdfLoader`)，遵循开闭原则。

### 3.112 混合的 API 路由风格 (Mixed API Styles)

**位置**: `src/pages/api/*`
**现状**:

- 现有的 API 路由混合了 Next.js 的 Page Router 风格。
  **改进**:
- **Unified Handlers**: 在迁移到 SvelteKit 时，统一使用标准 Request/Response API，并严格区分 `GET`/`POST`/`PUT`/`DELETE` handler。

### 3.113 书库视图性能瓶颈 (Library View Performance)

**位置**: `src/app/library/page.tsx`, `Bookshelf.tsx`
**现状**:

- `Bookshelf` 组件使用 `.map()` 直接渲染所有书籍卡片。对于拥有数千本书的用户，这将导致 DOM 节点爆炸，显著降低滚动帧率和内存使用。
- 搜索逻辑 (`createBookFilter`) 是纯前端正则匹配，随数据量线性增长。
  **改进**:
- **Virtualization**: 必须引入虚拟滚动列表/网格。
- **Worker Search**: 将搜索逻辑移至 Web Worker，避免阻塞主线程 UI。

### 3.114 阅读器事件监听混乱 (Reader Event Chaos)

**位置**: `src/app/reader/components/FoliateViewer.tsx`
**现状**:

- `useEffect` 中手动绑定了大量 DOM 事件 (`keydown`, `mouseup` etc.) 到 iframe 的 `contentDocument`。代码这种命令式绑定难以维护且容易造成内存泄漏。
  **改进**:
- **Declarative Actions**: 使用 Svelte Actions 将事件监听声明式地绑定到 DOM 节点，自动处理销毁逻辑。

### 3.115 阻塞式 Provider 渲染 (Blocking Provider Rendering)

**位置**: `src/components/Providers.tsx`
**现状**:

- `if (!appService) return;` 这一行代码导致整个应用在 `appService` 初始化完成前完全空白（甚至没有 Loading Indicator）。
  **改进**:
- **Skeleton Screens**: 移除根级别的阻塞返回，允许 App Shell 先渲染，内部组件使用 Suspense 或 Loading State。

### 3.116 复杂的样式注入逻辑 (Complex Style Injection)

**位置**: `src/utils/style.ts`
**现状**:

- 通过 JS 字符串拼接和 Regex 替换来生成 CSS，然后注入到 DOM 中。这种 "CSS-in-JS-via-String" 的方式极其脆弱且难以调试。
  **改进**:
- **CSS Variables**: 尽可能多地使用 CSS 变量。
- **Structured CSS Generation**: 如果必须动态生成 CSS，使用更加结构化的方式（如对象到 CSS 字符串的更严格的转换器），而不是不可靠的 Regex。

### 3.117 原生 API 调用的分散 (Scattered Native API Calls)

**位置**: `src/app/reader/components/Reader.tsx`
**现状**:

- `Reader.tsx` 直接在副作用中调用 `interceptWindowOpen`, `getSysFontsList` 等 Native Bridge 函数。
  **改进**:
- **Platform Lifecycle**: 将平台特定的初始化逻辑（字体加载、窗口拦截）封装到 `PlatformService` 的生命周期钩子中，而不是散落在 UI 组件里。

### 3.118 URL 状态管理的手动同步 (Manual URL State Sync)

**位置**: `src/app/library/page.tsx`
**现状**:

- 使用 `updateUrlParams` 手动构建 Search Params 字符串并 Push Router。
  **改进**:
- **Svelte Kit Binding**: 利用 SvelteKit 的 Form Actions 或直接绑定 Search Params 状态，使 URL 状态管理更加声明式。

### 3.119 同步逻辑耦合 (Coupled Sync Logic)

**位置**: `src/hooks/useSync.ts`
**现状**:

- 同步逻辑与 React Component Lifecycle (`useEffect`) 深度绑定。这意味着如果组件卸载（例如切换页面），同步可能会中断或行为不可预测。
  **改进**:
- **Background Service**: 将同步状态机移至全局上下文或 Web Worker，使其独立于 UI 组件生命周期运行。

### 3.120 脆弱的 DOM 依赖 (Fragile DOM Dependency)

**位置**: `src/utils/xcfi.ts`
**现状**:

- 严重依赖 `document.createRange` 和 DOM 遍历。这使得在非浏览器环境（如 Node.js 测试环境或 Web Worker）中难以运行。
  **改进**:
- **Abstraction**: 尝试抽象 DOM 操作接口，虽然对于 `Range` API 来说很难，但至少应确保有完善的 JSDOM 测试覆盖。

### 3.121 样式生成的维护噩梦 (Style Generation Nightmare)

**位置**: `src/utils/style.ts`
**现状**:

- 超过 600 行的字符串拼接代码用来生成 CSS。Regex 替换 (`css.replace(...)`) 用于后处理 CSS，极易出错且性能低下。
  **改进**:
- **CSS Architecture**: 重构为基于 CSS Variables 的系统。仅在 JS 中修改 Variables 的值，而不是重新生成整段 CSS 字符串。

### 3.122 全局 E-Ink 样式覆盖 (Global E-Ink Overrides)

**位置**: `src/styles/globals.css`
**现状**:

- 使用 `[data-eink="true"]` 进行大规模的样式强行覆盖 (`!important` 到处都是)。
  **改进**:
- **CSS Component Layer**: 在组件层面设计 E-Ink 变体，或者使用 Tailwind 的 Variant 系统来更优雅地处理 E-Ink 样式。

### 3.123 状态管理碎片化 (Fragmented State Management)

**位置**: `src/store/*`
**现状**:

- 状态分散在多个 Zustand Store 中，且部分状态逻辑（如 `computed`）在 Hook 中实现，导致逻辑分散。
  **改进**:
- **Unified State Model**: 在 Svelte 5 中利用 Runes 的组合性，构建更连贯的状态树。

### 3.124 OPDS 巨型组件 (Giant OPDS Component)

**位置**: `src/app/opds/page.tsx`
**现状**:

- 单个文件承载了过多的职责：Data Fetching (Auth handling), XML Parsing, UI Rendering (Multiview), History Management。
  **改进**:
- **Separation of Concerns**: 提取 `OpdsClient` 类专门处理网络请求和解析。UI 组件只负责展示数据。历史记录逻辑移至专门的 `HistoryStore`。

### 3.125 硬编码 API 端点 (Hardcoded API Endpoints)

**位置**: `src/libs/storage.ts`
**现状**:

- `API_ENDPOINTS` 对象直接拼接 `getAPIBaseUrl()` 和路径字符串。
  **改进**:
- **Configurability**: 使用 SvelteKit 的 Environment Variables (`PUBLIC_API_URL`)，或者由服务端提供的配置接口来动态决议端点。

### 3.126 平台分支逻辑扩散 (Scattered Platform Logic)

**位置**: `src/libs/storage.ts`, `src/app/opds/page.tsx`
**现状**:

- 代码中充斥着 `if (isWebAppPlatform())` 的判断分支。
  **改进**:
- **Adapter Pattern**: 使用适配器模式。定义统一的 `StorageAdapter` 接口，根据环境注入 `WebStorageAdapter` 或 `TauriStorageAdapter`。调用方（UI）不需要知道当前在哪个平台，只管调用 `adapter.download()`。
