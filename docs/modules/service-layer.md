# 服务层模块 (Service Layer)

服务层位于 `apps/readest-app/src/services`，为上层 UI 提供底层能力支持，包括文件系统抽象、跨平台适配、后台传输任务管理及 TTS 语音合成。

## 1. 跨平台抽象 (Environment & AppService)

Readest 需要运行在 Web、Desktop (macOS/Windows/Linux) 和 Mobile (iOS/Android) 等多种环境下，因此设计了 `AppService` 抽象层。

### 1.1 架构设计

- **Factory Pattern**: `environment.ts` 中的 `getAppService()` 根据 `process.env[NEXT_PUBLIC_APP_PLATFORM]` 动态返回 `NativeAppService` 或 `WebAppService` 实例。
- **Abstract Base Class**: `AppService` (定义在 `src/types/system.ts`，实现在 `src/services/appService.ts`) 定义了所有必须实现的接口，如 `unzip`, `saveFile`, `readDirectory`。
- **差异化实现**:
  - **Web**: 使用 OPFS (Origin Private File System) 或 IndexedDB 模拟文件系统。
  - **Tauri**: 使用 Rust 后端提供的 `fs` 插件直接操作本地文件系统。

### 1.2 核心职责

- **书籍管理**: `importBook` (解析/去重/存储), `deleteBook`, `exportBook`.
- **设置同步**: `loadSettings` / `saveSettings` (自动处理版本迁移 migrations).
- **封面生成**: `generateCoverImageUrl` (Web 端使用 Blob URL，Native 端使用 `asset://` 协议).

## 2. 后台传输管理 (TransferManager)

`TransferManager` (`src/services/transferManager.ts`) 是一个单例服务，负责管理所有耗时的网络任务（上传、下载、云端删除）。

### 2.1 任务队列

- **持久化**: 队列状态通过 `localStorage` 持久化，防止意外关闭导致任务丢失。
- **优先级**: 支持 `priority` 字段，手动触发的任务 (priority=1) 会优先于自动同步任务 (priority=10) 执行。
- **并发控制**: 支持设置最大并发数 (`maxConcurrent`)，避免网络拥塞。

### 2.2 健壮性设计

- **重试机制**: 指数退避 (Exponential Backoff) 策略，失败后等待 `2^n * 2000ms` 再重试。
- **中断恢复**: 结合 `AbortController` 支持任务取消。

## 3. 语音合成控制器 (TTSController)

`TTSController` (`src/services/tts/TTSController.ts`) 统一了多种语音合成引擎，对外提供一致的播放控制接口。

### 3.1 多引擎支持

- **WebSpeechClient**: 浏览器原生 TTS (`window.speechSynthesis`)。
- **EdgeTTSClient**: 微软 Edge 在线语音服务 (高质量，免费)。
- **NativeTTSClient**: 移动端 (Android/iOS) 系统原生 TTS 引擎，支持后台播放。

### 3.2 播放流程

1.  **SSML 预处理**: `preprocessSSML` 清洗文本，处理标点停顿 (如将 `……` 替换为空格以增加停顿)。
2.  **流式预加载**: `preloadNextSSML` 提前请求下一段音频，实现无缝连播。
3.  **高亮同步**:
    - 监听引擎抛出的 `boundary` 事件。
    - 触发 `tts-highlight-mark` 事件。
    - 调用 `view.renderer.overlayer` 在阅读器上绘制高亮色块。

### 3.3 状态机

内部维护 `TTSState` (stopped, playing, paused, backward-paused 等)，确保在切换章节、更改语速、切换语音时的状态转换逻辑正确。
