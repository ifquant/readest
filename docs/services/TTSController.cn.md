# TTS 控制器详解 (TTS Controller)

`src/services/tts/TTSController.ts` 是整个朗读功能的大脑。它管理着播放状态、引擎切换、队列调度以及与系统媒体中心的交互。

## 1. 核心架构

### 状态机 (State Machine)

维护内部状态 `TTSState` (playing, paused, stopped, buffering)。

- 通过 `play()`, `pause()`, `stop()` 方法触发状态流转。
- 向外派发事件 (`tts-state-change`, `tts-progress`) 通知 UI 更新。

### 引擎适配 (Engine Adapter)

`TTSController` 不直接产生声音，而是通过 `TTSClient` 接口操作具体引擎：

- **WebSpeechClient**: 浏览器原生 `window.speechSynthesis`。
- **EdgeTTSClient**: 微软 Edge 在线语音 (WebSocket)。
- **NativeTTSClient**: 移动端原生 TTS (Tauri Plugin)。

### 队列管理

支持连续朗读。

- `playNext()`: 自动获取下一段落。
- 文本预处理: 自动跳过空段落，去除干扰符号。

## 2. 跨平台媒体控制

集成了 `apps/readest-app/src/libs/mediaSession.ts`。

- **Mobile**: 监听耳机线控、锁屏控制（上一曲/下一曲/暂停）。
- **Desktop/Web**: 对接 Chrome Media Session API (`navigator.mediaSession`)。

## 3. Svelte 迁移指南

### 单例服务重构

`TTSController` 本身是一个类。迁移时应确保全局单例。

```typescript
// src/lib/services/tts/index.ts
import { TTSController } from './controller';

export const tts = new TTSController();
```

### 响应式状态绑定

目前的事件派发机制 (`eventDispatcher`) 是自定义的。在 Svelte 中，可以直接让 Controller 作为一个 Store，或者通过 `$state` (Svelte 5) 暴露状态。

```typescript
// Svelte 5 Runes Example
class TTSController {
  state = $state('stopped');
  progress = $state(0);

  // ...
}
```

### Web Worker 音频解码

对于 EdgeTTS 这种返回 MP3流 的引擎，解码和 Buffer 处理建议移至 Web Worker，避免主线程卡顿导致爆音。
