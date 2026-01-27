# Svelte 5 终极迁移指南：全系统架构重构 (V8)

本文档基于对 `apps/readest-app` 全量源码（包括隐藏的 `utils/event.ts` 和底层 Hooks）的深度审计，是整个迁移工程的**执行蓝图**。

## 第一部分：基础设施与核心模式 (Infrastructure & Patterns)

### 1.1 "事件总线" (Event Bus) 的消亡

**现状**: `src/utils/event.ts` 定义了一个单例 `EventDispatcher`，用于处理 `toast`, `native-touch`, `iframe-click` 等全局事件。
**缺陷**:

- **隐式依赖**: 组件过度依赖全局副作用，数据流向不透明。
- **同步黑盒**: `dispatchSync` 实现了一套非标准的事件冒泡机制。
  **Svelte 5 迁移方案**:
- **Toast/Notification**: 迁移至 `ToastService.svelte.ts` (Store)。
- **跨组件通信**: 使用 Svelte 标准的 **Events** (`onmessage`) 或 **Context API**。
- **Native Bridge**: 将 `native-touch` 等事件转换为标准的 `window.dispatchEvent`，利用 Svelte 的 `<svelte:window on:native-touch={...} />` 统一监听。

### 1.2 `TransferManager` (传输层重构)

参考之前的分析，将 `TransferManager` 重构为 **TransferService**，并移除对 `transferStore` 的依赖，实现"服务持有状态"的模式。建议将大文件传输逻辑移至 Shared Worker。

### 1.3 `AppService` (平台抽象)

保留 DI 模式。重点是重写 `NativeAppService` 以适配 Tauri v2 API。**关键任务**是将 `resolvePath` 等复杂逻辑提取为纯函数库。

---

## 第二部分：数据层 (Data Layer)

### 2.1 响应式数据库 (Reactive Database)

- **目标**: 废弃 `libraryStore` 中的手动 `refreshGroups`。
- **实现**: `LibraryService` 内部使用 `dexie.liveQuery`。

  ```typescript
  // LibraryService.svelte.ts
  class LibraryService {
    books = $state<Book[]>([]);

    constructor() {
      $effect(() => {
        const sub = liveQuery(() => db.books.toArray()).subscribe((data) => {
          this.books = data;
        });
        return () => sub.unsubscribe();
      });
    }
  }
  ```

### 2.2 API 路由迁移 (API Routes)

将 Next.js API Routes 迁移至 SvelteKit Endpoints (`+server.ts`)。**特别注意** Request Body 的读取方式差异。

---

## 第三部分：UI 组件系统 (UI Component System)

### 3.1 虚拟化列表 (Virtualization)

**强制应用场景**:

- `Bookshelf` (主书库)。
- `SearchResults` (搜索侧边栏)。
- `TOCView` (目录)。
  **方案**: `@tanstack/svelte-virtual`。对于嵌套列表（如搜索结果的分组），需要将其"扁平化"后由 Virtualizer 渲染，或使用能够处理分组的虚拟化方案。

### 3.2 交互原语 (Interaction Primitives)

将 `src/hooks/*.ts` 转换为 Svelte Actions:

- `useDrag` -> `use:draggable`
- `useTextSelector` -> `use:textSelection`
- `useScrollToItem` -> `use:scrollIntoView`

### 3.3 图片与媒体 (Media)

- 废弃 `CachedImage.tsx` 的全局 Map 缓存。
- 使用 Service Worker 处理图片缓存。
- 实现 `<Image>` 组件，封装加载状态和错误回退 (使用 Snippets)。

---

## 第四部分：实施阶段 (Implementation Phases)

### Phase 1: 核心重构 (Core Refactor) - Week 1-2

- [ ] 初始化 SvelteKit + Tauri v2。
- [ ] 搭建 `AppService` and `PathResolver`。
- [ ] 实现 `ReaderState` (Store) and `LibraryService` (Store)。
- [ ] **移除 Event Bus**，建立 `ToastService`。

### Phase 2: 基础 UI (Basic UI) - Week 3

- [ ] 移植所有基础原子组件 (`Button`, `Dialog` 等)。
- [ ] 实现 `SettingsManager` 和设置面板。
- [ ] 移植 `MigrateData` 窗口逻辑。

### Phase 3: 书库与阅读器 (Library & Reader) - Week 4-5

- [ ] 实现虚拟化 `Bookshelf`。
- [ ] 移植 `FoliateViewer`，实现基于 Action 的生命周期管理。
- [ ] 重写 `Annotator`，使用 `@floating-ui` 和状态机。

### Phase 4: 高级功能与优化 (Advanced) - Week 6

- [ ] 移植 `TransferService` (Worker)。
- [ ] 实现 `SearchResults` 和 `TOC` 的虚拟化。
- [ ] 全局样式注入系统 (`svelte:head`)。
- [ ] E2E 测试与性能调优。
- [ ] **Search & Transformer Offloading** (Worker)。

---

## 第五部分：安全与底层设施重构 (Security & Low-Level Infrastructure)

### 5.1 严重安全隐患：云存储凭证泄露

**现状**: `src/utils/r2.ts` 和 `src/utils/s3.ts`直接在前端代码中读取 `R2_SECRET_ACCESS_KEY` 等环境变量。
**风险**: 任何使用了这些工具函数的组件，都会将管理员密钥下发到客户端浏览器，黑客可直接提取并接管整个存储桶。
**Svelte 5 修复方案**:

- **服务端隔离**: 将所有 AWS/R2 相关逻辑移动到 `src/lib/server/storage.ts`。
- **API 代理**:
  - 前端请求: `POST /api/storage/presign`
  - 仅仅返回 **Presigned URL** 给前端，绝不暴露 Key。

### 5.2 DeepL API 的合规性重构

**现状**: `src/utils/deepl.ts` 似乎在使用非官方的 JSON-RPC 接口（逆向工程），包含复杂的 `timestamp` 和 `id` 伪造逻辑 (Lines 28-59)。
**风险**: 这种方式极不稳定，DeepL 随时可能升级接口封锁此类请求，导致翻译功能全线瘫痪。
**方案**:

- **短期**: 封装为 Server Layer，至少在服务端发起请求，避免 CORS 问题。
- **长期**: 迁移至官方 API 或其他合规翻译服务。

### 5.3 文件系统适配 (Tauri v2)

**现状**: `src/utils/file.ts` 中的 `NativeFile` 极其复杂，手动实现了分片缓存、Seek 逻辑。
**问题**:

- 它是基于 Tauri v1 的思维构建的。Tauri v2 的 FS 插件已经支持了 Streaming 和更高效的 Access。
- `RemoteFile` (Line 265) 试图解决 Android WebView 的 Range Request Bug，但这应该由 Protocol Layer 解决，而不是应用层。
  **方案**:
- **简化**: 使用 `@tauri-apps/plugin-fs` 的 `readFile` (返回 Uint8Array)，结合 Svelte 的 Stream 处理。
- **上传优化**: 使用 `@tauri-apps/plugin-upload` 插件进行大文件上传，避免将整个文件读入 WebView 内存。

---

## 第六部分：多媒体与渲染性能深度优化 (Media & Rendering Optimization)

### 6.1 TTS (语音朗读) 架构重构

**现状**: `src/app/reader/components/tts/TTSControl.tsx` 是一个 700+ 行的巨型组件，混合了 UI、音频会话管理、iOS 后台保活 Hack (`unblockAudio`) 和定时器逻辑。
**缺陷**:

- **生命周期绑定**: TTS 逻辑绑定在 UI 组件上。一旦用户切换路由离开阅读器，组件卸载，TTS 即停止。
- **保活 Hack 脆弱**: `unblockerAudioRef` (Line 73) 依赖 DOM 元素，容易被浏览器回收资源。
  **Svelte 5 迁移方案**:
- **Global Service**: 将 `TTSController` 提升为全局单例服务 `TTSService`，在 `src/routes/+layout.ts` 中初始化。
- **Media Session**: 将 `initMediaSession` 逻辑移入 `TTSService`。
- **Audio KeepAlive**: 创建一个极其轻量的 `<AudioGuard />` 组件仅负责播放静音音频，或者使用 Worker 播放。

### 6.2 动态 CSS 注入性能优化

**现状**: `src/utils/style.ts` 中的 `transformStylesheet` (Line 617) 使用正则表达式在主线程即时解析和修改 CSS 字符串。
**风险**:

- **主线程阻塞**: 对于包含复杂 Base64 图片或数千行的大型 CSS 文件，Regex 替换操作会导致掉帧。
- **逻辑脆弱**: 正则表达式 `/([^{]+)({[^}]+})/g` 无法正确处理嵌套的大括号 (如 `@media`)，可能破坏用户样式。
  **方案**:
- **Web Worker**: 必须将 CSS 文本处理逻辑移至 Worker。
- **CSS Parser**: 考虑引入轻量级 CSS Parser (如 `csstree` 的微内核版) 替代正则匹配，或者在服务端/导入时预处理。

---

## 第七部分：启动性能与全局状态优化 (Startup & State)

### 7.1 "Context Hell" 与启动闪烁

**现状**: `src/components/Providers.tsx` 在 `useEffect` 中异步加载设置 (`appService.loadSettings()`)。
**缺陷**:

- **FOUT (Flash of Unstyled Text)**: 应用先渲染默认 UI，几百毫秒后才应用用户设置的主题和语言。
- **Context 嵌套**: React 需要层层嵌套 Provider。
  **Svelte 5 迁移方案**:
- **Layout Load**: 利用 SvelteKit 的 `src/routes/+layout.ts` `load` 函数。
- **阻塞渲染**: 在 `await loadSettings()` 完成前不渲染 Slot，从根本上杜绝启动闪烁。

### 7.2 Updater 组件通信重构

**现状**: `UpdaterWindow.tsx` 使用 `document.getElementById(...).dispatchEvent` (Line 441) 来控制自身的显示/隐藏。
**反模式**: 这是在 React 内部使用原生 DOM 事件进行组件间通信，违背了声明式 UI 原则。
**方案**:

- **UpdaterStore**: 创建 `updater` store，包含 `checkUpdate()`, `availableVersion`, `showDialog` 等状态。
- **Reactive UI**: 组件只需订阅 `$updater.showDialog`。

### 7.3 EdgeTTS 内存管理

**现状**: `src/libs/edgeTTS.ts` 内部维护了含有 200 个 Blob 的 LRU Cache。
**风险**: 虽然有 LRU，但每个音频片段可能是几 MB 的 Blob，200 个片段可能占用数百 MB 内存，导致移动端崩溃。用户使用 `URL.createObjectURL` 但仅在 Cache 驱逐时释放，这依赖于 JS 垃圾回收的及时性。
**方案**:

- **按需释放**: 播放完毕即释放 Blob，不进行长时间缓存，或者大幅降低 LRU 容量（如 20）。
- **IndexedDB**: 如果需要持久化缓存，存入 Dexie 而非内存 Blob。

---

## 第八部分：状态管理与国际化深度优化 (State & I18n)

### 8.1 状态同步与副作用解耦

**现状**: `readerStore.ts` 中的 `setProgress` (Line 284) 不仅更新自身状态，还手动调用 `useLibraryStore.getState().setLibrary` 和 `useBookDataStore.setState`。
**缺陷**:

- **Store 耦合**: Store 之间形成了隐式的"意大利面条式"调用网。
- **数据一致性**: 如果 `setLibrary` 失败或抛出异常，`readerStore` 的状态可能已经更新，导致 UI 不一致。
  **Svelte 5 迁移方案**:
- **单一数据源**: `LibraryService` (IndexedDB) 是唯一的真理来源。
- **Reactive Binding**: `Reader` 组件仅仅是订阅 `$book.progress`。当进度变化时，调用 `book.updateProgress()` 方法，该方法原子化地更新 DB 并同步到云端。

### 8.2 国际化 (I18n) 构建优化

**现状**: `src/i18n/i18n.ts` 使用了运行时动态导入 (`import('i18next-http-backend')`) 且包含了 `isBrowser` 的环境判断。
**缺陷**:

- **SSR 兼容性差**: 在服务端渲染时需要特殊的 polyfill。
- **Bundle 体积**: 包含了完整的 `i18next` 运行时。
  **方案**:
- **Paraglide-JS**: 迁移至 `inlang/paraglide-js`。它是专为 SvelteKit 设计的**编译时**国际化库，完全 Tree-shakable，且类型安全（防止 key 拼写错误）。

### 8.3 同步逻辑增强

**现状**: `src/libs/sync.ts` 的 `pushChanges` 仅实现了简单的 POST 请求，依赖服务端的"Last Writer Wins"。
**风险**:

- **数据覆盖**: 如果设备 A 离线阅读，设备 B 在线阅读，A 恢复上线后会将旧进度覆盖 B 的新进度（如果服务端逻辑不严谨）。
  **方案**:
- **CRDTs 或 智能合并**: 在前端实现基于 `updatedAt` 的冲突检测。如果 `local.updatedAt < remote.updatedAt`，应提示用户或自动合并（取最大进度）。

---

## 第九部分：与 Native 能力深度整合 (Bridge & Payment)

### 9.1 Bridge "上帝插件" (God Plugin) 拆解

**现状**: `src/utils/bridge.ts` 通过一个名为 `native-bridge` 的插件处理了从文件系统到屏幕亮度的所有事务。
**缺陷**:

- **维护困难**: 前端代码与底层插件高度耦合，缺乏模块化。
- **类型安全**: 所有调用都是 `invoke('plugin:native-bridge|...')`，字符串硬编码，容易拼写错误。
  **Svelte 5 迁移方案**:
- **模块化 Bridge**: 拆分为功能专一的 SvelteKit Modules 或 Services。
  - `DisplayService` (亮度、全屏、安全区)
  - `SystemEventService` (按键拦截、后台音频)
  - `FileSystemService` (SD卡、目录选择)

### 9.2 支付系统 (IAP) 状态管理

**现状**: `src/libs/payment/iap/client.ts` 在每次函数调用时都 `new IAPService()`，且混杂了 URL 参数构建逻辑。
**缺陷**:

- **性能开销**: 重复实例化可能导致原生端额外的初始化开销。
- **逻辑分散**: 支付成功的回调 URL 构建逻辑散落在 Client 中。
  **方案**:
- **IAP Store**: 建立全局单例 `IAPStore`，负责初始化一次连接，并监听交易状态更新。
- **Server Verification**: 将 `SUCCESS_PATH` 的验证逻辑移至服务端，前端仅负责发送 Receipt。

### 9.3 认证系统 (Auth) 去耦合

**现状**: `AuthContext.tsx` 强依赖客户端 `supabase-js`，并手动将 User Object 序列化存入 LocalStorage。
**风险**:

- **数据陈旧**: LocalStorage 中的 User 数据可能与数据库不一致。
- **SSR 限制**: 这种模式完全无法在服务端渲染中获取用户状态。
  **方案**:
- **Server-Side Auth**: 使用 SvelteKit 的 `Reference Architecture` (Supabase Auth Helpers)，在 `hooks.server.ts` 中管理 Session。
- **User Store**: 前端 `$page.data.session` 自动同步服务端状态，废弃手动 LocalStorage 同步。

---

## 第十部分：搜索与数据处理性能 (Search & Transformers)

### 10.1 搜索逻辑 Worker 化

**现状**: `SearchBar.tsx` 中的搜索逻辑虽然使用了 `Async Generator` 和 `setTimeout` (Line 292) 进行手动分片，但这依然会占用主线程。
**缺陷**:

- **交互卡顿**: 对于大文件，即使有 `setTimeout(0)`，密集的字符串匹配依然会占用大量 CPU 时间片，导致滚动或输入响应迟滞。
- **内存震荡**: 搜索结果被全部推入全局 Store，导致大对象常驻内存。
  **Svelte 5 迁移方案**:
- **Web Worker**: 将 `view.search` 逻辑完全移入 Worker。
- **Streamable UI**: Worker 通过 `postMessage` 流式传输结果，UI 层使用 Virtual List 实时渲染，不再缓存所有结果到 Store。
- **Search Service**: 封装为 `SearchService`，支持取消搜索 (`AbortController`)。

### 10.2 简繁转换 (SimpleCC) 非阻塞化

**现状**: `src/services/transformers/simplecc.ts` 在主线程使用 `TreeWalker` 遍历 DOM 并同步替换文本 (Lines 17-41)。
**风险**:

- **掉帧**: 在移动端处理几万字的章节时，这绝对会冻结 UI 数百毫秒。
  **方案**:
- **HTML Streaming**: 在 Worker 中使用 `HTMLRewriter` (或类似的流式解析器) 处理文本。
- **OffscreenCanvas**: 如果涉及排版计算，使用 OffscreenCanvas。

### 10.3 翻译缓存 (Translation Cache) 内存优化

**现状**: `src/services/translators/cache.ts` 在启动时将 IndexedDB 中的**所有**翻译记录加载到内存对象 `memoryCache` 中 (Line 140)。
**危险**:

- **OOM 崩溃**: 如果用户翻译了一本 100 万字的小说，`memoryCache` 可能膨胀到几百 MB，导致浏览器崩溃。
  **方案**:
- **Lazy Read**: 仅在需要时查询 IndexedDB (get)。
- **LRU Cache**: 内存中只保留最近使用的 1000 条记录。

---

## 第十一部分：Web 文件系统与输入系统 (Web FS & Input)

### 11.1 灾难性的内存文件系统 (Naive Memory FS)

**现状**: `src/services/webAppService.ts` 的 `readDir` 方法将整个 IDB 数据库加载到内存。
**Svelte 5 迁移方案**:

- **OPFS**: 迁移至 Origin Private File System。
- **IDB Cursor**: 使用游标迭代代替 `getAll()`。

### 11.2 输入系统统一化 (Input Unification)

**现状**: `useShortcuts.ts`, `useLongPress.ts`, `usePullToRefresh.ts` 散落在各处，直接操作 DOM。
**方案**:

- **InputService**: 统一管理全局快捷键和阻止默认行为。
- **Svelte Actions**: `use:longpress`, `use:swipe`, `use:pulltorefresh` (封装 Hammer.js 或原生 Pointer Events)。

### 11.3 下拉刷新重构

**现状**: `usePullToRefresh` 手动创建 DOM 元素并修改 `transform`。
**方案**:

- **Declarative**: 使用 Svelte Spring Motion。

---

## 第十二部分：UI 与主题系统重构 (UI & Theme)

### 12.1 CSS 引擎重写

**现状**: `src/utils/style.ts` 使用 Regex 解析 CSS，脆弱且可能阻塞主线程。
**Svelte 5 迁移方案**:

- **CSS-in-JS / Unocss**: 编译时处理样式。
- **Workerized Parser**: 如果必须运行时解析，移至 Worker。

### 12.2 前端主题服务

**现状**: `themeStore.ts` 混合了 System UI, Window Shape, E-ink Mode 逻辑。
**方案**:

- **ThemeService**: 仅管理颜色和模式。
- **WindowService**: 管理窗口形状和安全区域。
- **Reactive Head**: 使用 `<svelte:head>` 注入 CSS 变量。

---

## 第十三部分：书籍解析与处理 (Book Processing)

### 13.1 TXT 导入 Worker 化

**现状**: `src/utils/txt.ts` 在主线程同步正则解析章节。
**Svelte 5 迁移方案**:

- **Worker**: 必须移至 Worker。
- **Stream**: 分块解析，避免一次性解码 10MB 文本。

### 13.2 目录生成优化

**现状**: `src/utils/toc.ts` 同步执行简繁转换。
**方案**:

- **Async Signal**: 目录渲染应该是异步的，允许先显示未转换的标题。

### 13.3 CFI/XPointer 核心库

**现状**: `xcfi.ts` 逻辑复杂但稳健。
**方案**:

- **Encapsulate**: 保持为纯 TS 库，确保无 DOM 依赖（或 Mock DOM）以在 Worker 中运行。

---

## 第十四部分：书库与核心业务逻辑 (Library Logic)

### 14.1 Library 页面 ViewModel 化

**现状**: `src/app/library/page.tsx` (900 lines) 是上帝组件。
**Svelte 5 迁移方案**:

- **LibraryState.svelte.ts**: 封装 `books`, `selection`, `sync`, `import` 等逻辑。
- **UI Components**: 拆分为 `LibraryHeader`, `Bookshelf`, `EmptyState` 等纯 UI 组件。

### 14.2 Proofread 业务逻辑服务化

**现状**: `src/store/proofreadStore.ts` 包含复杂的合并与正则逻辑。
**方案**:

- **ProofreadService**: 单例服务。
- **Pure Functions**: 提取 `mergeRules` 等不仅依赖 Store 的逻辑。

### 14.3 纹理资源管理

**现状**: `customTextureStore.ts` 存在 Blob 泄漏。
**方案**:

- **AssetManager**: 统一管理图片/字体/纹理的生命周期 (`dispose()`).

---

## 第十五部分：认证与通用组件 (Auth & Shared Components)

### 15.1 统一认证服务 (Unified Auth Service)

**现状**: `src/app/auth/page.tsx` 混合了 Web, Android (Deep Link), iOS (Safari), 和 Desktop (Local Server) 四种 OAuth 流程。
**Svelte 5 迁移方案**:

- **AuthService**: 封装 `login(provider)`，根据平台自动选择策略。
- **State Machine**: 管理认证流程状态。

### 15.2 声明式 Dialog

**现状**: `Dialog.tsx` 手动操作 DOM 实现手势。
**方案**:

- **Native Dialog**: 使用 `<dialog>`。
- **Svelte Actions**: `use:swipe` 处理手势。

### 15.3 Toast 系统重构

**现状**: `Toast.tsx` 依赖 Event Bus。
**方案**:

- **Store-based**: `ToastService`。

---

## 第十七部分：用户资料与支付系统 (User & Payment)

### 17.1 用户页面的重构

**现状**: `src/app/user/page.tsx` 耦合了 UI 展示、Stripe 支付、IAP 购买和存储管理。
**Svelte 5 迁移方案**:

- **拆分页面**: 拆分为 `/user/profile`, `/user/subscription`, `/user/storage` 等子路由。
- **PaymentService**: 统一封装 `Stripe` 和 `IAP` 逻辑，UI 层只调用 `paymentService.subscribe(plan)`。

### 17.2 API 路由迁移

**现状**: `src/app/api` 包含 `stripe`, `apple`, `google`, `tts` 等后端逻辑。
**方案**:

- **SvelteKit Endpoints**: 迁移至 `src/routes/api/.../+server.ts`。
- **Webhooks**: 确保 Stripe Webhook 处理逻辑迁移后能正确验证签名。

## 第十八部分：元数据编辑与状态管理

### 18.1 元数据表单重构

**现状**: `BookDetailEdit.tsx` 通过 Props 传递大量状态 (`fieldSources`, `lockedFields`)。
**方案**:

- **Snippets**: 使用 Svelte 5 Snippets 复用 `FormField` UI。
- **Ephemeral Store**: 使用 `BookEditState.svelte.ts` 在组件树中共享编辑状态，避免层层传递。

## 第十九部分：可观测性与测试 (Observability & Testing)

### 19.1 PostHog 遥测迁移

**现状**: `PHContext.tsx` 在模块顶层副作用中初始化 PostHog，且强依赖 React Context。
**Svelte 5 迁移方案**:

- **hooks.client.ts**: 在 SvelteKit 客户端钩子中初始化 PostHog。
- **AnalyticsService**: 保持 `captureEvent` 的封装，但内部使用 `$page.data` 或单例 Store 获取配置。

### 19.2 全局错误处理

**现状**: `src/app/error.tsx` 是 Next.js 特有的错误边界。
**方案**:

- **+error.svelte**: SvelteKit 的标准错误页面。
- **Global Error Hook**: 在 `hooks.client.ts` 的 `handleError` 中统一上报错误到 PostHog/Sentry。

### 19.3 测试策略迁移

**现状**: 现有测试严重依赖 `next/navigation` 的 mock。
**方案**:

- **Mocking Strategy**: 创建 `src/test/mocks/sveltekit.ts`，模拟 `$app/navigation`, `$app/stores`, `$app/environment`。
- **Component Tests**: 继续使用 `@testing-library/svelte` (Vitest)。

## 第二十一部分：Reader 核心引擎 (Reader Engine)

### 21.1 Foliate-js 集成现代化

**现状**: `FoliateViewer.tsx` 使用 Ref 和 Effect 手动管理 Web Component 的生命周期，存在大量 DOM 属性操作 (`setAttribute`)。
**Svelte 5 迁移方案**:

- **Svelte Elements**: Svelte 对 Custom Elements 有原生支持。
  ```svelte
  <foliate-view bind:this={view} on:message={handleMessage} />
  ```
- **Declarative Attributes**: 直接在标记中绑定属性，而非手动 `setAttribute`。
  ```svelte
  <foliate-view animated={settings.animated} flow={settings.scrolled ? 'scrolled' : 'paginated'} />
  ```
- **Slotting**: 移除 `useUICSS` 钩子，改用 `<foliate-view><style>{uicss}</style></foliate-view>` (如果支持) 或 Shadow DOM 注入。

### 21.2 键盘快捷键与手势统一

**现状**: `Reader.tsx` (Lines 104-145) 在 `useEffect` 中手动绑定 `handleKeyDown`，并根据 UI 状态 (`isSideBarVisible` 等) 进行复杂的条件判断。
**Svelte 5 迁移方案**:

- **Window Events**:
  ```svelte
  <svelte:window on:keydown={handleKey} />
  ```
- **Command Pattern**: 引入 `CommandRegistry`，将 "Close Sidebar", "Next Page" 等注册为命令。`handleKey` 仅负责查找并执行命令。

### 21.3 Z-Index 管理系统化

**现状**: `Reader.tsx` 依赖复杂的硬编码 Z-Index 值 (50, 45, 40, 30...)。
**方案**:

- **Tailwind Layers / CSS Variables**: 定义语义化的层级变量 `--z-modal`, `--z-overlay`, `--z-controls`。

## 第二十二部分：设置与偏好 (Settings & Preference)

### 22.1 响应式 Tab 布局重构

**现状**: `SettingsDialog.tsx` (Lines 125-148) 使用极其昂贵的 DOM 节点克隆 (`cloneNode`) 来计算 Tab 标签宽度，以决定是否折叠。
**Svelte 5 迁移方案**:

- **CSS Flexbox/Grid**: 利用 Flexbox 的 `flex-wrap` 或 CSS Container Queries 自动处理布局，完全移除 JS 计算。
- **Resize Observer Action**: 如果必须 JS 干预，使用 `use:resize` Action 高效监听容器尺寸。

### 22.2 设置状态原子化

**现状**: `SettingsStore` 是一个巨型对象。
**方案**:

- **Granular Stores**: 拆分为 `ReadSettings`, `ThemeSettings`, `SystemSettings` 等多个细粒度 Stores，减少不必要的重渲染。

## 第二十三部分：KoSync 与云同步 (Cloud Sync)

### 23.1 KoSync 客户端服务化

**现状**: `KOSyncClient.ts` 类设计尚可，但部分依赖 `md5` 库（KoReader 协议限制）。
**Svelte 5 迁移方案**:

- **Service Injection**: 将 `KOSyncClient` 注册为 `appService` 下的一个子服务。
- **Reactive Status**: 公联连接状态 (`status: 'connecting' | 'connected' | 'error'`) 为 Store，供 UI 订阅。

### 23.2 冲突解决 UI 声明式化

**现状**: `KOSyncConflictResolver` 是通过条件渲染挂载的。
**方案**:

- **Snippet**: 使用 Snippet 定义冲突界面，作为 `Dialog` 的一部分。

## 第二十四部分：批注与选择系统 (Annotator & Selection)

### 24.1 浮动 UI 现代化

**现状**: `src/utils/sel.ts` 手动实现了复杂的几何计算 (`getPopupPosition`, `constrainPointWithinRect`) 来定位弹出菜单，且需处理 iframe 坐标转换。
**Svelte 5 迁移方案**:

- **@floating-ui/svelte**: 全面废弃 `sel.ts` 中的定位逻辑。使用 `@floating-ui` 的 `computePosition` 和 `autoUpdate`，它能自动处理 iframe、翻转 (flip)、偏移 (shift) 和箭头定位。
- **Portal**: 将弹出菜单渲染在 `<body>` 根部的 Portal 中，彻底解决 `overflow: hidden` 裁剪问题。

### 24.2 声明式选区管理

**现状**: `useTextSelector.ts` 使用 `timeout` hack (Line 60) 来处理 iOS 选区行为，并混杂了 DOM 事件监听与 React 状态更新。
**Svelte 5 迁移方案**:

- **Selection Action**: 创建 `use:selection` Action。
  ```svelte
  <div use:selection
       on:select={(e) => annotator.handleSelect(e.detail)}
       on:deselect={() => annotator.clear()} />
  ```
- **State Machine**: 使用 `xstate` 或简单状态机管理 `Idle` -> `Selecting` -> `MenuOpen` -> `Highlighting` 状态流转，替代分散的 `useRef` 标志位。

### 24.3 拖拽手柄重构

**现状**: `AnnotationRangeEditor.tsx` 手动实现 `PointerCapture` 逻辑。
**方案**:

- **Svelte Action**: `use:draggable`。
- **Range Service**: 将 `useAnnotationEditor.ts` 中的 DOM Range 计算逻辑提取为 `SelectionService` 的纯函数。

## 第二十五部分：笔记本与侧边栏 (Notebook & Sidebar)

### 25.1 现代化面板系统

**现状**: `Notebook.tsx` 手动监听 `touchstart/mousedown` 实现拖拽调整宽度 (`useDrag` hook)。
**Svelte 5 迁移方案**:

- **Split Pane**: 使用 `svelte-splitpanes` 或类似库，提供无障碍支持 (A11y) 和更流畅的拖拽体验。
- **Persisted State**: 面板宽度直接绑定到 `$settings.notebookWidth`，利用 Svelte 5 的 Fine-grained Reactivity 自动保存。

### 25.2 笔记编辑器优化

**现状**: `NoteEditor.tsx` 在 `onBlur` 时保存，可能导致竞态条件（用户快速点击保存按钮 vs Blur 事件）。
**方案**:

- **Form State**: 使用 `sveltekit-superforms` 管理笔记表单，自带脏检查 (Dirty Check) 和自动保存防抖 (Auto-save Debounce)。
- **Draft Store**: 保持 Drafts 功能，但移入 `NotebookState.svelte.ts` 统一管理。

### 25.3 虚拟化笔记列表

**现状**: `Notebook.tsx` (Line 365) 直接渲染所有笔记。
**方案**:

- **Virtual List**: 同样应用 `@tanstack/svelte-virtual`，确保即使有数千条笔记也能流畅滚动。

## 第二十六部分：侧边栏与导航 (Sidebar & Navigation)

### 26.1 现代化目录视图 (Modern TOC View)

**现状**: `TOCView.tsx` 手动管理展开状态 `expandedItems`、计算容器高度、以及处理自动滚动（"Cooldown" 机制）。
**Svelte 5 迁移方案**:

- **Recursive Snippets**: 使用 Svelte 5 的 Snippets 极简地实现递归树渲染，替代平铺列表 (`useFlattenedTOC`)。
  ```svelte
  {#snippet tocItem(node)}
    <details bind:open={node.expanded}>
      <summary>{node.label}</summary>
      {#each node.children as child}
        {@render tocItem(child)}
      {/each}
    </details>
  {/snippet}
  ```
- **Auto-scroll Action**: 封装 `use:scrollIntoView={{ active: isActive }}` action，利用 `scrollIntoView({ behavior: 'smooth' })` 的原生能力。

### 26.2 搜索服务化 (Search as a Service)

**现状**: `SearchBar.tsx` 包含了通过 `setTimeout` 模拟的伪多线程循环 (Lines 256-293) 和 IndexedDB 缓存逻辑。
**Svelte 5 迁移方案**:

- **Search Worker**: 将所有搜索迭代 logic 移至 `search.worker.ts`。
- **Search Store**: 创建 `SearchService` (Svelte Store)，暴露 `searching`, `results`, `progress` 状态。UI 组件仅负责订阅状态。

## 第二十七部分：文本转语音系统 (Text-to-Speech)

### 27.1 TTS 架构重构 (TTS Architecture)

**现状**: `TTSControl.tsx` 是一个 700+ 行的 God Component，不仅管理 UI，还负责 MediaSession、音频焦点 (Audio Focus) 和 SSML 预处理。因为它挂载在 `FooterBar` 下，每个打开的书籍实例都会创建一个 TTS 控制器，容易导致资源竞争。
**Svelte 5 迁移方案**:

- **Singleton Service**: `TTSService` 作为全局单例服务 (在 `app/services` 中)。
- **Global State**: 播放状态 (`playing`, `rate`, `voice`) 移至 `TTSStore`。
- **Dumb Components**: UI (`TTSBar`, `TTSPanel`) 变为纯展示组件，仅调用 `ttsService.play()` 等方法。

### 27.2 媒体会话管理 (Media Session Management)

**现状**: 目前混杂在 Component 的副作用中 (`useEffect`)。
**方案**:

- **Dedicated Handler**: 抽象 `MediaSessionHandler` 类，专门负责与 `navigator.mediaSession` 或 Tauri 插件通信，并自动响应 `TTSStore` 的变化。

## 第二十八部分：图书馆核心 (Library Core)

### 28.1 图书馆页面重构 (Refactor Library Page)

**现状**: `src/app/library/page.tsx` 是一个 800+ 行的 God Component，混合了认证检查、初始化逻辑、文件导入、拖拽处理和路由管理。
**Svelte 5 迁移方案**:

- **Library Service**: 提取 `importBooks`, `deleteBooks` 等业务逻辑到 `LibraryService`。
- **Layout Logic**: 将布局状态（选择模式、视图模式）移至 URL Search Params 或 `LibraryState.svelte.ts`，确保 `+page.svelte` 仅负责组装组件。
- **Derived Stores**: 使用 `$derived` 自动计算 `filteredBooks`，而不是在组件渲染期间计算。

### 28.2 虚拟化书架 (Virtualized Bookshelf)

**现状**: `Bookshelf.tsx` 直接渲染所有图书卡片。
**方案**:

- **Grid Virtualization**: 使用 `@tanstack/svelte-virtual` 的 Grid Virtualizer，仅渲染视口内的图书卡片。
- **Worker Filtering**: 将 `createBookFilter` (Line 119) 的正则匹配逻辑移至 Web Worker，避免在搜索大库时阻塞 UI 线程。

## 第二十九部分：同步引擎 (Sync Engine)

### 29.1 现代化同步逻辑 (Modern Sync)

**现状**: `useBooksSync.ts` 使用 `throttle` + `useEffect` 进行类似轮询的同步，逻辑与其 UI 副作用（下载封面）紧密耦合。
**Svelte 5 迁移方案**:

- **Sync Worker**: 创建 `sync.worker.ts` 处理与后端的差异对比 (Diffing)。
- **Background Sync API**: 在支持的浏览器上使用 Service Worker 的 Background Sync API。
- **Decoupled Actions**: 将“同步元数据”与“下载封面/文件”解耦。同步仅更新 Store，下载通过 `DownloadManager` 队列处理。

## 第三十部分：状态管理与设置 (State Management & Settings)

### 30.1 Store 架构拆分 (Store Splitting)

**现状**: `readerStore.ts` 混合了通过网络加载的图书配置 (Persistent)、阅读进度 (Syncable) 和临时的 UI 状态 (Ephemeral, e.g., `ribbonVisible`, `loading`)。
**Svelte 5 迁移方案**:

- **ReaderState (Ephemeral)**: 使用 `svelte.svelte.ts` (Runes) 管理所有 UI 状态（Loading, Error, Visibility）。
- **BookConfigService (Persistent)**: 专门负责加载/保存 `BookConfig`。
- **ReadingSession (Session)**: 管理当前阅读会话的活跃视图和交互。

### 30.2 设置面板现代化 (Modern Settings Panels)

**现状**: `SettingsDialog.tsx` 使用了一种复杂的 `registerResetFunction` 模式将重置逻辑从子组件提升到父组件。`LayoutPanel` 单文件超过 30KB。
**Svelte 5 迁移方案**:

- **Context API**: 使用 `setContext/getContext` 传递面板控制逻辑，避免 Props Drilling。
- **Composable Panels**: `LayoutPanel` 拆分为 `MarginsControl`, `SpacingControl`, `ThemeControl` 等独立组件。
- **Form Stores**: 使用 Store 自动映射表单值到 `SettingsStore`，移除手动 `onChange` 处理。

## 第三十一部分：认证与用户系统 (Auth & User System)

### 31.1 认证服务化 (Auth as a Service)

**现状**: `AuthPage` (400+ lines) 混合了 Tauri OAuth Server 管理、Deep Link 监听、Supabase Auth UI 和路由重定向逻辑。
**Svelte 5 迁移方案**:

- **AuthService**: 封装所有平台特定的认证逻辑（启动本地服务器、监听 Deep Link）。
- **AuthUI**: 纯 UI 组件，仅调用 `AuthService.login(provider)`。
- **AuthState**: 使用 `svelte.svelte.ts` 管理用户会话状态，替代 `AuthContext`。

### 31.2 用户中心重构 (User Dashboard Refactor)

**现状**: `UserPage` 混合了 Stripe 和 IAP (In-App Purchase) 的支付逻辑。`StorageManager` 是一个 500 多行的巨型组件，包含文件列表、分页、搜索和删除逻辑。
**Svelte 5 迁移方案**:

- **PaymentService**: 统一封装 Stripe 和 IAP 接口，UI 层只感知 `subscribe(plan)`。
- **StorageService**: 负责文件列表的获取、删除和统计。
- **Decomposed Components**: 将 `StorageManager` 拆分为 `StorageList`, `StorageStats`, `StorageFilters`。

## 第三十二部分：OPDS 与 传输服务 (OPDS & Transfer Service)

### 32.1 OPDS 客户端 (OPDS Client)

**现状**: `src/app/opds/page.tsx` (600+ lines) 包含了一个完整的 OPDS 1.2 客户端实现，并且手写了一套复杂的 History 管理逻辑。
**Svelte 5 迁移方案**:

- **OPDSClient**: 将数据获取 (`fetchWithAuth`) 和解析 (`foliate-js`) 逻辑提取到独立的类中。
- **Router Integration**: 尽量使用 SvelteKit/Next.js 的路由即状态，如果必须保持单页浏览体验，使用专门的 `Store` 管理访问栈。

### 32.2 传输管理器 (Transfer Manager)

**现状**: `TransferManager` 是一个单例，但它依赖了 UI 层的 `TranslationFunc`，导致它无法在纯 JS/TS 环境下独立运行/测试。
**Svelte 5 迁移方案**:

- **Reactive State**: 将 `useTransferStore` 替换为 Svelte 5 的响应式状态。
- **Decoupling**: 移除对 `TranslationFunc` 的依赖，Service 只返回机器可读的 Error Code，由 UI 层负责翻译。

## 第三十三部分：后端 API 路由 (Backend API Routes)

### 33.1 API 路由迁移 (API Routes Migration)

**现状**: `src/app/api` 下包含 `stripe` (Payments), `opds` (Proxy), `tts` (Proxy) 等后端逻辑。
**Svelte 5 迁移方案**:

- **Server Routes**: 迁移至 SvelteKit 的 `src/routes/api/.../+server.ts`。
- **Proxy Logic**: 保留 Cloudflare Workaround，但使用 SvelteKit 的 `RequestEvent` 和 `fetch` 简化代理实现。
- **Webhook Handlers**: 确保 Stripe Webhook 的签名验证逻辑在 SvelteKit 中正确实现 (`request.arrayBuffer()`)。

## 第三十四部分：共享库迁移 (Shared Libraries Migration)

### 34.1 文档解析层 (Document Parsing Layer)

**现状**: `src/libs/document.ts` 封装了 `foliate-js` 的各种 Filter 和 Loader。大量使用了 Dynamic Import (`await import(...)`) 来减少首屏体积。
**Svelte 5 迁移方案**:

- **Parsing Service**: 保持现有的 Lazy Load 模式，但将其封装为 `DocumentService`。
- **Web Worker**: 考虑将 `ZipReader` 和 XML 解析等重 CPU 操作移入 Web Worker，避免解析大文件时卡顿主线程。

### 34.2 TTS 引擎 (TTS Engine)

**现状**: `src/libs/edgeTTS.ts` 包含了一个完整的 WebSocket 客户端，手动处理 SSML 生成、二进制音频流拼接和 LRU 缓存。
**Svelte 5 迁移方案**:

- **TTSEngine Class**: 将 `EdgeSpeechTTS` 重构为通用的 `TTSEngine` 接口实现，方便未来接入其他引擎 (e.g., OpenAI API)。
- **AudioContext**: 使用 Web Audio API 处理音频流，而不是简单的 Blob URL，以获得更低的延迟和更好的控制。

## 第三十五部分：同步客户端 (Sync Client)

### 35.1 同步逻辑 (Sync Logic)

**现状**: `src/libs/sync.ts` 实现了基于 "Last-Writer-Wins" 的全量/增量同步逻辑。
**Svelte 5 迁移方案**:

- **Conflict Resolution**: 在客户端增加更智能的冲突检测 (Vector Clock 或 Merkle Tree)，尽管服务端目前是简单的 LWW。
- **Offline First**: 结合 `dexie.js` 或 `rxdb` 实现真正的离线优先，Sync Client 仅作为后台同步器，不直接被 UI 调用。

## 第三十六部分：样式系统 (Style System)

### 36.1 动态样式注入 (Dynamic Style Injection)

**现状**: `src/utils/style.ts` (900 lines) 包含大量手动拼接 CSS 字符串的 logic (`getFontStyles`, `getLayoutStyles`)，并手动 `appendChild` 到 HEAD。
**Svelte 5 迁移方案**:

- **CSS Variables**: 将大部分计算逻辑移至 CSS Variables (`--font-size`, `--line-height`)。
- **Scoped Styles**: 利用 Svelte 的 Scope Style 特性，避免全局污染。使用 `<svelte:head>` 管理动态注入的样式。

## 第三十七部分：原生桥接 (Native Bridge)

### 37.1 插件通信 (Plugin Communication)

**现状**: `src/utils/bridge.ts` 封装了 `invoke` 调用，与 Tauri 后端插件通信。`transfer.ts` 处理文件上传下载，区分 Web (XHR/Fetch) 和 Tauri (Rust Command)。
**Svelte 5 迁移方案**:

- **Bridge Service**: 定义明确的 `NativeBridge` 接口。
- **Mocking**: 为纯 Web 环境提供完善的 Mock 实现，方便在浏览器中开发调试原生功能。

## 第三十八部分：UI 组件库 (UI Components)

### 38.1 交互式弹窗 (Interactive Dialogs)

**现状**: `src/components/Dialog.tsx` 实现了基于 `<dialog>` 元素的模态框，包含复杂的拖拽关闭手势 (`useDrag`) 和移动端全屏适配逻辑。
**Svelte 5 迁移方案**:

- **Snippet Props**: 使用 Svelte 5 的 `Snippet` 传递 `header`, `footer` 等插槽。
- **Action**: 将拖拽逻辑 (`useDrag`) 重构为 Svelte Action (`use:draggable`)，与组件逻辑解耦。

### 38.2 全局通知 (Global Toast)

**现状**: `src/components/Toast.tsx` 通过监听 `eventDispatcher` ('toast') 来显示通知。
**Svelte 5 迁移方案**:

- **Toast Store**: 使用 Svelte Store 管理通知队列。
- **Auto Dismiss**: 在 Store 内部处理超时自动销毁逻辑。

## 第三十九部分：更新系统 (Updater System)

### 39.1 跨平台更新 UI (Cross-Platform Updater UI)

**现状**: `UpdaterWindow.tsx` 混合了 Tauri Updater (Desktop) 和 Android APK 下载安装逻辑。包含变更日志的获取和翻译。
**Svelte 5 迁移方案**:

- **Updater Store**: 将检查更新、下载进度等状态移入 Store。
- **Separation**: 将 UI 拆分为 `UpdateCheck`, `ChangeLog`, `DownloadProgress` 等小组件。

## 第四十部分：应用服务层 (App Service Layer)

### 40.1 平台抽象 (Platform Abstraction)

**现状**: `src/services/appService.ts` 定义了抽象基类 `BaseAppService`，并由 `WebAppService` (IndexedDB)和 `NativeAppService` (Tauri FS) 实现。这通过 `EnvContext` 注入到应用中。
**Svelte 5 迁移方案**:

- **Context Injection**: 在根组件 (`+layout.svelte`) 使用 `setContext` 注入具体的 `AppService` 实例。
- **Singleton Pattern**: 保持现有的单例模式，确保文件系统操作的一致性。
- **FS Module**: 这一层设计非常稳健，几乎可以直接移植到 SvelteKit，只需调整 Context 获取方式。

## 第四十一部分：支付系统 (Payment System)

### 41.1 IAP 客户端 (IAP Client)

**现状**: `src/libs/payment/iap/client.ts` 封装了 IAP 操作，依赖于 `src/utils/iap.ts` (Tauri Plugin Wrapper)。
**Svelte 5 迁移方案**:

- **Payment Service**: 将 `iap/client.ts` 的逻辑封装为 `PaymentService`，并统一管理 Stripe 和 IAP 两种支付方式。
- **Store State**: 使用 Store 跟踪购买状态 (`purchasing`, `restoring`, `products`)，而不是在组件中手动管理 loading 态。

## 第四十二部分：Hook 逻辑迁移 (Hooks Migration)

### 42.1 同步逻辑 (Sync Logic)

**现状**: `src/hooks/useSync.ts` (270 lines) 包含大量状态同步逻辑，耦合了 Router, Settings Store, Book Data Store。
**Svelte 5 迁移方案**:

- **Sync Machine**: 使用 XState 或简单的 State Machine Store 重写同步逻辑。将 `pullChanges` 和 `pushChanges` 变为 Store 的 Actions。
- **Decoupling**: 移除 UI 路由跳转 (`navigateToLogin`)，改为在 Store 中设置 `authStatus` 状态，由 UI 层响应。

### 42.2 翻译逻辑 (Translation Logic)

**现状**: `useTranslator.ts` 混合了缓存策略、预处理和 API 调用。
**Svelte 5 迁移方案**:

- **Translation Service**: 将核心逻辑移入 `TranslationService`。
- **Async Derivative**: 使用 Svelte 5 的 `$derived.by` 处理翻译的异步依赖和缓存读取。

## 第四十三部分：TTS 服务 (Text-to-Speech Service)

### 43.1 TTS 控制器 (TTS Controller)

**现状**: `src/services/tts/TTSController.ts` 是一个基于 `EventTarget` 的复杂类，管理播放状态、高亮和多引擎切换 (Edge, Native, WebSpeech)。
**Svelte 5 迁移方案**:

- **TTS Store**: 将 `TTSController` 的状态 (`state`, `rate`, `voice`) 移入 Store。
- **Service Pattern**: 保持 `TTSClient` 接口模式，但将控制器重构为单例 Service，供组件订阅。
- **Audio Element**: 将 `Audio` 元素管理逻辑封装在 Service 内部，或通过 Action 绑定到隐藏的 `<audio>` 标签。

## 第四十四部分：服务端 Stripe (Server-side Stripe)

### 44.1 Admin 操作 (Admin Operations)

**现状**: `src/libs/payment/stripe/server.ts` 包含使用 Secret Key 初始化 Stripe 和 Supabase Admin 的逻辑。
**Svelte 5 迁移方案**:

- **Server Modules**: 迁移至 `$lib/server/payment/stripe.ts`。SvelteKit 会自动确保这些代码只在服务器端执行，防止密钥泄露。
- **Webhook Handler**: 将 Webhook 处理逻辑迁移至 `src/routes/api/webhook/stripe/+server.ts`。

## 第四十五部分：数据转换器 (Data Transformers)

### 45.1 Proofread Transformer

**现状**: `src/services/transformers/proofread.ts` 使用复杂的 DOM 操作 (`TreeWalker`, `DOMParser`) 和正则替换来处理文本修正。
**Svelte 5 迁移方案**:

- **Utility Function**: 将核心逻辑保留为纯 TS 工具函数。
- **Optimization**: 避免在每次渲染时创建新的 DOM Parser。考虑在 Worker 中处理大段文本的转换，或者使用字符串操作优化性能。

## 第四十六部分：混合路由迁移 (Hybrid Routing Migration)

**现状**: 项目混合使用了 Next.js App Router (`src/app`) 和 Pages Router (`src/pages`). `reader` 路由同时出现在两处，通过 Hybrid 模式共存。
**Svelte 5 迁移方案**:

- **Unified Routing**: 统一迁移至 SvelteKit 基于文件系统的路由 (`src/routes`).
- **Layouts**: 将 `src/app/layout.tsx` 迁移为 `src/routes/+layout.svelte`。
- **Dynamic Routes**: `src/pages/reader/[ids].tsx` 迁移为 `src/routes/reader/[...ids]/+page.svelte`。

## 第四十七部分：状态管理迁移 (State Management Migration)

**现状**: 广泛使用 Zutand Store (`readerStore`, `settingsStore`)，其中 `readerStore` 极为庞大且耦合度高。
**Svelte 5 迁移方案**:

- **Granular Stores**: 将 `readerStore` 拆分为更细粒度的 Svelte 5 `$state` 对象 (e.g., `viewState`, `progressState`).
- **Context API**: 对于组件树深处的传递，结合使用 `setContext` 和 `$state`，避免全局单例的滥用。
- **Derived State**: 利用 `$derived` 自动计算依赖状态（如 `progress` 更新触发 UI 变化），替代手动 `set` 调用中的副作用。

## 第四十八部分：功能模块 - 书库 (Feature Modules - Library)

### 48.1 书库主页 (Library Page)

**现状**: `src/app/library/page.tsx` (32KB) 是一个典型的"上帝组件"，包含初始化逻辑、路由状态 sync、文件导入、更新检查、拖拽处理等所有逻辑。
**Svelte 5 迁移方案**:

- **Decomposition**: 将逻辑拆分为独立的各个组件/Action:
  - `LibraryInitializer.svelte`: 处理初始化和登录检查。
  - `BookImporter.svelte.ts`: 封装文件导入逻辑（支持 Worker）。
  - `LibraryNavigator.svelte`: 处理面包屑和分组导航。
- **Page Data**: 利用 SvelteKit `load` 函数在路由层面预加载必要数据（如设置、用户状态）。

## 第四十九部分：功能模块 - 阅读器 (Feature Modules - Reader)

### 49.1oliate Viewer

**现状**: `src/app/reader/components/FoliateViewer.tsx` (500+ lines) 手动管理 `foliate-js` 实例的生命周期、DOM 事件监听和样式注入。
**Svelte 5 迁移方案**:

- **Actions**: 使用 Svelte Actions (`use:foliate`) 来封装第三方库的挂载和销毁逻辑。将 DOM 事件监听器（`keydown`, `wheel`, etc.）封装在 Action 内部。
- **Context**: 通过 generic context (`setContext`) 向下传递 Viewer 实例，供子组件（如 `Annotator`）使用，避免 prop drilling。

### 49.2 标注器 (Annotator)

**现状**: `Annotator.tsx` (33KB) 逻辑极其复杂。
**Svelte 5 迁移方案**:

- **Store-based State**: 将标注状态移入 `annotationStore.svelte.ts`。
- **Component Splitting**: 将弹窗 (`Popup`)、高亮逻辑 (`Highlight`) 和 笔记编辑 (`Editor`) 拆分为独立组件。

## 第五十部分：通用基础设施 (Common Infrastructure)

### 50.1 国际化 (I18n)

**现状**: 使用 `react-i18next` 和 `i18next-http-backend`。
**Svelte 5 迁移方案**:

- **Library**: 迁移至 `svelte-i18n` 或直接使用轻量级的 `$state` 管理翻译字典（如果规模允许），或者保持 `i18next` 但封装为 Svelte Store。考虑到现有资源文件结构，保留 `i18next` 逻辑但替换 React binding 是最平滑的路径。

### 50.2 认证上下文 (Auth Context)

**现状**: `AuthContext.tsx` 依赖 React Context 和 `localStorage` 副作用。
**Svelte 5 迁移方案**:

- **Auth Store**: 创建 `$lib/stores/auth.svelte.ts`。
- **Auto-Sync**: 使用 `$effect` 自动同步 `user` 状态到 `localStorage` 和 `PostHog`，移除手动副作用代码。

## 第五十一部分：功能模块 - OPDS (Feature Modules - OPDS)

### 51.1 OPDS 浏览器 (OPDS Browser)

**现状**: `src/app/opds/page.tsx` (22KB) 手动管理了一个内部的历史记录栈 (`history`, `historyIndex`)，并根据 `viewMode` 切换视图。
**Svelte 5 迁移方案**:

- **Router-based Navigation**: 利用 SvelteKit 的动态路由 (`[...path]`) 来映射 OPDS feed URL，让浏览器的原生前进/后退按钮生效，移除手动历史管理代码。
- **Data Loaders**: 将 OPDS 抓取和解析逻辑移至 `+page.server.ts` (或 `+page.ts` for CSR)，简化组件逻辑。

## 第五十二部分：功能模块 - 认证 (Feature Modules - Auth)

### 52.1 多平台认证流 (Multi-platform Auth Flow)

**现状**: `src/app/auth/page.tsx` (15KB) 包含大量处理 Tauri Deep Link、Local Server (Debug) 和 Native SDK (Apple) 的条件逻辑。
**Svelte 5 迁移方案**:

- **Auth Provider Service**: 将不同平台的认证策略（Web Redirect, Deep Link, Native SDK）封装到 `AuthStrategy` 接口的实现中。
- **Platform Agnostic Component**: `AuthPage.svelte` 只负责 UI 展示，调用统一的 `authService.login(provider)` 接口。

## 第五十三部分：功能模块 - 用户 (Feature Modules - User)

### 53.1 订阅与支付 (Subscription & Payment)

**现状**: `src/app/user/page.tsx` 直接调用 Stripe/IAP 客户端代码。
**Svelte 5 迁移方案**:

- **Payment Service**: 创建 `SubscriptionService` 处理 Stripe Session 创建和 IAP 交易恢复。
- **Granular Components**: 保持现有的组件拆分 (`UserInfo`, `UsageStats`)，但将数据流改为 Store 驱动，而非 Prop Drilling。

## 第五十四部分：后端 API (Backend API)

### 54.1 同步接口 (Sync Endpoint)

**现状**: `src/pages/api/sync.ts` (12KB) 是一个单体 API，处理书籍、配置和笔记的所有增量同步逻辑，包含复杂的冲突解决和批处理。
**Svelte 5 迁移方案**:

- **SvelteKit Server Routes**: 迁移至 `src/routes/api/sync/+server.ts`。
- **Logic Extraction**: 将核心同步逻辑（数据库查询、差异对比、冲突解决）提取到 `src/lib/server/sync` 模块中，使 API 路由层变薄。
- **Type Safety**: 利用 SvelteKit 的 `RequestEvent` 和 TypeScript 接口确保请求响应的类型安全。

### 54.2 其他 API (Other APIs)

**现状**: `src/app/api/*` 包含 Stripe, TTS, Metadata 代理接口。
**Svelte 5 迁移方案**:

- **Unified Structure**: 全部迁移至 `src/routes/api/[...route]/+server.ts` 或独立的路由文件夹。利用 SvelteKit 的 server-only modules (`$lib/server`) 保护密钥。

## 第五十五部分：应用特性 (App Features)

### 55.1 PWA & Service Worker

**现状**: `src/sw.ts` 使用 `serwist` 配置缓存策略。
**Svelte 5 迁移方案**:

- **Vite PWA**: 使用 `@vite-pwa/sveltekit` 插件。它能更好地与 Vite 构建流程集成，并提供开箱即用的 Svelte Store (`useRegisterSW`)。
- **Strategy Porting**: 将现有的 Runtime Caching 策略（Fonts CacheFirst, API NetworkFirst）移植到 Vite PWA 配置中。

### 55.2 动态主题引擎 (Dynamic Theming)

**现状**: `src/styles/themes.ts` 手动生成色板并注入 `<style>` 标签到 DOM 头部。
**Svelte 5 迁移方案**:

- **CSS Variables Store**: 使用 Svelte Store 管理当前主题变量。
- **Head Management**: 利用 `<svelte:head>` 或 `config.kit.csp` 更安全地管理样式注入，或者继续使用 DOM 操作但封装在 Action 中以确保生命周期安全。建议结合 CSS Custom Properties 和 Tailwind 的 `layer` 功能。

## 第五十六部分：共享组件库 (Shared Components)

### 56.1 更新器窗口 (UpdaterWindow)

**现状**: `src/components/UpdaterWindow.tsx` (16KB) 包含复杂的跨平台更新逻辑（Desktop Tauri Updater vs Android APK Download）。
**Svelte 5 迁移方案**:

- **Updater Service**: 将检查更新、下载、安装的逻辑封装到 `UpdaterService`。
- **UI Logic Separation**: 组件只负责展示进度条和更新日志。
- **Generic Protocol**: 定义统一的 `UpdateInfo` 接口，屏蔽平台差异。

## 第五十七部分：核心 Hooks (Core Hooks)

### 57.1 同步 Hook (useSync)

**现状**: `src/hooks/useSync.ts` (9KB) 混合了 UI 状态管理和核心同步算法。
**Svelte 5 迁移方案**:

- **Store Migration**: 迁移为 `syncStore.svelte.ts`。
- **Algo Separation**: 将 `pullChanges` 和 `pushChanges` 中的核心差异对比算法提取为纯函数或类方法，与 Reactivity 解耦。

## 第五十八部分：核心库 (Core Libs)

### 58.1 Edge TTS 客户端 (Edge TTS Client)

**现状**: `src/libs/edgeTTS.ts` (19KB) 实现了复杂的 WebSocket 协议和 SSML 生成。
**Svelte 5 迁移方案**:

- **Platform Agnostic Module**: 该模块已经相对独立，可以直接移植到 Typescript 模块中。
- **Stream Handling**: 利用 Web Streams API 优化音频流处理，替代现有的 ArrayBuffer 拼接，以获得更低的延迟。

## 第五十九部分：中间件与路由 (Middleware & Routing)

### 59.1 API CORS 中间件 (API CORS Middleware)

**现状**: `src/middleware.ts` 手动处理 CORS Headers。
**Svelte 5 迁移方案**:

- **Handle Hook**: 使用 SvelteKit `hooks.server.ts` 中的 `handle` 函数。这是 SvelteKit 处理全局请求拦截的标准方式，替代 Next.js Middleware。

## 第六十部分：全局提供者 (Global Providers)

### 60.1 根组件引导 (Root Bootstrapping)

**现状**: `src/components/Providers.tsx` 负责初始化 I18n, Theme, Auth, Sync, PostHog。
**Svelte 5 迁移方案**:

- **Root Layout**: 迁移至 `src/routes/+layout.svelte`。
- **Browser/Server Init**: 将 CSR 初始化逻辑（如 PostHog）放在 `+layout.svelte` 的 `$effect` 中，将 SSR 初始化逻辑（如 I18n resource loading）放在 `+layout.server.ts` 的 `load` 函数中。

## 第六十一部分：工具库 (Utilities)

### 61.1 庞大的工具集 (Massive Utils Collection)

**现状**: `src/utils` 包含 66 个文件，涵盖 DOM 操作、文件处理、加密等。
**Svelte 5 迁移方案**:

- **Isomorphic Utils**: 大部分工具函数是纯 TS，可直接复用。
- **DOM Utilities**: 需仔细检查直接操作 DOM 的工具（如 `style.ts`），确保其在 SSR 环境下有适当的 Guard（`if (browser)` Check）。

## 第六十二部分：构建与配置 (Build & Configuration)

### 62.1 构建系统 (Build System)

**现状**: `next.config.mjs` 处理 PWA (Serwist), Headers, 和 Static Export。
**Svelte 5 迁移方案**:

- **Vite Config**: 迁移至 `vite.config.ts`。使用 `@sveltejs/adapter-static` (Tauri) 和 `@sveltejs/adapter-node` (Self-hosted) 或 `@sveltejs/adapter-cloudflare`。
- **Environment Handling**: 使用 `$env/static/public` 代替 `process.env.NEXT_PUBLIC_*`。

### 62.2 样式配置 (Styling Config)

**现状**: `tailwind.config.ts` 集成了 `daisyui` 和自定义插件。
**Svelte 5 迁移方案**:

- **Direct Port**: 几乎可以直接复制，只需更新 `content` 路径以包含 `.svelte` 文件。

## 第六十三部分：阅读器核心编排 (Reader Composition)

### 63.1 多书网格 (BooksGrid)

**现状**: `src/app/reader/components/BooksGrid.tsx` 是阅读界面的具体编排者，负责渲染多个 `FoliateViewer` 和共享 UI 层（Annotator, HeaderBar）。
**Svelte 5 迁移方案**:

- **Layout Logic**: 迁移为 `ReaderLayout.svelte` 或 `ReadingSession.svelte`。
- **Component Injection**: 利用 Svelte 的 Slot 或 Snippets (`{#snippet}`) 来更干净地组织 Viewers 和 Overlays，避免 React 中那种 props 穿透。

## 第六十四部分：TTS 控制器 (TTS Controller)

**现状**: `src/services/tts/TTSController.ts` (12KB) 是一个基于类的状态机，管理多种 TTS 引擎（Web, Edge, Native）。
**Svelte 5 迁移方案**:

- **Reactive Service**: 将 `TTSController` 重构为使用 `$state` 的服务类。
- **Event Bus Replacement**: 使用 Svelte Store 替代 `EventTarget` 派发事件，让 UI 直接响应状态变化（如 `currentMark`）。

## 第六十五部分：数据类型 (Data Types)

### 65.1 设置对象 (ViewSettings God Object)

**现状**: `ViewSettings` 接口通过多重继承聚合了 10+ 个子接口（Font, Layout, TTS, etc.）。
**Svelte 5 迁移方案**:

- **Composition**: 在 Store 设计中，尽量保持这些设置的模块化，而不是维持一个巨大的扁平对象。使用 Derived Stores (`$derived`) 来组合最终的视图配置。

## 第六十六部分：应用服务层 (AppService Layer)

### 66.1 上帝类 AppService (God Class AppService)

**现状**: `src/services/appService.ts` (32KB) 几乎处理所有非视图逻辑：文件系统、设置持久化、书籍导入导出、封面生成、字体管理。
**Svelte 5 迁移方案**:

- **Domain Services**: 将单一的 `AppService` 拆分为领域服务：
  - `FileSystemService`: 纯文件操作。
  - `LibraryService`: 书籍导入、删除、元数据管理。
  - `SettingsService`: 设置的加载与保存。
  - `AssetService`: 字体与图片的管理。

## 第六十七部分：支付模块 (Payment Module)

### 67.1 支付客户端 (Payment Clients)

**现状**: `src/libs/payment` 包含 Stripe 和 IAP (Apple/Google) 的客户端实现。
**Svelte 5 迁移方案**:

- **Unified Interface**: 定义 `PaymentProvider` 接口，屏蔽 Stripe 与 IAP 的差异。
- **Server Verification**: 确保收据验证逻辑迁移至 `src/routes/api/payment` 下的服务器端路由，不暴露敏感逻辑。

## 第六十八部分：文档加载器 (Document Loader)

### 68.1 核心解析逻辑 (Core Parsing Logic)

**现状**: `src/libs/document.ts` 使用动态导入 (`await import`) 来按需加载 `foliate-js` 等解析器。
**Svelte 5 迁移方案**:

- **Keep Dynamic Imports**: 保持动态导入模式以优化 Bundle 体积。
- **Web Worker**: 考虑将繁重的解析任务（如 Zip 解压、Epub 解析）移至 Web Worker，避免阻塞主线程 UI。可以使用 Vite 的 `?worker` 后缀轻松导入 Worker。

## 第六十九部分：Hooks 剩余部分 (Remaining Hooks)

### 69.1 翻译钩子 (Translator Hook)

**现状**: `src/hooks/useTranslator.ts` 包含复杂的缓存、预处理和润色逻辑。
**Svelte 5 迁移方案**:

- **Svelte Resource**: 使用 Svelte 5 的 `async` 状态管理或 `tanstack-query` 来管理翻译请求。
- **Service Layer**: 将缓存和 API 调用逻辑彻底移入 `TranslatorService`，Hook 只负责 UI 状态绑定。

## 第七十部分：转换器 (Transformers)

### 70.1 校对逻辑 (Proofreading Logic)

**现状**: `src/services/transformers/proofread.ts` 包含大量直接操作 DOM 节点的逻辑（`TreeWalker`, `TextNode` 替换）。
**Svelte 5 迁移方案**:

- **DOM Independence**: 尽量将逻辑重构为纯文本处理或 Virtual DOM 操作，减少直接 DOM 变更带来的副作用。
- **Worker Offload**: 由于涉及大量正则匹配（特别是 CJK 字符处理），建议移至 Web Worker 运行。

## 第七十一部分：元数据编辑 (Metadata Editing)

### 71.1 表单状态管理 (Form State Management)

**现状**: `BookDetailEdit.tsx` 手动管理大量表单字段状态和校验逻辑。
**Svelte 5 迁移方案**:

- **Svelte Actions**: 使用 `use:action` (`use:enhance` in SvelteKit forms) 来处理表单提交和即时校验。
- **Stores for Drafts**: 使用 Store 来保存编辑中的草稿状态，防止意外关闭丢失数据。

## 第七十二部分：标注系统 (Annotator System)

### 72.1 复杂的覆盖层管理 (Complex Overlay Management)

**现状**: `Annotator.tsx` (33KB) 是一个巨大的组件，管理选择状态、高亮、以及 5 个不同的弹出层（字典、翻译、校对等）。
**Svelte 5 迁移方案**:

- **State Machine**: 使用 Svelte Store (`annotationState.svelte.ts`) 来管理选择状态和当前激活的工具。
- **Portal/Teleport**: 使用 `Canvas Overlay` 或 `Portal` 将弹出层渲染到较高的 DOM 层级，避免被 overflow 裁剪。

## 第七十三部分：书库架构 (Library Architecture)

### 73.1 书库上帝组件 (Library God Component)

**现状**: `src/app/library/page.tsx` (32KB) 处理了过多职责：路由参数同步、文件导入、同步触发、更新检查、快捷键绑定。
**Svelte 5 迁移方案**:

- **Decomposition**: 拆分为：
  - `+page.svelte`: 仅负责从 URL 读取参数并传给 loader。
  - `LibraryLayout.svelte`: 负责整体布局和 Toolbar。
  - `Bookshelf.svelte`: 负责网格渲染和虚拟滚动。
  - `LibrarySyncController.svelte`: 一个无 UI 组件（或 Hook），负责监听同步事件。

## 第七十四部分：字体管理 (Font Management)

### 74.1 动态样式注入 (Dynamic Style Injection)

**现状**: `src/styles/fonts.ts` 通过手动创建 `<link>` 和 `<style>` 标签在运行时注入字体，包含硬编码的 CDN 列表。
**Svelte 5 迁移方案**:

- **Svelte Head**: 利用 `<svelte:head>` 来声明静态资源。
- **Font Service**: 将动态字体加载逻辑封装为 `FontManager` 服务，配合 Svelte Store 实现字体切换的响应式更新，避免 FOUC。

## 第七十五部分：核心算法工具 (Core Algorithm Utils)

### 75.1 复杂文本处理 (Complex Text Processing)

**现状**:

- `src/utils/xcfi.ts`: 实现了复杂的 EpubCFI 与 CREngine XPointer 互转逻辑。
- `src/utils/txt.ts`: 包含一个完整的 TXT 转 EPUB 转换器，带有启发式章节检测（支持中英文）。
  **Svelte 5 迁移方案**:
- **Portable Logic**: 这些是纯逻辑模块，可以直接迁移到 `src/lib/utils` 或 `src/lib/core`。
- **Worker Integration**: `txt.ts` 的转换逻辑涉及大量正则匹配和 Zip 打包，**必须** 移至 Web Worker 运行，以防止冻结 UI 线程。

### 75.2 样式生成器 (Style Generator)

**现状**: `src/utils/style.ts` (29KB) 硬编码了大量的 CSS 字符串生成逻辑，用于动态生成阅读器样式。
**Svelte 5 迁移方案**:

- **CSS Variables**: 尽量使用 CSS 变量（Custom Properties）来替代大规模的 CSS 字符串拼接。
- **Reactive Stores**: 将样式生成逻辑重构为 Derived Stores，当设置变更时自动计算出最小变更集，而不是全量重新生成 Style 标签。

## 第七十六部分：构建脚本 (Build Scripts)

### 76.1 发布脚本 (Release Scripts)

**现状**: `scripts/` 目录包含用于同步发布说明的 Bash 脚本。
**Svelte 5 迁移方案**:

- **Keep**: 这些脚本与框架无关，可以保留。需检查路径引用是否匹配新的 SvelteKit 项目结构。
- **Node.js Replacement**: 考虑用 Node.js 脚本重写 bash 脚本，以增强跨平台兼容性（Windows 开发环境）。

## 第七十七部分：阅读器状态管理 (Reader State Management)

### 77.1 混合状态存储 (Mixed Concern Store)

**现状**: `src/store/readerStore.ts` 同时管理了持久化的书籍进度 (`progress`) 和临时的 UI 状态 (`ribbonVisible`, `loading`)。
**Svelte 5 迁移方案**:

- **Store Separation**:
  - `BookProgressStore`: 专门负责进度的记录与持久化 sync。
  - `ReaderUIStore`: 负责当前的 UI 交互状态（Ephemeral State）。
- **Deep Reactivity**: 利用 Svelte 5 的 Proxied State (`$state`) 来简化嵌套对象 (`viewStates[key]`) 的深度更新逻辑。

## 第七十八部分：自动更新模块 (Auto-updater Module)

### 78.1 UI 耦合的检查逻辑 (UI-Coupled Check Logic)

**现状**: `src/helpers/updater.ts` 直接导入并调用了 React 组件的 setter (`setUpdaterWindowVisible`)，导致逻辑层与 UI 层强耦合。
**Svelte 5 迁移方案**:

- **Event Bus / Store**: 检查逻辑应仅发射事件或更新 `UpdaterStore`。`UpdaterModal` 组件订阅该 Store 来决定是否显示。

## 第七十九部分：原生传输桥接 (Native Transfer Bridge)

### 79.1 Rust 后端接口 (Rust Backend Interface)

**现状**: `src-tauri/src/transfer_file.rs` 暴露了 `download_file` 和 `upload_file` 命令，使用 `Channel<ProgressPayload>` 回传进度。
**Svelte 5 迁移方案**:

- **Type Safety**: 使用 Tauri v2 的 `invoke` 类型生成功能（如果可用）或手动维护严格的 TypeScript 接口定义 (`src/types/bridge.d.ts`)，确保前端调用与 Rust 签名一致。
- **Mocking**: 为 Web 端开发提供 `MockTransferService`，模拟 Rust 的进度回传行为，方便在浏览器中调试 UI。

## 第八十部分：设置面板 (Settings Panels)

### 80.1 表单状态管理 (Form State Management)

**现状**: `src/components/settings/*.tsx` (如 `FontPanel`, `LayoutPanel`) 使用了大量的 `useState` 和 `useEffect` 来同步每一个字段变更到持久化层。
**Svelte 5 迁移方案**:

- **Form Actions**: 对于简单的提交，利用 SvelteKit 的 Form Actions。
- **Auto-Sync Store**: 对于设置类（即时生效），创建一个自定义 Store，它包装了一个对象，任何属性的变更都会自动防抖(debounce)并写入持久化层。这消除了数十个手动编写的 `useEffect`。

## 第八十一部分：全局 UI 组件 (Global UI Components)

### 81.1 对话框与提示 (Dialog & Toast)

**现状**:

- `Dialog.tsx`: 包含复杂的拖拽关闭逻辑 (Mobile Drag-to-Dismiss)。
- `Toast.tsx`: 监听 Event Bus (`eventDispatcher`) 的单例组件。
  **Svelte 5 迁移方案**:
- **Snippet / Slot**: Svelte 的 Slot 机制非常适合 Dialog 内容分发。
- **Context API**: 使用 Svelte Context 或 Store 替代 Event Bus 来触发 Toast。
- **Svelte Actions**: 拖拽逻辑 (`useDrag`) 可以完美封装为 Svelte Action (`use:draggable`)，直接挂载到 DOM 元素上。

## 第八十二部分：同步后端 (Sync Backend)

### 82.1 API 路由 (API Routes)

**现状**: `src/pages/api/sync.ts` 是一个单体式的 Serverless 函数，包含认证、数据库查询、冲突解决等所有逻辑。
**Svelte 5 迁移方案**:

- **Routing**: 迁移到 `src/routes/api/sync/+server.ts`。
- **Service Layer**: 提取 `SyncService` 类，将数据库操作与 HTTP 处理解耦。
- **Streaming**: 利用 SvelteKit 的流式响应能力，优化大批量数据的同步性能。

## 第八十三部分：Tauri 集成 (Tauri Integration)

### 83.1 配置与权限 (Config & Permissions)

**现状**: `tauri.conf.json` 定义了严格的 CSP 和文件关联。
**Svelte 5 迁移方案**:

- **Static Adapter**: 确保 SvelteKit 构建输出适配 Tauri (`adapter-static`)。
- **Protocol Protocol**: 确保 `asset` 和 `ipc` 协议在 SvelteKit 的 CSP 配置中被允许。
- **Deep Links**: 迁移 `deep-link` 插件的事件监听逻辑到 Svelte 根组件 `onMount`。

## 第八十四部分：原生桥接插件 (Native Bridge Plugin)

### 84.1 全能桥接接口 (God Bridge Interface)

**现状**: `src-tauri/plugins/tauri-plugin-native-bridge` 暴露了 20+ 个命令（IAP, Auth, UI Control），是应用与原生 OS 交互的核心。
**Svelte 5 迁移方案**:

- **Typed Service**: 创建 `src/lib/services/native.ts`，为所有 `invoke` 调用提供强类型封装。
- **WebView Workarounds**: 保留针对 Android Webview bug (如 SafeArea 读取失败) 的回退逻辑，封装在 Service 内部。

## 第八十五部分：交互 Hook (Interaction Hooks)

### 85.1 DOM 操作钩子 (DOM Manipulation Hooks)

**现状**:

- `useDrag.ts`: 手动监听 mouse/touch 事件实现拖拽。
- `usePullToRefresh.ts`: 手动注入 `pull-indicator` DOM 节点并控制 transform。
  **Svelte 5 迁移方案**:
- **Svelte Actions**: 迁移为 `src/lib/actions`。
  - `use:draggable`: 处理拖拽事件流。
  - `use:pull_to_refresh`: 封装下拉逻辑，通过 Custom Event (`on:refresh`) 通知父组件，避免直接操作 DOM 注入（ Indicator 应由组件层渲染）。

## 第八十六部分：全局样式 (Global Styles)

### 86.1 Tailwind 与 全局 CSS (Tailwind & Global CSS)

**现状**: `src/styles/globals.css` 定义了基本的 Tailwind 指令和部分全局样式。
**Svelte 5 迁移方案**:

- **App.css**: 迁移至 `src/app.css`，并在根布局 (`+layout.svelte`) 中引入。
- **Scoped Styles**: 对于非通用的 CSS，尽量利用 Svelte 组件的 Scoped CSS 特性，减少全局污染。

## 第八十七部分：页面路由与布局 (Page Routing & Layout)

### 87.1 全局布局迁移 (Global Layout Migration)

**现状**: `src/pages/_app.tsx` 包含了全局的 `Head` 定义、Context Providers (`EnvProvider`) 和全局样式引用。
**Svelte 5 迁移方案**:

- **Root Layout**: 迁移至 `src/routes/+layout.svelte`。
- **Meta Tags**: 使用 `src/routes/+layout.svelte` 中的 `<svelte:head>` 标签替代 `next/head`。
- **Context**: 多数 Provider 可以简化为 Svelte 的 `setContext` 或直接导入 Store。

### 87.2 动态路由 (Dynamic Routing)

**现状**: `src/pages/reader/[ids].tsx` 处理阅读器路由。
**Svelte 5 迁移方案**:

- **Route Parameters**: 迁移至 `src/routes/reader/[ids]/+page.svelte`。参数通过 `page` store (`$page.params.ids`) 获取。

## 第八十八部分：元数据编辑器 (Metadata Editor)

### 88.1 复杂表单逻辑 (Complex Form Logic)

**现状**: `src/components/metadata/BookDetailEdit.tsx` 管理了极其复杂的表单状态，包括：

- 字段锁定逻辑 (`lockedFields`)
- 自动获取源选择逻辑 (`onAutoRetrieve`)
- 图片/文件选择 (`useFileSelector`)
  **Svelte 5 迁移方案**:
- **Form State Store**: 将编辑器状态封装为 `MetadataEditorStore`，处理字段的锁定、校验和脏检查。
- **Derived Stores**: 计算属性（如 `hasLockedFields`, `allFieldsLocked`）自然映射为 Svelte 的 Derived Stores (`$derived`)。
- **Action Integration**: 使用 `use:enhance` (SvelteKit Form Actions) 或客户端 Action 处理保存逻辑，提供更好的渐进增强支持。

## 第八十九部分：简易文本编辑器 (Simple Text Editor)

### 89.1 Textarea 封装 (Textarea Wrapper)

**现状**: `src/components/TextEditor.tsx` 封装了一个自动调整高度的 textarea，通过 `useImperativeHandle` 暴露 `focus`, `getValue` 等方法。
**Svelte 5 迁移方案**:

- **Bind Directive**: Svelte 的 `bind:value` 和 `bind:this` 可以完全替代 `useImperativeHandle` 和手动 Ref 操作。
- **Auto-resize Action**: 自动高度逻辑可以提取为 `use:autoresize` Action，解耦 UI 与逻辑。

## 第九十部分：混合路由统一 (Hybrid Router Unification)

### 90.1 App Router 与 Pages Router 共存 (Co-existence)

**现状**: 项目混合使用了 Next.js App Router (`src/app/page.tsx`, `src/app/reader`) 和 Pages Router (`src/pages/_app.tsx`). 这增加了架构复杂度。
**Svelte 5 迁移方案**:

- **Unified Routes**: 全部迁移至 SvelteKit 的 `src/routes` 目录。
- **Layout Reset**: 利用 SvelteKit 的 Group Layouts (`src/routes/(app)/+layout.svelte`, `src/routes/(reader)/+layout.svelte`) 来彻底分离阅读器和图书馆的布局逻辑，避免全局 `_app.tsx` 的臃肿。

## 第九十一部分：国际化 (Internationalization)

### 91.1 i18Next 迁移 (i18Next Migration)

**现状**: `src/i18n/i18n.ts` 初始化了 i18next 实例，组件中使用 hook 获取翻译函数。
**Svelte 5 迁移方案**:

- **libs/i18n**: 推荐使用 `svelte-i18n` 或 `paraglide-js`（更现代，针对 Svelte 优化）。
- **Derived Stores**: 翻译函数 `$t` 应作为 Store 暴露，确保语言切换时 UI 自动响应。

## 第九十二部分：离线支持 (Offline Support)

### 92.1 Serwist 与 Service Worker (Serwist & SW)

**现状**: `src/sw.ts` 使用 `serwist` (Workbox wrapper) 配置了 NetworkFirst 和 CacheFirst 策略。
**Svelte 5 迁移方案**:

- **Service Worker Module**: 迁移至 `src/service-worker.ts`。
- **Build Integration**: SvelteKit 构建时会自动生成文件清单 `$service-worker`，可以直接在 SW 中引用进行预缓存，比 Serwist 更原生。

## 第九十三部分：特性模块重组 (Feature Module Reorganization)

### 93.1 巨型阅读器目录 (Massive Reader Directory)

**现状**: `src/app/reader` 包含 87 个文件/子目录，大部分是组件。
**Svelte 5 迁移方案**:

- **Colocation**: 将特定于页面的组件直接放在 `src/routes/reader/[ids]/_components` 下。
- **Shared Lib**: 通用阅读器组件（如 `ReaderView`）移至 `src/lib/components/reader`。
- **Atomic Split**: 强制拆分大型业务组件 (e.g. `ReaderMenu`) 为更小的原子组件。

## 第九十四部分：OPDS 浏览器 (OPDS Browser)

### 94.1 浏览器状态机 (Browser State Machine)

**现状**: `src/app/opds/page.tsx` 使用 `useState` 和 `useRef` 混合管理浏览历史、当前 Feed、ViewMode ("feed", "publication", "search") 和搜索状态。逻辑复杂且难以测试。
**Svelte 5 迁移方案**:

- **OPDS Store**: 创建 `src/stores/opds.svelte.ts`，使用 Svelte 5 的 `$state` 实现一个有限状态机 (FSM)。
  - `state`: 'loading' | 'feed' | 'publication' | 'search' | 'error'
  - `history`: 维护浏览栈，支持前进后退。
  - `feed`: 当前解析后的 Feed 对象。
- **Service Layer**: 将 XML 解析 (`foliate-js/opds`)、鉴权 (`fetchWithAuth`) 和代理逻辑封装进 `OpdsService`。

### 94.2 Feed 渲染 (Feed Rendering)

**现状**: `FeedView`, `PublicationView`, `SearchView` 作为子组件通过条件渲染显示。
**Svelte 5 迁移方案**:

- **Component Switching**: 利用 `<svelte:component>` 或简单的 `{#if}` 块在 Svelte 组件中根据 Store 状态切换视图。

## 第九十五部分：高级文件抽象 (Advanced File Abstraction)

### 95.1 Native & Remote Files

**现状**: `src/utils/file.ts` 定义了 `NativeFile` (基于 Tauri FS) 和 `RemoteFile` (基于 Fetch Range)。它们实现了复杂的缓存 (`MRU Cache`)、分块读取 (`Chunk Caching`) 和流式处理。
**Svelte 5 迁移方案**:

- **Utility Migration**: 这是一个纯 TS 模块，不仅要迁移，还应加强测试。
- **Web Worker**: 考虑将 `RemoteFile` 的下载/缓存逻辑移至 Web Worker，避免阻塞主线程（虽然目前已经是异步的，但大量 IO 仍可能影响 UI 响应）。

## 第九十六部分：用户中心 (User Center)

### 96.1 用户资料与设置 (Profile & Settings)

**现状**: `src/app/user/page.tsx` 管理用户资料展示和设置。
**Svelte 5 迁移方案**:

- **Standard Migration**: 按标准组件迁移流程，利用 `src/stores/auth.ts` 获取用户信息。
- **Form Actions**: 使用 SvelteKit Form Actions 处理资料更新 (PUT /user)。

## 第九十七部分：选择引擎与交互 (Selection Engine & Interaction)

### 97.1 跨帧坐标映射 (Cross-Frame Coordinate Mapping)

**现状**: `src/utils/sel.ts` 实现了极其复杂的选取逻辑，处理了 iFrame 坐标转换、矩阵变换 (`matrix(...)`)、垂直排版支持以及 Popup 定位。
**Svelte 5 迁移方案**:

- **Selection Service**: 将 `sel.ts` 封装为 `SelectionService`，提供纯计算方法。
- **Svelte Action**: 创建 `use:selection_observer` action，监听 DOM 事件并将标准化后的坐标/Range 发送给 Service，解耦 DOM 操作与业务逻辑。

## 第九十八部分：系统意图处理 (System Intent Handling)

**现状**: `src/hooks/useOpenWithBooks.ts` 监听 Tauri 的Deep Link、File Open 和 Shared Intent 事件，处理 iOS/Android/Desktop 的差异。
**Svelte 5 迁移方案**:

- **Intent Store**: 创建 `src/stores/intent.svelte.ts`，作为一个单例监听器。在应用启动 (`+layout.svelte` onMount) 时初始化监听，并将接收到的文件/URL 放入队列供其他组件消费。

## 第九十九部分：图书馆重构 (Library Page Refactoring)

**现状**: `src/app/library/page.tsx` 是一个 800+ 行的巨型组件，混合了文件导入、同步逻辑、快捷键、UI 状态（选择模式）和视图渲染。
**Svelte 5 迁移方案**:

- **Composition**:
  - `LibraryContainer.svelte`: 顶层容器，处理 Layout 和 Global Events。
  - `LibraryManager.svelte`: 处理导入、同步等非 UI 业务。
  - `BookGrid.svelte` / `BookList.svelte`: 纯 UI 组件，接收 `books` prop。
- **Stores**: 将 `isSelectMode`, `selectedBooks` 等 UI 状态移至 `library_ui.svelte.ts` Store。

## 第一百部分：SSML 语音合成引擎 (SSML TTS Engine)

**现状**: `src/utils/ssml.ts` 手动构建 SSML 标签，处理多语言混合朗读（`<lang>` 标签嵌套）。
**Svelte 5 迁移方案**:

- **TTS Pipeline**: 将 SSML 生成逻辑集成到 TTS Service 的 Pipeline 中。
- **Validation**: 增加 SSML 结构的验证，防止非法标签导致引擎崩溃。

## 第一百零一部分：全局错误边界 (Global Error Boundary)

**现状**: `src/app/error.tsx` 是 Next.js App Router 的全局错误处理页面。它集成了 PostHog 异常上报，并提供了用户友好的错误信息和重试机制 (`reset()`)。
**Svelte 5 迁移方案**:

- **Error Page**: 迁移至 `src/routes/+error.svelte`。SvelteKit 的错误页面可以直接访问 `$page.error`。
- **Global Handler**: 使用 handle 钩子 (`src/hooks.client.ts`, `src/hooks.server.ts`) 中的 `handleError` 函数统一上报异常到 PostHog。

## 第一百零二部分：离线回退 (Offline Fallback)

**现状**: `src/app/offline/page.tsx` 提供了一个简单的离线提示页面。
**Svelte 5 迁移方案**:

- **Offline HTML**: 创建 `src/offline.html` (SvelteKit 约定) 用于 Service Worker 回退。
- **Store Awareness**: `src/stores/online.ts` 监听 `window.ononline`/`onoffline`，在 UI 中显示更细粒度的离线状态提示，而不仅仅是全屏错误。

## 第一百零三部分：文本转换管道 (Text Processing Pipeline)

**现状**: `src/services/transformers` 包含 Proofread, Punctuation, Whitespace 等多个文本处理器。目前的实现方式较为散乱。
**Svelte 5 迁移方案**:

- **Pipeline Pattern**: 创建 `TextPipeline` 类，允许按需组合多个 Transformer。
- **Worker Offload**: 文本校对 (`proofread.ts`) 涉及大量正则和替换逻辑，应移至 Web Worker 运行，利用 `$worker` 通信。

## 第一百零四部分：根上下文重组 (Root Context Reorganization)

**现状**: `src/components/Providers.tsx` 嵌套了 Auth, Sync, Theme, PostHog 等多个 Provider。
**Svelte 5 迁移方案**:

- **Root Layout Logic**: 大部分逻辑移至 `src/routes/+layout.svelte` 的初始化脚本中。
- **Reactive Context**: 使用 Svelte 5 的 `setContext` 配合 `$state` 对象，替代 React 的 Context.Provider 嵌套地狱。

## 第一百零五部分：Edge TTS 客户端 (Edge TTS Client)

**现状**: `src/libs/edgeTTS.ts` 是一个完整的 WebSocket 客户端，模拟 Microsoft Edge 浏览器的 TTS 协议。它处理鉴权 (`Sec-MS-GEC`)、SSML 构建、二进制流拼接 (`ArrayBuffer`) 和音频缓存 (`LRUCache`)。
**Svelte 5 迁移方案**:

- **Service Worker**: 将 WebSocket 连接和二进制处理移至 Web Worker 甚至 Shared Worker，避免音频流阻塞主线程。
- **Audio Store**: 创建 `audio_player.svelte.ts` Store，管理播放状态和队列，与 UI 解耦。

## 第一百零六部分：媒体会话管理 (Media Session Management)

**现状**: `src/libs/mediaSession.ts` 封装了 `navigator.mediaSession` API，并在 Android 上回退到 Native Plugin。
**Svelte 5 迁移方案**:

- **Singleton Service**: 保持为单例类，但在初始化时注入 Svelte 的 Store 回调，以便 UI 响应外部媒体控制（如耳机按键）。

## 第一百零七部分：自定义字体存储 (Custom Font Store)

**现状**: `src/store/customFontStore.ts` 使用 IndexedDB (通过 AppService) 管理用户上传的字体文件。
**Svelte 5 迁移方案**:

- **Async Store**: 使用 Svelte 的 `await` 块配合 Store，处理字体加载的异步状态 (`loading`, `error`, `loaded`)。

## 第一百零八部分：支付适配层 (Payment Adapter Layer)

**现状**: `src/libs/payment` 包含 Stripe (Web) 和 IAP (Apple/Google) 的实现。
**Svelte 5 迁移方案**:

- **Unified Interface**: 定义统一的 `PaymentService` 接口。
- **Environment Switching**: 在 `src/services/payment.ts` 中根据 `ENVIRONMENT` 动态导入实现，利用 Vite 的 tree-shaking 减少包体积。

## 第一百零九部分：自动更新 UI (Auto-Updater UI)

**现状**: `src/components/UpdaterWindow.tsx` 处理检查更新、下载进度、Markdown 解析渲染以及**自动翻译更新日志**。逻辑非常厚重。
**Svelte 5 迁移方案**:

- **Component Splitting**: 将 "Update Check Logic" 移至 Store (`updater.svelte.ts`)。UI 组件只负责展示状态。
- **Translation Service**: 更新日志的翻译逻辑应复用通用的 `TranslatorService`，通过 Store 触发。

## 第一百一十部分：MacOS 窗口控制 (Traffic Lights)

**现状**: `src/store/trafficLightStore.ts` 管理 MacOS 红绿灯按钮的显示/隐藏（全屏时）。
**Svelte 5 迁移方案**:

- **Layout Action**: 创建 `use:traffic_lights` Action 挂载到根 Layout 元素上，自动监听全屏事件并调用 Tauri API。

## 第一百一十一部分：API 客户端与进度 (API Client & Progress)

**现状**: `src/libs/storage.ts` 封装了与后端存储服务的 REST 通信，包含复杂的上传/下载进度计算逻辑。
**Svelte 5 迁移方案**:

- **Progress Store**: 创建可复用的 `ProgressStore` 类，用于管理任何长运行任务（上传、下载、同步）的进度状态。

## 第一百一十二部分：Rust 后端与生命周期 (Rust Backend & Lifecycle)

**现状**: `src-tauri/src/lib.rs` 是 Taurus 应用的入口，负责插件注册、窗口创建、E-ink 优化检测、Alipay 协议拦截 (`alipays://`) 以及文件权限 (`fs_scope`) 管理。
**Svelte 5 迁移方案**:

- **Backend Events**: 使用 `tauri-plugin-emit` 或 `listen` 将后端生命周期事件（如 `window-ready`, `deep-link-received`）桥接到 Svelte Store (`lifecycle.svelte.ts`)。
- **Safe Area Action**: 将 JavaScript 注入的 Safe Area 逻辑替换为 Svelte Action `use:safe_area`，更动态地处理移动端刘海屏。

## 第一百一十三部分：元数据编辑器与自动获取 (Metadata Editor & Auto-Retrieve)

**现状**: `src/components/metadata/useMetadataEdit.ts` 管理复杂的表单状态，包括字段锁定、ISBN 校验和调用 metadata provider (Google Books, OpenLibrary 等) 自动填充。
**Svelte 5 迁移方案**:

- **Form State**: 使用 SvelteKit 的 `superforms` 库或原生的 `$state` 对象管理复杂的表单验证和脏检查。
- **Metadata Service**: 将 `searchMetadata` 逻辑封装为 `MetadataService`，支持插件化的 Provider 架构。

## 第一百一十四部分：排版设置引擎 (Layout Settings Engine)

**现状**: `src/components/settings/LayoutPanel.tsx` 是一个巨大的组件 (770+ 行)，负责生成所有阅读器的 CSS 变量（页边距、行高、书写模式）。它直接操作 DOM 属性 (`view.renderer.setAttribute`)。
**Svelte 5 迁移方案**:

- **Reactive CSS**: 利用 Svelte 的 Style Directives (`style:--margin-top={val}`)，将状态直接绑定到阅读器容器，消除手动的 `setAttribute` 调用。
- **Composable Panels**: 将大面板拆分为 `MarginControl.svelte`, `FontControl.svelte` 等原子组件。

## 第一百一十五部分：构建与发布脚本 (Build & Release Scripts)

**现状**: `scripts/` 目录包含发布到各应用商店的 Shell 脚本 (`release-google-play.sh` 等)，处理版本号同步和 changelog 生成。
**Svelte 5 迁移方案**:

- **CI/CD Integration**: 保持脚本独立，但在 `package.json` 中配置对应的 npm scripts。
- **Version Sync**: 确保 SvelteKit 的 `package.json` 版本号是单一事实来源 (`Source of Truth`)。

## 第一百一十六部分：同步逻辑 (Synchronization Logic)

**现状**: `src/hooks/useSync.ts` 管理书籍、配置和笔记的增量同步。它依赖 `lastSyncedAt` 时间戳和 `max(updated_at, deleted_at)` 逻辑来计算差异。
**Svelte 5 迁移方案**:

- **Sync Machine**: 使用 XState 或简单的 FSM Store 替代 `useSync` 中分散的 state (`syncingBooks`, `syncingConfigs`, `syncError`)，确保同步状态的可预测性。
- **Background Sync**: 将同步逻辑移至 Service Worker (如果可能) 或全局单例 Store，确保页面切换不会中断同步。

## 第一百一十七部分：图片缓存与加载 (Image Caching & Loading)

**现状**: `src/components/CachedImage.tsx` 使用内存 `Map` (`imageUrlCache`) 缓存 Blob URL，防止重复请求。它还处理了组件卸载时的 Promise 取消。
**Svelte 5 迁移方案**:

- **Image Action**: 创建 `use:lazy_image` Action，封装 IntersectionObserver 和缓存逻辑。
- **Persistent Cache**: 考虑将图片缓存从内存 Map 升级到 Cache API (Service Worker)，以支持离线访问封面图。

## 第一百一十八部分：翻译引擎 (Translation Engine)

**现状**: `src/hooks/useTranslator.ts` 封装了多源翻译逻辑 (Azure/DeepL)，处理缓存、限流重试、预处理 (`preprocess`) 和润色 (`polish`).
**Svelte 5 迁移方案**:

- **Translation Service**: 保持核心逻辑不变，但在 `src/services/translator.ts` 中实现为纯 TS 类。
- **Streaming UI**: 如果后端支持流式翻译 (如 AI 翻译)，Store 应支持流式更新 UI，而不是等待整个数组返回。

## 第一百一十九部分：服务器端元数据搜索 (Server-Side Metadata Search)

**现状**: `src/app/api/metadata/search/route.ts` 是一个 Next.js API Route，它调用 `src/services/metadata/service.ts` 来聚合 Google Books 和 OpenLibrary 的搜索结果。这确保了 API Key (`GOOGLE_BOOKS_API_KEYS`) 不暴露给前端。
**Svelte 5 迁移方案**:

- **Server Endpoint**: 迁移至 `src/routes/api/metadata/search/+server.ts`。
- **Service Reuse**: 保持 `MetadataService` 逻辑不变，但在 SvelteKit 的 `$env/static/private` 中安全地读取环境变量。

## 第一百二十部分：服务端 TTS 代理 (Server-Side TTS Proxy)

**现状**: `src/app/api/tts/edge/route.ts` 代理了 Edge TTS 的请求。虽然 Tauri 端可以直接连接 WebSocket，但 Web 端可能因 CORS 或协议限制需要此代理。
**Svelte 5 迁移方案**:

- **Server Endpoint**: 迁移至 `src/routes/api/tts/edge/+server.ts`。确保 Node.js 环境支持 `ws` 库或使用 HTTP 转发。

## 第一百二十一部分：支付 Webhooks (Payment Webhooks)

**现状**: `src/app/api/stripe` 等目录表明存在服务端支付回调处理逻辑。
**Svelte 5 迁移方案**:

- **Webhook Handlers**: 迁移至 `src/routes/api/webhooks/stripe/+server.ts`。验证 Stripe 签名并更新数据库中的用户订阅状态。

## 第一百二十二部分：文档解析核心 (Core Document Parsing)

**现状**: `src/libs/document.ts` 定义了核心的 `BookDoc` 接口和解析逻辑 (ZIP, EPUB, PDF detection)。它依赖 `foliate-js` 和 `@zip.js/zip.js`。
**Svelte 5 迁移方案**:

- **Shared Library**: 这是一个纯逻辑库，直接移动到 `src/lib/parsing/document.ts`。
- **Lazy Import**: 保持动态导入 (`await import(...)`) 以优化 Bundle 体积，通过 Vite 的 code-splitting 自动处理。

## 第一百二十三部分：核心阅读器外壳 (Core Reader Wrapper)

**现状**: `src/app/reader/components/FoliateViewer.tsx` (500+ 行) 是 `foliate-js` 的 React Wrapper。它管理阅读器实例的生命周期、挂载字体、注入 CSS、处理事件桥接 (IFrame -> Main Window) 以及自动保存进度。
**Svelte 5 迁移方案**:

- **Svelte Action**: 使用 `use:foliate` Action 替代 React 的 `useEffect` 和 `useRef` 迷宫。Action 可以在元素挂载时初始化阅读器，销毁时自动清理。
- **Reactive Props**: 将 `bookDoc`, `config` 等 Props 改为 Svelte `$props`，利用 Runes 的细粒度响应性来触发特定的更新（例如只更新 CSS 而不重载书籍）。

## 第一百二十四部分：脚注弹出层 (Footnote Popup System)

**现状**: `src/app/reader/components/FootnotePopup.tsx` 使用 `foliate-js` 的 `FootnoteHandler` 拦截链接点击，计算弹出位置 (`getPopupPosition`)，并渲染一个迷你的 `foliate-view` 来显示脚注内容。
**Svelte 5 迁移方案**:

- **Teleport Component**: 使用 Svelte 的 `<svelte:fragment>` 或 Portal 机制将 Popup 渲染到 `body` 根部。
- **Simplified Handler**: 将 `FootnoteHandler` 逻辑移至 `ReaderStore`，Popup 组件仅作为纯 UI 呈现 Store 中的内容。

## 第一百二十五部分：云存储工具库 (Cloud Storage Utils)

**现状**: `src/utils/r2.ts` 和 `s3.ts` 提供了生成 AWS/Cloudflare R2 预签名 URL (Signed URLs) 的功能。这些是纯服务器端逻辑，依赖 `process.env`。
**Svelte 5 迁移方案**:

- **Server Utility**: 移动至 `src/lib/server/storage.ts`，确保这些敏感逻辑（涉及 Secret Keys）永远不会泄露到客户端 Bundle。使用 `$env/static/private` 强类型环境变量。

## 第一百二十六部分：构建配置迁移 (Build Configuration Migration)

**现状**: `next.config.mjs` 配置了静态导出 (`output: 'export'`) 以适配 Tauri，并集成了 `serwist` (PWA) 和 `bundle-analyzer`。
**Svelte 5 迁移方案**:

- **Vite Config**: 使用 `vite.config.ts` 替代。SvelteKit 默认支持 `adapter-static` (用于 Tauri) 和 `adapter-node` (用于 Web 容器)。
- **PWA**: 使用 `vite-plugin-pwa` 替代 `serwist/next`，配置 Service Worker 的生成策略。

## 第一百二十七部分：主题引擎 (Theme Engine)

**现状**: `src/styles/themes.ts` 定义了基于 Oklch/Hex 的主题调色板，并包含 `applyCustomTheme` 函数，该函数手动将生成的 CSS 变量注入到 `<head>` 中的 `<style>` 标签。
**Svelte 5 迁移方案**:

- **CSS Variables**: 将主题变量定义保留在 CSS 中。可以使用 Svelte 的 Head Management (`<svelte:head>`) 来动态注入自定义主题样式，或者将 Theme Store 绑定到 CSS 变量。

## 第一百二十八部分：即时标注交互 (Instant Annotation Interaction)

**现状**: `src/app/reader/hooks/useInstantAnnotation.ts`是一个复杂的 Hook，通过监听 Pointer Events (`down`, `move`, `up`) 来实现“拖拽即高亮”功能。它直接操作 DOM Range 和 Selection API。
**Svelte 5 迁移方案**:

- **Interaction Action**: 将此逻辑封装为 `use:instant_annotation` Action。Svelte Actions 非常适合处理此类低级 DOM 事件监听和清理工作，且不依赖组件渲染周期。

## 第一百二十九部分：文本处理流水线 (Text Processing Pipeline)

**现状**: `src/services/transformers` 定义了一系列文本处理器（标点、注音、简繁转换、校对），通过 `index.ts` 导出并在 `FoliateViewer` 中按顺序执行。这是同步执行的，可能阻塞 UI。
**Svelte 5 迁移方案**:

- **Worker Pipeline**: 将整个 Transform Pipeline 移至 Web Worker。
- **Streaming Transform**: 如果可能，设计为流式处理接口，处理一部分内容就返回一部分，加速首屏渲染。

## 第一百三十部分：统一支付客户端 (Unified Payment Client)

**现状**: `src/libs/payment/iap/client.ts` 尝试统一 Apple App Store 和 Google Play Billing 的接口，但同时也混杂了 Stripe 的逻辑引用，且类型定义分散。
**Svelte 5 迁移方案**:

- **Payment Adapter**: 定义严格的 `PaymentAdapter` 接口，并为 Web (Stripe), iOS (StoreKit), Android (BillingClient) 分别实现。
- **Dependency Injection**: 在应用启动时根据平台注入具体的 Adapter 实例。

## 第一百三十一部分：系统 Shell 扩展 (System Shell Extensions)

**现状**: `extensions/windows-thumbnail` 是一个 Rust Crate，用于在 Windows 资源管理器中显示电子书封面缩略图。这是一个独立的 OS 集成组件。
**Svelte 5 迁移方案**:

- **Wait & See**: 此部分与 Svelte 迁移无直接关联，但需确保构建脚本 (`scripts/release-windows.sh` if exists) 继续支持编译此扩展并打包到 Installer 中。

## 第一百三十二部分：KOReader 同步协议 (KOReader Sync Protocol)

**现状**: `src/app/reader/hooks/useKOSync.ts` 实现了 KOReader 的进度同步协议，包括 CFI 到 XPointer 的复杂的转换逻辑。它处理“冲突解决”流程 (`promptedSync`)。
**Svelte 5 迁移方案**:

- **Protocol Service**: 将 `KOSyncClient` 和 CFI 转换逻辑独立为 `SyncService`。
- **Conflict UI**: 将冲突解决 UI (`local vs remote`) 实现为独立的 Svelte 组件，当 Store 状态变为 `conflict` 时自动弹出。

## 第一百三十三部分：全局快捷键系统 (Global Shortcuts System)

**现状**: `src/app/reader/hooks/useBookShortcuts.ts` 监听全局键盘事件，并分发到 `ReaderStore` 或触发 `eventDispatcher` (例如 `zoom-in`, `tts-toggle`)。
**Svelte 5 迁移方案**:

- **Window Event Action**: 使用 `use:shortcut` Action 绑定在 `svelte:window` 上。
- **Command Palette**: 考虑将所有快捷键操作注册到一个中央 Command Registry，未来可支持类似 VS Code 的命令面板。

## 第一百三十四部分：标注器重构 (Annotator Refactoring)

**现状**: `src/app/reader/components/annotator/Annotator.tsx` 是一个 1000+ 行的巨型组件，混合了 DOM 事件监听、Foliate 绘图回调、弹出层定位计算以及具体的业务功能（翻译、百科、高亮）。
**Svelte 5 迁移方案**:

- **Selection Manager**: 将选择逻辑（`Selection` 对象的创建和维护）移至 `SelectionStore`。
- **Renderer Service**: 将 `onDrawAnnotation` 绘图逻辑移至 `ReaderRenderService`。
- **UI Composition**: 将 `Annotator` 拆分为 `SelectionHandler` (无头组件) 和 `ContextPopup` (纯 UI 组件)。

## 第一百三十五部分：侧边栏手势 (Sidebar Gestures)

**现状**: `src/app/reader/components/sidebar/SideBar.tsx` 实现了复杂的拖拽调整大小和移动端上滑手势，逻辑硬编码在组件中。
**Svelte 5 迁移方案**:

- **Gesture Action**: 使用 `use:pannable` (基于 `@use-gesture` 或原生 Pointer Events) 来处理拖拽。
- **Spring Physics**: 结合 `svelte/motion` 的 `Spring` 或 `Tweened` 来处理侧边栏的平滑回弹动画，替代手动的 CSS transition 操作。

## 第一百三十六部分：搜索服务与缓存 (Search Service & Caching)

**现状**: `src/app/reader/components/sidebar/SearchBar.tsx` 不仅负责 UI，还直接操作文件系统来缓存搜索结果 (`appService.writeFile`) 并管理搜索生成器的迭代。
**Svelte 5 迁移方案**:

- **Search Service**: 将搜索逻辑（生成器迭代、去重、进度报告）封装为 `SearchService`。
- **Cache Middleware**: 将文件系统缓存实现为一个透明的 Middleware 或 Decorator，与 UI 完全解耦。 UI 只需调用 `searchService.search(query)`。

## 第一百三十七部分：应用服务层 (AppService Layer)

**现状**: `src/services/appService.ts` 定义了抽象基类 `BaseAppService`，并有 `NativeAppService` (Tauri) 和 `WebAppService` (Browser) 两个实现。它管理文件系统、设置加载和书籍导入。
**Svelte 5 迁移方案**:

- **Dependency Injection**: 继续保持此模式。在 `Root Layout` 或 `Context` 中根据环境注入具体的 `AppService` 实例。
- **Store Integration**: 让 `AppService` 直接更新 Svelte Store（如 `books` Store），而不是返回数据让 UI 去更新。

## 第一百三十八部分：自动更新器 (Auto Updater)

**现状**: `src/components/UpdaterWindow.tsx` 是一个独立的 React 组件，负责检查更新、显示变更日志、下载安装包。它混合了 UI 和业务逻辑。
**Svelte 5 迁移方案**:

- **Updater Store**: 将 `checkUpdate`, `downloadUpdate` 等逻辑移至 `UpdaterStore`。
- **Standalone Window**: 在 Tauri 中，更新窗口通常是一个独立的 Window。SvelteKit 可以通过多入口配置 (`mpa`) 或路由判断来渲染这个独立窗口。

## 第一百三十九部分：支付 Webhooks (Stripe Webhooks)

**现状**: `src/app/api/stripe/webhook/route.ts` 是 Next.js 的 API Route，处理 Stripe 的回调并更新 Supabase 数据库。
**Svelte 5 迁移方案**:

- **Server Route**: 迁移至 `src/routes/api/stripe/webhook/+server.ts`。
- **Supabase Service Role**: 确保在服务端安全地初始化 Supabase Admin Client (`service_role` key)，绝不暴露给客户端。

## 第一百四十部分：身份验证上下文 (Auth Context)

**现状**: `src/context/AuthContext.tsx` 是一个 React Context，它手动同步 Supabase 会话到 `localStorage` 并提供给全应用。
**Svelte 5 迁移方案**:

- **Auth Store**: 使用 Svelte Store (`authStore`) 替代 Context。
- **Auto-Sync**: 利用 Supabase Client built-in 的持久化机制，不再手动操作 `localStorage` (除非是为了兼容旧版数据)。
- **Server Guard**: 使用 SvelteKit `hooks.server.ts` 来保护 `/user` 等路由。

## 第一百四十一部分：用户个人中心 (User Profile Page)

**现状**: `src/app/user/page.tsx` 是一个功能密集的页面，处理个人信息展示、配额统计、套餐对比和支付入口。
**Svelte 5 迁移方案**:

- **Component Splitting**: 将 `UserInfo`, `UsageStats`, `PlansComparison` 拆分为独立的 Svelte 组件。
- **Route Decomposition**: 考虑将支付流程 (`/user/checkout`) 拆分为子路由，而不是在同一页面中条件渲染。

## 第一百四十二部分：认证回调处理 (Auth Callback Handling)

**现状**: `src/app/auth/page.tsx` 处理了多种环境下的回调（Web URL, Deep Link, Localhost Server）。
**Svelte 5 迁移方案**:

- **Unified Handler**: 在 `src/routes/auth/callback/+page.svelte` 中统一处理 OAuth 回调。
- **Platform Detection**: 使用 `AppService` 检测运行环境，决定是重定向到应用内页面还是调用 Deep Link 关闭浏览器窗口。

## 第一百四十三部分：Rust 后端命令 (Rust Backend Commands)

**现状**: `src-tauri/src/lib.rs` 暴露了一系列 Tauri Commands (`start_server`, `get_environment_variable`) 并初始化了众多插件。
**Svelte 5 迁移方案**:

- **Command Wrappers**: 保持 `src/utils/bridge.ts` 中的封装，确保前端调用不受影响。
- **File Association**: 注意 `set_window_open_with_files` 逻辑，它通过 `eval` 注入全局变量。在 SvelteKit 中，应在 `onMount` 中检查 `window.OPEN_WITH_FILES`。

## 第一百四十四部分：自动更新逻辑封装 (Updater Helpers)

**现状**: `src/helpers/updater.ts` 包含了解析 Android/Desktop 更新 JSON 的逻辑。
**Svelte 5 迁移方案**:

- **Updater Service**: 将其重构为 `UpdaterService` (单例)，不再散落在 helper 函数中。支持 `checkForUpdates()` 返回统一的 `UpdateInfo` 对象。

## 第一百四十五部分：Service Worker 配置 (Serwist Strategy)

**现状**: `src/sw.ts` 使用 `Serwist` 配置了详细的缓存策略（字体 CacheFirst, 页面 NetworkFirst）。
**Svelte 5 迁移方案**:

- **Vite PWA Plugin**: 使用 `vite-plugin-pwa` 的 `injectManifest` 模式，直接复用现有的 Service Worker 逻辑，或者迁移到 SvelteKit 推荐的 Service Worker 方案。

## 第一百四十六部分：中间件与 CORS (Middleware & CORS)

**现状**: `src/middleware.ts` 处理了 API 路由的 CORS 头。
**Svelte 5 迁移方案**:

- **Handle Hook**: 使用 SvelteKit 的 `handle` 钩子 (`src/hooks.server.ts`) 来处理 CORS 和 API 请求拦截。这是 SvelteKit 处理中间件的标准方式。

## 第一百四十七部分：桥接工具 (Bridge Utility)

**现状**: `src/utils/bridge.ts` 封装了 Tauri `invoke` 调用，提供了强类型的接口来与 Rust 后端通信。
**Svelte 5 迁移方案**:

- **Direct Port**: 该文件可以直接迁移到 `src/lib/services/bridge.ts`。
- **Type Safety**: 保持接口定义，确保前后端通信类型安全。

## 第一百四十八部分：同步服务 (Sync Service)

**现状**: `src/hooks/useSync.ts` 是一个巨大的 Hook，管理书籍、配置和笔记的同步状态、冲突解决和时间戳更新。
**Svelte 5 迁移方案**:

- **Service Extraction**: 将核心逻辑重构为 `SyncService` 类。
- **Reactive Store**: 创建 `syncStore` 来暴露 `syncing`, `lastSyncedAt`, `syncError` 等状态，而不是将它们分散在组件状态中。

## 第一百四十九部分：翻译服务 (Translation Service)

**现状**: `src/hooks/useTranslator.ts` 管理翻译请求、缓存、预处理（分段）和后处理（润色）。
**Svelte 5 迁移方案**:

- **Service Architecture**: 提取 `TranslationService`，负责具体的翻译 API 调用和缓存策略。
- **Store Integration**: 用户选择的翻译提供商 (`selectedProvider`) 应存储在 `settingsStore` 中。

## 第一百五十部分：全局状态迁移总结 (Global State Migration Summary)

**现状**: 项目大量使用 Zustand (`readerStore`, `libraryStore`, `bookDataStore`) 和 React Context。
**Svelte 5 迁移方案**:

- **Svelte Stores**: 将所有 Zustand store 重写为 Svelte Stores (`writable`, `derived`)。
- **Module State**: 利用 `.svelte.ts` (Svelte 5 Runes) 来创建更现代的响应式状态对象，特别是对于 `ReaderView` 这种复杂对象。
- **Separation**: 严格区分 **UI State** (Menu visibility, Zoom level) 和 **Data State** (Book content, Library metadata)。

## 第一百五十一部分：书架页面重构 (Library Page Refactoring)

**现状**: `src/app/library/page.tsx` 是一个巨型组件，聚合了导入、同步、更新、拖拽、选择模式等所有逻辑。
**Svelte 5 迁移方案**:

- **Controller De-coupling**: 将业务逻辑拆分到 `LibraryController.svelte.ts` (使用 Runes) 或多个 Svelte Stores。
- **Component Decomposition**: 拆分 `LibraryImportManager`, `LibrarySyncManager`, `LibraryUpdateManager` 为无渲染组件或逻辑块。

## 第一百五十二部分：书架渲染优化 (Bookshelf Rendering)

**现状**: `Bookshelf.tsx` 直接渲染所有过滤后的书籍，没有使用虚拟滚动。对于拥有上千本书的用户，性能可能会下降。
**Svelte 5 迁移方案**:

- **Virtualization**: 考虑使用 Svelte 的虚拟列表库 (如 `svelte-virtual-scroll-list`) 来渲染书架网格。
- **Context Usage**: 使用 Svelte Context (`setContext`/`getContext`) 来传递 `isSelectMode` 等状态，避免多层 Props 传递。

## 第一百五十三部分：简易文本编辑器 (Text Editor)

**现状**: `src/components/TextEditor.tsx` 封装了一个自动调整高度的 `textarea`。
**Svelte 5 迁移方案**:

- **Svelte Action**: 使用 `use:autoresize` Action 来替代 React 的 `useEffect` 和 DOM 操作，实现更优雅的自动高度调整。

## 第一百五十四部分：Markdown 渲染服务 (Markdown Rendering)

**现状**: `BooknoteItem.tsx` 直接使用 `marked` 库来解析 Markdown。
**Svelte 5 迁移方案**:

- **Markdown Component**: 创建 `<Markdown {content} />` 组件，统一配置 safehtml/sanitization 策略，避免在各个组件中散落 `marked.parse` 调用。

## 第一百五十五部分：导航控制器 (Navigation Controller)

**现状**: 翻页逻辑 (`handleGoNextPage`, `view.history.back`) 散落在 `FooterBar.tsx`, `useShortcuts.ts`, `SideBar.tsx` 等多处。
**Svelte 5 迁移方案**:

- **Unified Controller**: 将所有导航动作（翻页、跳转章节、跳转百分比）封装在 `NavigationController.svelte.ts` 中。
- **Command Pattern**: 使用命令模式 (`Execute(NextPageCommand)`) 来处理由于不同输入源（键盘、点击、触摸）触发的导航。

## 第一百五十六部分：底部栏重构 (FooterBar Refactor)

**现状**: `FooterBar.tsx` 同时包含 Desktop 和 Mobile 的逻辑，且包含大量状态计算。
**Svelte 5 迁移方案**:

- **Responsive Layout**: 利用 CSS Media Queries 和 Svelte `{#if}` 块根据屏幕宽度渲染不同布局，而不是加载两个完全不同的子组件。
- **Store-Driven**: 进度信息 (`progressFraction`) 应直接从 `readerStore` 派生，而不是在组件内计算。

## 第一百五十七部分：元数据编辑组件 (Metadata Editor)

**现状**: `BookDetailEdit.tsx` 是一个复杂的表单，手动管理锁定状态、多源数据合并和校验。
**Svelte 5 迁移方案**:

- **Form Action**: 利用 SvelteKit 的 `enhance` Form Action 或 `svelte-forms-lib` 来处理表单状态和验证。
- **Component Composition**: 将锁定按钮、来源选择器封装为 `<FieldLock />` 和 `<SourceSelector />` 小组件。

## 第一百五十八部分：TTS 架构重构 (TTS Architecture)

**现状**: `TTSControl.tsx` (UI) 与 `TTSController.ts` (Logic) 紧密耦合，且直接操作 `window.speechSynthesis` 或 Native Bridge。
**Svelte 5 迁移方案**:

- **TTS Service**: 将 `TTSController` 升级为全局单例服务，通过 Store 暴露 `isPlaying`, `currentVoice`, `rate` 等状态。
- **Adapter Pattern**: 保持现有的 `EdgeTTSClient`, `NativeTTSClient`, `WebSpeechClient` 接口，但通过依赖注入方式提供给 Service。

## 第一百五十九部分：原生服务移植 (Native Service Porting)

**现状**: `NativeAppService.ts` 包含复杂的路径解析逻辑（支持 Portable 模式和自定义 Root Dir）。
**Svelte 5 迁移方案**:

- **FileSystem Interface**: 保持 `IFileSystem` 接口，但针对 SvelteKit 环境优化 `resolvePath` 逻辑。
- **Environment Awareness**: 确保 `NativeAppService` 只在 Tauri 环境中初始化，Web 环境使用 `WebAppService`。

## 第一百六十部分：API 路由迁移 (API Routes Migration)

**现状**: `src/app/api` 下有 Stripe Checkout, OPDS Proxy, Edge TTS Proxy 等路由。
**Svelte 5 迁移方案**:

- **Server Routes**: 将 `src/app/api/*` 迁移至 `src/routes/api/*` (+server.ts)。
- **Stream Response**: 尤其是 Edge TTS 和 OPDS Proxy，需要利用 SvelteKit 的 `Response` 对象支持流式传输 (Streaming)。

## 第一百六十一部分：TTS 引擎库重构 (Edge TTS Library Refactor)

**现状**: `src/libs/edgeTTS.ts` 包含复杂的 WebSocket 握手协议和音频拼接逻辑，且混杂了 Tauri 和 Web 两种 Socket 实现。
**Svelte 5 迁移方案**:

- **Isomorphic Library**: 将 `EdgeSpeechTTS` 封装为纯 `server-side` 库（用于 API Route），客户端只负责请求 API。
- **Environment Logic**: 移除客户端直接连接 WebSocket 的逻辑（防止 CORS 和 Mixed Content 问题），统一通过 `/api/tts/edge` 转发。

## 第一百六十二部分：支付与内购统一 (Unified Payment & IAP)

**现状**: `src/libs/payment` 和 `src/libs/iap` 分散了支付逻辑。
**Svelte 5 迁移方案**:

- **Payment Service**: 建立统一的 `PaymentService`，根据平台（Mobile/Web）自动切换 IAP 或 Stripe。
- **Server Verification**: 确保所有 IAP 验证逻辑都在 Server Side (`src/routes/api/payment/verify/+server.ts`) 执行，不暴露密钥。
