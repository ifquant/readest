# 多平台适配指南 (Platform Adaptation Guide)

Readest 是一个跨平台应用（Web, Desktop, Mobile），为了在不同设备上提供最佳体验，代码库中包含了针对特定平台的适配逻辑。本文档详细列举了这些适配点及其原因。

## 1. 适配架构概览

项目采用 "核心 + 适配层" 的架构：

- **Web 前端 (`src`)**: 负责通用 UI 和业务逻辑。通过 `AppService` 接口屏蔽底层差异。
- **Native 后端 (`src-tauri`)**: 使用 Rust 编写，负责系统级能力。通过 `#[cfg]` 宏进行条件编译，仅包含目标平台所需的模块。

---

## 2. 前端适配 (`src`)

前端主要通过 **Service 抽象** 和 **环境检测** 来处理差异。

### 2.1 核心服务抽象 (`src/services`)

- **`environment.ts`**:

  - **作用**: 区分 `Web` 和 `Tauri` (Native) 运行环境。
  - **逻辑**: 根据环境变量加载 `WebAppService` (浏览器沙盒环境) 或 `NativeAppService` (本地能力环境)。

- **`nativeAppService.ts`** (核心适配层):
  - **文件系统**:
    - **移动端 (iOS/Android)**: 处理沙盒限制。例如 iOS 文件选择器返回的是 Security Scoped Resource，必须先拷贝到临时目录 (`Cache`) 才能读取。
    - **桌面端 (Win/Mac/Linux)**: 直接读写文件系统。支持便携模式 (Portable Mode)，允许自定义数据存储根目录。
  - **功能开关 (`Capabilities`)**:
    - `hasTrafficLight`: 仅 macOS 为 `true`。
    - `isEink`: 通过注入的 `window.__READEST_IS_EINK` 标记检测墨水屏设备。
    - `hasUpdater`: iOS 禁用应用内更新（App Store 政策），桌面端启用。

### 2.2 核心服务适配 (Services)

#### 字体管理 (`FontPanel.tsx`)

- **Native Fonts**: 使用 `plugin:native-bridge|get_sys_fonts_list` 从后端获取系统安装的所有字体列表（仅限 Desktop/Mobile Native 环境）。
- **Web Fallback**: 对于 Web 环境或特定平台默认值，使用 `MACOS_FONTS`, `WINDOWS_FONTS` 等预定义常量。
- **CJK 优化**: 实现了 `genCJKFontsList` 算法，专门过滤和置顶适合中文/日文/韩文阅读的字体。

#### 语音合成 (TTS) (`services/tts`)

采用了 **多态客户端架构**，通过 `TTSController` 统一管理：

- **NativeTTS**: 调用 `plugin:native-tts`，使用 iOS/Android 系统自带的高质量离线语音引擎。
- **EdgeTTS**: 用于 Web 或桌面端的高质量在线语音。实现了 `getFadeCompensation` 以修复 Safari/iOS 上音频淡入淡出的兼容性问题。
- **WebSpeech**: 浏览器原生 `speechSynthesis` 的标准封装，作为兜底方案。

#### 应用更新 (`helpers/updater.ts`)

- **Desktop**: 调用 Tauri 官方 `plugin-updater`，若有更新则弹出一个独立的 `WebviewWindow` (`/updater`) 显示更新日志。
- **Android**: 由于不像桌面端那样有自动替换二进制的能力（且部分为 Sideload 渠道），实现了 **Custom Updater**。手动 Fetch 远程 JSON，使用 `semver` 比较版本，若有更新则在当前窗口内弹出模态提示，引导下载 APK。

#### Deep Link 与文件打开 (`useOpenWithBooks.ts`)

实现了 **统一意图监听器**，汇聚了所有来源的 "打开文件" 请求：

- **Desktop (Win/Lin)**: 监听 `single-instance` 事件（处理 `readest file.epub` 命令行启动）。
- **macOS**: 监听 `open-files` 事件（处理 Dock 图标拖放）。
- **Android**: 监听 `native-bridge|shared-intent`（处理系统分享菜单 "Open with Readest"）。
- **iOS**: 监听 `onOpenUrl`（处理 `readest://` 协议或 AirDrop 文件）。

### 2.3 交互适配深度解析

- **安全区域 (Safe Area)**:
  - **原因**: 移动端刘海屏、灵动岛遮挡内容。
  - **实现**: `injectSafeArea` 动态注入 CSS 变量 (`env(safe-area-inset-top)` 等)，主要在 `nativeAppService.ts` 的初始化脚本中处理。
- **窗口控件**:
  - **macOS**: 隐藏系统默认标题栏，使用自定义 "红绿灯" (`traffic_light`) 样式。
  - **Windows/Linux**: 渲染自定义的最小化/关闭按钮组件 (`WindowButtons`)。
- **墨水屏模式 (E-ink)**:
  - **原因**: 墨水屏刷新率低，需避免高频动画和深色背景。
  - **实现**: 若检测为 E-ink，强制使用白色背景，从 CSS 层面去除过渡动画，启用高对比度 UI。

---

### 2.3 交互适配深度解析

#### 键盘与快捷键

- **Android 返回键**:
  - **问题**: Android 用户的习惯是使用物理/手势返回键退出模态框或返回上一级，Web 应用默认无法响应。
- **多窗口架构 (`src/utils/nav.ts`)**:
  - **Dynamic Creation**: 只有在 Native 平台，点击图书时不是路由跳转，而是调用 `WebviewWindow` 创建一个新的独立窗口 (`reader-${count}`)。
  - **Window Props**:
    - **macOS**: `titleBarStyle: 'overlay'`, `decorations: true`, `transparent: false`.
    - **Linux Window Hack**: 检测到 Linux 平台时，强制开启 `transparent: true`，解决某些发行版下无边框窗口的黑边问题。
- **Android E-Ink 优化 (`src-tauri/src/android/eink.rs`)**:
  - **Hardware Detection**: 通过 `getprop` 读取 `ro.product.model`, `ro.product.brand` 等系统属性，匹配已知 E-Ink厂商列表 (Onyx, Boyue, Hisense A5/A7, Kindle, Kobo 等)。
  - **Injection**: 启动时注入 `window.__READEST_IS_EINK = true`。
  - **Effect**: 强制使用白底黑字高对比度主题，禁用动画，避免电子墨水屏闪烁和残影。

### 2.4 CSS 渲染引擎适配 (`src/App.css`)

- **Duokan Style Hack**: 为了完美模拟“多看阅读”的排版效果，通过 `.x-duokan-` CSS 类注入了大量针对中文排版的特殊样式。
- **Hardware Acceleration**: 强制开启 `transform: translateZ(0)` 以触发 GPU 加速，解决多页渲染时的卡顿问题。

### 2.5 运行时环境抽象 (`src/services/environment.ts`)

- **Isomorphism (同构)**: `AppService` 是整个应用的核心接口。
- **Dynamic Import (动态导入)**:
  - **Native**: 如果检测到 `process.env['NEXT_PUBLIC_APP_PLATFORM'] === 'tauri'`，动态 `import('@/services/nativeAppService')`。
  - **Web**: 否则，动态 `import('@/services/webAppService')`。
  - **Benefit**: 这种 Late Binding 机制确保了 Web 端构建时不会引入任何 `tauri` 相关的原生代码，大大减小了 Bundle 体积，同时避免了运行时崩溃。

### 2.6 移动端交互适配 (`src/hooks`)

- **字体解析引擎 (`src/utils/font.ts`)**:
  - **纯 JS 实现**: 不依赖 Native API，直接在 JS 层二进制解析 TTF/OTF 文件头 (`OS/2`, `name`, `fvar` tables)。
  - **原因**: 浏览器 `queryLocalFonts` API 兼容性差且不仅支持所有格式，Native 端为了统一体验，选择自己在前端解析字体元数据。

### 2.5 移动端交互适配 (`src/hooks`)

- **长按与上下文菜单 (`useLongPress.ts`)**:
  - **统一逻辑**: 区分 `Tap` (点击) 和 `LongPress` (长按)。
  - **移动端**: 在 Touch 设备上模拟右键菜单 (`onContextMenu`)，使得 PC 端的右键交互在手机上也能通过长按触发。
- **下拉刷新物理引擎 (`usePullToRefresh.ts`)**:
  - **定制实现**: 没有使用现成库，而是手写了一个带阻尼效果 (`appr()` 函数) 的下拉刷新。
  - **平台差异**: 仅在移动端 Web/PWA 下生效，Native App 禁用（因为 Native 端有自己的逻辑或不需要刷新）。

### 2.6 文件系统深度适配 (`src/services/nativeAppService.ts` & `webAppService.ts`)

- **Virtual File System (VFS)**:
  - **Interface**: 定义了统一的 `FileSystem` 接口，屏蔽了底层差异。
  - **Web Polyfill (`webAppService.ts`)**: 利用 `IndexedDB` 模拟了一套完整的文件系统。所有 `readFile`/`writeFile` 操作在 Web 端都会被透传到 IDB 的 `files` store 中，实现了浏览器里的“本地文件管理”。
- **IO 性能优化 (`src/utils/file.ts`)**:
  - **Smart Range Request**: `RemoteFile` 类实现了智能的分片读取。读取大文件 (PDF/EPUB) 时，不会一次性下载，而是根据需要的字节范围发送 HTTP Range 请求 (如 `bytes=0-1023`)。
  - **LRU Cache**: 内存中维护了一个 LRU 缓存池 (`MAX_CACHE_ITEMS_SIZE = 128`)，缓存已下载的 Range 分片，避免重复网络请求，极大提升了 Web 端打开大书的速度。
- **Portable Mode (便携模式)**:
  - **检测机制**: 启动时检查可执行文件目录下是否有 `Settings.json`。
  - **路径重定向**: 如果存在，将所有 `AppData`, `Cache`, `Log` 路径动态重定向到可执行文件所在目录，实现"即插即用"。
- **Android Content URI 穿透**:
  - **直接访问**: 对于 `/storage/emulated/0` 等路径，尝试直接 `NativeFile` 读取。
  - **缓存中转**: 对于无法直接读取的 `content://` URI (如 Google Drive)，先复制到 `Cache` 目录再读取。
- **iOS 文件分享**:
  - **Share Sheet**: iOS 无法直接“保存文件到某路径”，而是调用 `shareFile` 唤起系统分享面板，让用户选择“存储到文件”。

### 2.7 键盘快捷键适配 (`src/hooks/use-keyboard.ts`)

### 2.5 移动端交互适配 (`src/hooks`)

- **长按与上下文菜单 (`useLongPress.ts`)**:
  - **统一逻辑**: 区分 `Tap` (点击) 和 `LongPress` (长按)。
  - **移动端**: 在 Touch 设备上模拟右键菜单 (`onContextMenu`)，使得 PC 端的右键交互在手机上也能通过长按触发。
- **下拉刷新物理引擎 (`usePullToRefresh.ts`)**:
  - **定制实现**: 没有使用现成库，而是手写了一个带阻尼效果 (`appr()` 函数) 的下拉刷新。
  - **平台差异**: 仅在移动端 Web/PWA 下生效，Native App 禁用（因为 Native 端有自己的逻辑或不需要刷新）。

### 2.6 文件系统深度适配 (`src/services/nativeAppService.ts`)

- **Portable Mode (便携模式)**:
  - **检测机制**: 启动时检查可执行文件目录下是否有 `Settings.json`。
  - **路径重定向**: 如果存在，将所有 `AppData`, `Cache`, `Log` 路径动态重定向到可执行文件所在目录，实现"即插即用"。
- **Android Content URI 穿透**:
  - **直接访问**: 对于 `/storage/emulated/0` 等路径，尝试直接 `NativeFile` 读取。
  - **缓存中转**: 对于无法直接读取的 `content://` URI (如 Google Drive)，先复制到 `Cache` 目录再读取。
- **iOS 文件分享**:
  - **Share Sheet**: iOS 无法直接“保存文件到某路径”，而是调用 `shareFile` 唤起系统分享面板，让用户选择“存储到文件”。

### 2.5 键盘快捷键适配 (`src/hooks/use-keyboard.ts`)

- **实现**: `src/hooks/useKeyDownActions.ts` 实现了 `native-key-down` 事件监听。在组件挂载时调用 `acquireBackKeyInterception()` 锁定返回键，将其映射为 `onCancel` 回调（等同于 ESC 键），从而实现原生应用般的导航体验。
- **Cmd vs Ctrl (Unified Shortcuts)**:
  - **策略**: 并没有在代码中硬编码 `if (isMac)` 判断，而是采用了 **双重绑定配置**。
  - **实现**: `src/helpers/shortcuts.ts` 定义了如 `['ctrl+f', 'cmd+f']` 的配置数组。`src/hooks/useShortcuts.ts` 中的解析器会自动将 `cmd` 映射为 `metaKey` (Mac)，`ctrl` 映射为 `ctrlKey` (Windows)，从而一套配置同时适配两端。
- **Iframe 事件穿透**:
  - **问题**: 用户阅读时焦点在 eBook 的 `<iframe>` 内部，主窗口无法捕获快捷键。
  - **实现**: `src/app/reader/utils/iframeEventHandlers.ts` 在 iframe 内部监听 `keydown`/`keyup`，通过 `postMessage` 将事件完整（包含 `ctrlKey`/`metaKey` 等修饰符）转发给主窗口，由主窗口的 `useShortcuts` 统一处理。

#### 窗口拖拽与触控

- **标题栏**:
  - **问题**: 自定义标题栏 (`WindowButtons`) 需要支持拖拽移动窗口，但按钮区域不能触发拖拽。
  - **实现**: `src/components/WindowButtons.tsx` 监听 `mousedown`/`pointerdown`。
    - **白名单过滤**: `isExcludedElement` 检查点击目标是否为按钮 (`.btn`, `.window-button`) 或下拉菜单。只有非交互区域才调用 `startDragging()`。
    - **触摸优化**: 实现了自定义的触摸拖拽逻辑 (`handlePointerMove`)，增加阈值防止误触。

#### 主题与显示适配 (`useTheme.ts`)

- **System UI (Mobile)**:
  - **Android Status Bar**: 自动获取原生状态栏高度并同步给 CSS 变量，确保沉浸式布局不遮挡内容。
  - **iOS Landscape**: 在横屏模式下尝试隐藏 System UI (Workaround for iPhone)。
- **E-ink 优化**:
  - **高对比度**: 强制将高亮混合模式从 `difference`/`lighten` 调整为更适合黑白屏的 `normal`。
- **WebView 版本回退**:
  - **OKLCH**: 检测 Android System WebView 版本。如果低于 111 (不支持 OKLCH 颜色空间)，自动降级使用 `tinycolor2` 生成的 RGB 颜色，保证老旧设备上的色彩显示正常。

#### 支付与内购 (`iap.ts`)

- **策略**: 通过 `native-bridge` 插件统一接口。
- **实现**:
  - **iOS**: 走 Apple App Store IAP 流程。
  - **Android**:
    - **Google Play**: 走 Google Billing Client。
    - **国内渠道**: 通过 `alipays://` 协议拦截实现支付宝跳转 (见后端适配章节)。

#### 运行环境识别 (`utils/ua.ts`)

- **User Agent 解析**:
  - 精确区分 `Android WebView` (System vs Chrome), `iOS WebView` (WKWebView), `macOS WebView`, `Edge WebView2` (Windows), `Linux WebView` 等。
  - 此信息用于数据埋点以及处理特定 WebView 的渲染 Bug (如上述的 OKLCH 支持检测)。

#### 2.11 本地高性能并发 (`src-tauri/src/transfer_file.rs`)

- **多线程下载器**: 利用 Rust 的 `tokio` 和 `futures` 实现了并行分块下载。
  - **Range Request**: 自动检测服务器是否支持 `Accept-Ranges`。
  - **并发控制**: 使用 `for_each_concurrent(8)` 同时开启 8 个线程下载文件分片 (`PART_SIZE = 1MB`)。
  - **无锁进度**: 使用 `Arc<Mutex<TransferStats>>` 统计这一毫秒级精度的传输速率和进度，并通过 IPC Channel以高频低延迟推送到前端。这是纯 JS 环境无法实现的性能体验。

#### 2.6 样式渲染引擎的极致兼容 (`utils/style.ts`)

为了适配千奇百怪的电子书 CSS 和不同系统的渲染差异，核心渲染引擎包含了大量 **Hardcoded Hacks**：

- **Duokan 专有属性适配**: 逆向还原了 `duokan-bleed` (出血), `duokan-footnote` (注脚) 等私有属性，将其转换为标准的 CSS 布局。
- **垂直排版 (Vertical Writing)**: 针对 CJK 竖排，自动移除 margin-top/bottom 改为 left/right，并强制处理图像旋转 (`img.pi`)。
- **动态单位转换**: 将绝对单位 (`px`, `pt`) 动态转换为 `rem`，基于设备 DPI 和用户设置的字号进行缩放 (`isMobile ? 1.25 : 1`)。
- **CSS 清洗**: 强制移除 `page-break-after: always` 以适应连续滚动模式，修复 `text-align: center` + `text-indent` 同时存在导致的排版错乱。

#### 2.7 窗口管理 hacks (`utils/window.ts`)

- **Linux 透明度修复**: 在 Linux 上切换全屏/最大化时，窗口透明背景可能会失效。实现了一个 `linuxWindowRestoreTransparentBg` 补丁，通过微调窗口尺寸 (width +/- 1px) 强制触发重绘来修复此问题。
- **macOS Traffic Lights**: 并不依赖 Tauri 默认配置，而是通过 Rust (`traffic_light.rs`) 调用 Objective-C 运行时 (`objc!`, `msg_send!`) 接管了红绿灯按钮的绘制和定位，实现了完美的 Overlay 效果和自定义位置偏移。

#### 2.8 E-ink 硬件级优化 (`src-tauri/src/lib.rs`)

- **闪屏规避**: 在 Android 端检测到 E-ink 设备 (`is_eink_device()`) 时，会将 Webview 初始化背景色强制设为 **纯白 (#FFFFFF)** 而非夜间模式的深灰，防止 Webview 加载时的全屏闪烁 (Ghosting)。
- **安全区域注入**: 动态生成包含 `env(safe-area-inset-*)` 的 CSS 注入到 Webview，确保内容不被异形屏遮挡。

#### 2.4 网络与鉴权适配 (Network & Auth)

- **OAuth 流程 (`app/auth/page.tsx`)**:

  - **Web**: 标准的 OAuth 2.0 回调 (`/auth/callback`)。
  - **Desktop (Dev)**: 启动本地 HTTP Server (`localhost:port`) 接收回调。
  - **Mobile/Production**: 注册自定义 URL Scheme (`readest://auth-callback`)，通过 `plugin-deep-link` 拦截回调并透传给前端。
  - **iOS/MacOS Special**: 强制使用 `ASWebAuthenticationSession` (via `authWithSafari`) 以符合 Apple 安全指引，而不是简单的 `openUrl`。

- **Http 请求 (`utils/fetch.ts`)**:
  - 全局封装 `fetchWithAuth`，自动从 LocalStorage 获取 Bearer Token 注入请求头。
  - **DeepL 逆向**: `utils/deepl.ts` 包含了一套逆向工程的 DeepL JSON-RPC 协议实现（复杂的 `timestamp` 算法和 `method` 字符串替换逻辑），直接在前端发起请求，在 Tauri 环境下可绕过 CORS（利用 Rust HTTP 插件能力），但在纯 Web 环境可能受限于 CORS（需服务端代理）。

#### 2.5 媒体控制适配 (Media & Background)

- **Media Session (`libs/mediaSession.ts`)**:
  - **Web**: 直接使用标准的 `navigator.mediaSession` API。
  - **Android (Tauri)**:
    - 实现了 `TauriMediaSession`作为 Polyfill。
    - 调用自研 `plugin:native-tts` 的能力 (`update_media_session_metadata`, `set_media_session_active`)。
    - **关键适配**: 申请 `postNotification` 权限，以确保前台服务 (Foreground Service) 能在通知栏显示播放控件，这是 Android 系统对长期后台音频播放的强制要求。

#### 文件系统抽象 (`utils/file.ts`)

- **NativeFile**: 对 Tauri `plugin-fs` 的封装，支持大文件切片读取 (`MAX_CACHE_CHUNK_SIZE = 1MB`) 和内存缓存 (`MAX_CACHE_ITEMS_SIZE = 50`)，确保在移动端低内存环境下也能流畅处理大型 EPUB/PDF。
- **RemoteFile**: 针对 Web 环境或远程文件，实现了基于 HTTP Range 请求的按需加载。针对 Android 平台（不支持部分 HTTP HEAD/Range 行为）做了特殊兼容 (`_open_with_range`)。

---

## 3. 后端适配 (`src-tauri`)

Rust 后端通过条件编译 (`#[cfg(target_os = "...")]`) 深度定制系统行为。

### 3.1 权限与能力配置 (`src-tauri/capabilities`)

- **Desktop**: 启用 `updater:default`, `cli:default` (命令行支持)。
- **Mobile**: 启用 `native-bridge` (自定义交互), `native-tts`, `opener:allow-open-url` (允许 `alipays://` 等 Deep Link 跳转)。

### 3.2 插件架构 (`Cargo.toml`)

## 7. 商业化层 (The Commerce Layer)

Readest 实现了一个统一的 IAP (In-App Purchase) 抽象层，屏蔽了底层支付系统的巨大差异。

- **Unified Interface**: `IAPService` (`utils/iap.ts`) 提供标准化的 `fetchProducts`, `purchaseProduct`, `restorePurchases` 方法。
- **Android (`BillingManager.kt`)**: 基于 Google Play Billing Library 6.0+。处理 `SUBS` (订阅) 和 `INAPP` (一次性购买) 类型，支持 `PendingPurchases`。
- **iOS (`StoreKitManager.swift`)**: 基于 StoreKit 1 (而非最新的 StoreKit 2)。使用 `SKProductsRequest` 和 `SKPaymentQueue`。
- **Data Model**: Native 插件负责将不同平台的商品对象（SKProduct/ProductDetails）标准化为统一的 JSON 结构 (`id`, `title`, `price`, `productType`) 返回给前端。

## 8. 硬件接口与 E-ink 适配 (The Hardware Interface)

为了提供极致的阅读体验，Readest 深入到了系统硬件层。

### 8.1 物理按键翻页 (Volume Key Page Turn)

- **Android**: 定义了 `KeyDownInterceptor` 接口，在 `MainActivity` 层面拦截 `KeyEvent`，通过 Native Bridge 转发给 Web。
- **iOS (The Audio Session Hack)**: 由于 iOS 不允许直接拦截音量键，Readest 使用了一个经典的 "黑客" 方案 (`VolumeKeyHandler.swift`)：
  1.  激活 `AVAudioSession` 并设为后台播放模式。
  2.  在屏幕外插入一个隐藏的 `MPVolumeView` 以抑制系统音量 HUD。
  3.  监听 `outputVolume` 变化。当检测到变化时，立即重置音量，并通过 `evaluateJavaScript` 注入 `window.onNativeKeyDown('VolumeUp/Down')` 事件。

### 8.2 E-ink 模式与显示控制

- **E-ink Mode**: `useEinkMode` hook 会向 `<body>` 注入 `no-transitions` 类和 `data-eink` 属性，全局禁用动画并增强对比度，以适应电子墨水屏的刷新特性。
- **System Fonts**: `get_sys_fonts_list` 桥接方法允许 Web 端直接访问并使用 Android/iOS 的系统已安装字体，无需 bundle 所有字体文件。
- **Brightness**: 实现了系统级亮度控制 (`set_screen_brightness`)，覆盖了 Web 无法调节屏幕亮度的限制。

采用了模块化的插件体系来扩展原生能力：

- **核心插件**: `fs`, `http` (unsafe), `shell`, `process`, `dialog`, `os`.
- **平台特性插件**:
  - `tauri-plugin-native-bridge`: 自研插件，封装了系统级### 4.2 Native TTS 架构 (`src-tauri/plugins/tauri-plugin-native-tts`)
    **Android (`NativeTTSPlugin.kt` & `MediaPlaybackService.kt`)**:
- **Silent Audio Loop Hack**: 为了在后台持续朗读且不被系统杀掉，Readest 启动了一个前台服务 (`MediaPlaybackService`) 并循环播放一个无声的音频文件 (`asset:///silence.mp3`)。这是一项非常经典的 Android 保活技术。
- **Media Session Integration**: 完整实现了 `MediaSessionCompat`，支持在锁屏界面显示正在朗读的章节名、作者和封面图 (Base64/HTTP/Assets)，并响应系统的 Play/Pause/Next/Prev 媒体按键。
- **ExoPlayer**: 使用 ExoPlayer 管理这个静音音轨和音频焦点 (`AUDIOFOCUS_GAIN`)，确保朗读时不会被其他音乐 App 打断（反之亦然）。

**iOS**:

- **Web Speech API Strategy**: iOS 端插件实现 (`NativeTTSPlugin.swift`) 目前为空 (Stub)，这意味着 iOS 版本直接回退使用系统浏览器自带的 `window.speechSynthesis` API，因为 Safari 的 TTS 引擎本身就支持较好的后台行为（配合 `AVAudioSession` 配置）。

## 5. 法律与契约层 (Manifests & Capabilities)

### 5.1 Android Manifest (`src-tauri/gen/android/app/src/main/AndroidManifest.xml`)

- **Huge Intent Filters**: 注册了几乎所有电子书格式 (`epub`, `pdf`, `mobi`, `azw3`, `cbz`, `fb2`) 和 MIME 类型，确保 Readest 成为系统默认阅读器。
- **OAuth Callback**: 专门的 `<intent-filter>` 用于捕获 `readest://auth-callback`，用于处理第三方登录跳转。
- **Permissions**: `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (Android 14+ 必须) 用于 TTS 保活。

### 5.2 Tauri Capabilities (`src-tauri/capabilities/default.json`)

- **iOS Filesystem Wildcard**: 这里的配置极其激进，显式允许了 `/private/var/mobile/Containers/Data/Application/**/*` 的读写权限。这是因为 iOS 的沙盒路径在每次 App 更新或重启动后可能会变动，必须使用通配符来确保能访问到 App 自己的 Documents 目录中的所有子文件。
- **Alipay Whitelist**: `opener:allow-open-url` 中单独放行了 `alipays:*`，这是为了支持支付宝支付的 Deep Link 跳转。
- **Native TTS**: Mobile 端使用 `tauri-plugin-native-tts` 调用系统 TTS 引擎 (AVSpeechSynthesizer / TextToSpeech)。
- **Microsoft Edge TTS (`src/libs/edgeTTS.ts`)**:
  - **Hack 原理**: 这是一个非官方的实现。它通过伪造 `Origin: chrome-extension://...` 和 `User-Agent`，伪装成 Edge 浏览器的 Read Aloud 扩展，从而免费调用微软的高质量 Neural TTS API。
  - **Protocol**: 实现了完整的 WebSocket 协议 (`wss://speech.platform.bing.com/...`)，支持 HTTP/WS 双模式。
  - **Token Generation**: 内置了 `Sec-MS-GEC` token 生成算法 (基于 Windows File Time)，确保请求通过校验。
- **Media Session Polyfill (`src/libs/mediaSession.ts`)**:
  - **Problem**: Android Native WebView 往往无法完美对接系统的锁屏媒体控制。
  - **Solution**: 实现了一个 `TauriMediaSession` 能够模拟 W3C `navigator.mediaSession` API，但在底层通过 `plugin:native-tts` 调用 Android 原生代码来响应 Play/Pause/Seek 事件，确保锁屏控制可用。

### 4.3 离线优先策略 (`src/sw.ts` & `src/utils/transfer.ts`)

- **超长缓存**: 字体文件 (`.woff2`, `.ttf`) 和 CDN 资源缓存 **2年**。
- **Native High-Performance I/O (`src/utils/transfer.ts`)**:
  - **Web**: 使用 `fetch` 和 `XMLHttpRequest` (用于上传进度)。
  - **Native**: 桥接到 Rust 层 (`transfer_file.rs`)，利用 `tokio` 实现多线程并发下载和断点续传，绕过 WebView 的单线程网络限制。

UI (状态栏, 导航栏, 亮度) 和文件 Intent。

- `tauri-plugin-native-tts`: 自研插件，桥接 iOS AVSpeechSynthesizer / Android TextToSpeech。
- `tauri-plugin-sharekit`: 系统分享面板调用。
- `tauri-plugin-haptics`: 触感反馈。
- **Conditional Compilation (条件编译)**:
  - `#[cfg(target_os = "macos")]`: 仅在 macOS 引入 `cocoa`, `objc` crate，用于 Traffic Light 控制。
  - `#[cfg(desktop)]`: 仅在桌面端引入 `tauri-plugin-updater` 和 `tauri-plugin-window-state`，移动端禁用自动更新（由 Store 管理）和窗口状态保存（由系统管理）。
- `tauri-plugin-sign-in-with-apple`: iOS 必须的原生登录。
- **桌面专属插件**: `updater` (自动更新), `cli` (命令行), `single-instance` (单例与应用拉起), `window-state` (窗口位置记忆)。

### 3.3 全局构建标记 (`environment.ts`)

客户端通过环境变量和注入对象的组合来感知构建目标：

- `process.env['NEXT_PUBLIC_APP_PLATFORM']`: 区分 `tauri` vs `web`。
- `window.__READEST_CLI_ACCESS`: 标记是否拥有 CLI 访问权限（桌面端特性）。
- `isPWA()`: 通过 `display-mode: standalone` 检测伪原生环境。
  - **移动端特供**:
    - `native-bridge`, `native-tts`: 仅在移动端生效的自定义插件。
    - `opener:allow-open-url`: 显式允许 `alipays:*` 协议，配合 `eink.rs` 中的拦截逻辑支持支付跳转。
- **`desktop.json`**:
  - **桌面端特供**:
    - `updater:default`: 启用自动更新（移动端由应用商店管理）。
    - `cli:default`: 启用命令行参数解析 (如 `readest file.epub`)。

### 3.2 跨平台入口 (`lib.rs`)

- **条件插件加载**:
  - **Mobile**: 加载 `haptics` (触感反馈)。
  - **Desktop**: 加载 `updater` (自动更新), `single_instance` (单例锁), `window_state` (记住所处位置)。
- **Webview 初始化脚本**:
  - **E-ink 检测**: 在窗口创建前运行 JS，检测 Android 系统属性（如厂商 BOOX, Hisense），若是墨水屏则设置全局标记。
  - **CSS 注入**: 自动注入 Edge-to-Edge 适配样式。

### 3.2 Android 平台 (`src-tauri/src/android`)

- **`eink.rs`**:
  - **功能**: **墨水屏设备识别库**。
  - **实现**: 读取 Android 系统属性 (`ro.product.brand`, `ro.product.model`)，匹配已知墨水屏厂商（Onyx BOOX, Hisense, Kindle, Xiaomi 等）。这是 Readest 在安卓墨水屏上体验优异的关键。
  - **URL 处理**: 拦截 `alipays://` 等 Scheme，通过 Native Bridge 调用安卓系统 Intent 跳转支付宝支付。

#### 3.5 Android 原生层 (`MainActivity.kt`)

虽然大部分逻辑在 Rust，但 Android 入口层仍需适配：

- **按键拦截**:
  - 重写 `dispatchKeyEvent` 和 `onKeyDown`，拦截 **音量键** (翻页) 和 **物理返回键**。
  - 通过 `evaluateJavascript` 注入 `window.onNativeKeyDown` 事件，绕过 WebView 默认行为。
- **Raw Touch Injection**:
  - 重写 `dispatchTouchEvent`，将原始触摸数据 (`pressure`, `pointerId`) 通过 `window.onNativeTouch` 注入。这通常是为了解决 WebView 在特定设备上触摸响应延迟或丢失压感信息的 Hack。
- **Intent Filter**:
  - 在 `AndroidManifest.xml` 中注册了对 `content://`, `file://` 以及特定 MIME 类型 (`application/epub+zip`) 的监听，由 `MainActivity` 捕获并传递给 Rust 的 deep-link 插件。
- **系统样式**:

  - 针对 Android 5.0+ 设置 `TaskDescription` 实现多任务视图的标题栏变色。
  - 针对 Android 13+ (Tiramisu) 适配 `OnBackInvokedDispatcher`，以支持预测性返回手势。

- **Native Bridge 深度实现 (`NativeBridgePlugin.kt`)**:
  - **沉浸式 UI**: 手动管理 `WindowInsetsController`，适配刘海屏 (`LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES`) 和手势导航栏隐藏。
  - **屏幕亮度**: 绕过系统自动亮度，直接读写 `WindowManager.LayoutParams.screenBrightness` 实现应用内亮度调节。
  - **文件权限**: 实现了 `Intent.ACTION_OPEN_DOCUMENT_TREE`，并处理了 Content URI 到真实文件路径的解析逻辑 (`extractPathFromUri`)，适配 Android 10+ 的 Scoped Storage。
  - **应用内购 (IAP)**: 完整封装了 Google Play Billing Library，管理商品查询、购买和恢复流程。

#### iOS 实现 (`ios/Sources/NativeBridgePlugin.swift`)

- **WebView 生命周期监控**: `WebViewLifecycleManager` 监控 WebView 进程健康状态。
  - **白屏自动恢复**: 检测 `about:blank` 或 URL 为空的情况，尝试重新加载上次保存的 URL (`tauri_last_valid_url`)。
  - **进程崩溃恢复**: 监听 `webViewWebContentProcessDidTerminate`，自动重载页面。
- **物理按键拦截**: 通过创建一个隐藏的 `MPVolumeView` 窃取系统音量控制权，监听 `outputVolume` 变化，从而拦截物理音量键事件 (`VolumeUp/VolumeDown`) 用于翻页。
- **屏幕旋转锁定**: 封装 `UIDevice` 和 `windowScene.requestGeometryUpdate`，兼容 iOS 16+ 的新 Orientation API。

### 3.3 macOS 平台 (`src-tauri/src/macos`)

- **`traffic_light.rs`**:
  - **功能**: 定制窗口左上角的红绿灯位置和行为，使其与应用内的 Sidebar 融合，提供原生 Mac 应用的视觉体验。
- **`apple_auth.rs` / `safari_auth.rs`**:
  - **功能**: 集成 "Sign in with Apple" 和 Safari 认证流程。这是上架 Mac App Store 的强制要求。
- **Window 属性**: 设置 `TitleBarStyle::Overlay` 实现沉浸式标题栏。

### 3.4 Windows / Linux (`src-tauri/src/windows`等)

- **窗口创建**:
  - **Linux**: 往往需要设置 `transparent(true)` 和背景色以支持圆角窗口。
  - **Windows**: 默认不使用透明背景以保证性能和兼容性。
- **Cli 适配**: Linux AppImage 环境下禁用自动更新器 (`__READEST_UPDATER_DISABLED`)，因为 AppImage 自身通常只读。

---

## 4. 构建与发布适配 (Build & Distribution)

除了代码层面的适配，项目的构建流程也针对不同分发渠道做了深度定制。

### 4.1 Android (Google Play vs Sideload)

- **权限剥离**: `scripts/release-google-play.sh` 脚本在构建 Play Store 版本前，会自动从 `AndroidManifest.xml` 中移除 `REQUEST_INSTALL_PACKAGES` (安装应用) 和 `MANAGE_EXTERNAL_STORAGE` (全文件访问) 权限，以符合 Google Play 的合规要求。
- **配置切换**: 构建时指定 `--config src-tauri/tauri.playstore.conf.json`，使用独立的配置（可能是不同的 Bundle ID 或签名配置）。

### 4.2 macOS (App Store vs DMG)

- **App Store 版本**:
  - 使用 `src-tauri/tauri.appstore.conf.json` 配置。

### 4.2 自动化构建流 (`.github/workflows/release.yml`)

- **Android 双轨制打包**:
  - **Sideload (GitHub Release)**: 保留 `REQUEST_INSTALL_PACKAGES` (安装应用) 和 `MANAGE_EXTERNAL_STORAGE` (所有文件访问) 权限，方便硬核用户。
  - **Play Store (`scripts/release-google-play.sh`)**: 构建前 **动态剔除** 上述敏感权限，以符合 Google Play 审核规范。构建完成后再自动恢复代码，确保开发环境统一。
- **macOS 双轨制打包**:
  - **DMG**: 使用默认签名，分发到 GitHub。
  - **App Store (`scripts/release-mac-appstore.sh`)**: 自动将 `bundleVersion` 修改为当前时间戳 (如 `20240101.120000`) 满足 App Store 递增要求，并调用 `xcrun altool` 上传。
- **资源预处理 (`package.json`)**:
  - `prepare-public-vendor`: 自动从 `foliate-js` 依赖中提取 PDF.js 和 SimpleCC (繁简转换) 的 Wasm 资源到 `public/` 目录。

### 4.3 离线优先策略 (`src/sw.ts`)

- **超长缓存**: 字体文件 (`.woff2`, `.ttf`) 和 CDN 资源被设置为 CacheFirst，过期时间长达 **2年** (`maxAgeSeconds: 365 * 24 * 60 * 60 * 2`)，确保离线阅读体验绝对稳定。
- **智能预加载**: 对 `/library` 和 `/reader` 路由采用 `NetworkFirst` 策略，确保应用骨架屏随时可用，即便断网也能进书架。

### 4.4 Windows 特性构建 (`build.rs` & `extensions/`)

- **Thumbnail Extension (`extensions/windows-thumbnail`)**:
  - **实现原理**: 一个用 Rust 编写的 **COM Server**，实现了 `IThumbnailProvider` 和 `IInitializeWithItem` 接口。
  - **注册表 Hack**: 在 `DllRegisterServer` 中暴力写入注册表 (`HKEY_CLASSES_ROOT\.epub\ShellEx\...`)，强制将 Epub/Cbz/Mobi 等格式的缩略图提供者指向生成的 DLL。
  - **资源绑定**: 通过 `tauri.windows.conf.json` 将编译好的 DLL 自动打包进 MSI 安装包。
  - **效果**: 用户无需打开 App，直接在资源管理器就能看到电子书的封面预览。

### 4.4 生态扩展 (KOReader Plugin)

- **CI 集成**: `release.yml` 包含了一个 `build-koreader-plugin` 任务。
- **功能**: 自动打包 `apps/readest.koplugin` 为 `.zip` 并发布到 GitHub Releases。这是一个 Lua 编写的插件，允许在 KOReader (常用的 E-ink 阅读器系统) 中直接同步阅读进度到 Readest。

### 4.5 朗读服务架构差异 (`plugins/tauri-plugin-native-tts`)

#### Android 实现 (`MediaPlaybackService.kt`)

Android 的后台朗读实现异常复杂，为了防止系统杀后台，Readest 构建了一个 **"假播放器"架构**：

1.  **Foreground Service**: 启动一个前台服务，显示常驻通知栏，提升进程优先级。
2.  **ExoPlayer Silence Trick**: 初始化一个 `ExoPlayer` 循环播放一段 `silence.mp3` (静音文件)。
    - **原因**: Android 系统如果发现 TTS 在发声但没有 `AudioTrack` 活跃，可能会判定为"非媒体应用"并在熄屏后挂起 CPU。通过播放静音文件，欺骗系统认为这是一个正在播放音乐的 App，从而获取 `WakeLock`。
3.  **音频焦点管理**: 实现了 `AudioManager.OnAudioFocusChangeListener`，处理电话打入、其他音乐播放时的暂停/压低音量 (Ducking)。
4.  **Media Session**: 集成 `MediaSessionCompat`，支持蓝牙耳机、车机、智能手表的切歌/暂停控制。

#### iOS 实现 (`NativeTTSPlugin.swift`)

- **现状**: 目前 iOS 端插件实现仅为 **Stub (桩代码)**。
- **原因**: iOS 的 `AVSpeechSynthesizer` 原生支持后台播放 (需开启 Background Modes: Audio)，且不需要像 Android 那样复杂的服务保活机制。iOS 的 Webview 端 `window.speechSynthesis` 在 Safari 中本身表现尚可，但在锁屏控制上仍有欠缺，未来计划补全 Swift 实现。

---

## 5. 平台清单配置深度解析

### 5.1 macOS (`Info.plist`)

- **文件关联**: 声明了极详尽的 `CFBundleDocumentTypes` 和 `UTImportedTypeDeclarations`，包括 fb2, comic book (cbz), mobi, azw3 等非标格式。确保 Readest 能成为这些文件的默认打开方式。
- **UI 优化**: 设置 `<key>UIHomeIndicatorAutoHidden</key><true/>`，在 iPad 上自动隐藏底部 Home 条以提供沉浸阅读体验。

### 5.2 Android (`AndroidManifest.xml`)

- **Service 注册**: 显式注册了 `MediaPlaybackService` (用于后台朗读) 和 `MediaButtonReceiver` (响应耳机线控)。
- **File Provider**: 配置 `androidx.core.content.FileProvider` 以安全地共享文件给其他应用（分享功能）。
- **Intent Filters**: 配置了 `pathPattern=".*\\.epub"` 等正则匹配，确保在文件管理器中点击特定后缀文件能直接唤起 Readest。

---

## 6. 安全与权限策略 (`capabilities/default.json`)

Readest 采用了 Tauri v2 的细粒度权限控制系统，针对多平台制定了严格的安全策略：

- **文件系统 (FileSystem)**:
  - **Scoped Access**: 严格限制文件读写范围。只允许访问 `$APPDATA/Readest` (数据) 和 `$APPCACHE` (缓存)。
  - **Mobile Special**: 针对 iOS 特殊路径 `/private/var/mobile/Containers/Data/Application` 做了显式放行。
  - **Cover Image**: 允许读取任意路径下的 `**/last-book-cover.png` 用于封面生成优化。
- **网络 (Network)**:
  - **白名单机制**: 仅允许访问 `*.readest.com`, `github.com` (更新), `*.deepl.com` (翻译) 等受信任域。
  - **翻译服务放行**: 额外放行了 Microsoft, Google, Toil 等翻译 API 的域名。
  - **协议白名单**: 允许 `alipays:*` 协议跳转，适配国内支付场景。
- **窗口控制 (Window)**:
  - 开放了几乎所有窗口控制权限 (`start-dragging`, `set-always-on-top` 等) 以支持自定义标题栏和沉浸式阅读交互。

---

## 7. 甚至还没完：隐形适配逻辑

### 7.1 无数据库架构 (`src/store`)

- **策略**: Readest 没有使用 `sqlite` 或 `indexedDB`。
- **机制**: 所有状态管理基于 `Zustand`，持久化通过 `appService.saveSettings()` 接口。
- **平台差异**:
  - **Web**: 存入 `localStorage`。
  - **Native**: 存入 JSON 文本文件。
  - **优势**: 这种"Low-Tech"方案使得 **Portable Mode** (便携版) 成为可能——只要拷贝文件夹，所有阅读进度和配置就带走了。

### 7.2 I18N 区域回退 (`src/i18n/i18n.ts`)

- **智能回退**: 定义了特定区域语言的回退链。
  - `kk`, `ky`, `tk`, `uz`, `ug`, `tt` (中亚/俄语区语言) -> 优先回退到 **`ru` (俄语)** 而不是英语。这是基于地缘文化的深度适配细节。

### 7.3 macOS 专属认证 (`src-tauri/src/macos`)

- **Apple Sign In**: `apple_auth.rs` 实现了原生的 "Sign in with Apple" 流程。
- **Safari Auth**: `safari_auth.rs` 封装了 `ASWebAuthenticationSession`。
  - **机制**: 创建一个与 Safari 共享 Cookie 的临时 Session。
  - **流程**: App 唤起 -> Safari 弹窗 -> 用户确认 -> 回调 `callbackURLScheme`。
  - **作用**: 让用户能直接复用 Safari 中已登录的 Readest 官网会话，实现无感登录。

### 7.4 iOS StoreKit 集成 (`plugins/tauri-plugin-native-bridge/ios`)

- **原生菜单构建 (`src-tauri/src/macos/menu.rs`)**:

  - **Cmd+O 集成**: 手动插入 "Open..." 菜单项到 File 菜单，并绑定快捷键 `Cmd+O`。
  - **帮助菜单**: 移除了默认的帮助菜单，替换为 Readest 专属的隐私策略和工单反馈入口。
  - **事件桥接**: 菜单点击事件 (`open_file`) 会触发 `tauri_plugin_dialog` 选文件，选完后通过 `emit("open-files")` 通知前端，复用了 `useOpenWithBooks` 的逻辑。

- **StoreKitManager.swift**: 完整封装了 `StoreKit 2` (iOS 15+) API。
  - **产品查询**: `products(for:)` 获取本地化价格和描述。
  - **交易监听**: `Transaction.updates` 监听 App Store 外部发生的购买（如家庭共享、订阅续费）。
  - **购买验证**: 实现了极其严格的 JWS (JSON Web Signature) 校验，确保凭证未被篡改。

---

## 8. 总结：开发建议

1.  **UI 开发**: 优先使用 `AppService` 提供的状态 (`isMac`, `isMobile`) 来做条件渲染，避免直接写死 UserAgent 判断。
2.  **文件 IO**: **永远** 使用 `fs` 抽象层 (`appService.fs`)，绝对不要假设文件路径是简单的字符串（在移动端可能是 content URI）。
3.  **Rust 扩展**: 如果需要添加新系统能力，请务必使用 `#[cfg]` 宏包裹代码，防止破坏其他平台的构建。
