# 语音合成与媒体控制 (TTS & Media Session)

本文档深​​入分析 `src/libs/edgeTTS.ts` (Edge 语音合成) 和 `src/libs/mediaSession.ts` (媒体会话控制)。

## 1. Edge TTS 实现 (`edgeTTS.ts`)

这是 Readest 最核心的在线朗读引擎，它**逆向工程**了 Microsoft Edge 浏览器的 "Read Aloud" 功能，提供了高质量、免费的神经网络语音合成。

### A. 协议分析 (WebSocket)

Edge TTS 使用基于文本的 WebSocket 协议，包含特定的握手和数据帧格式。

1.  **握手与认证**:

    - **TrustedClientToken**: 硬编码的令牌 (`6A5AA1D4...`)。
    - **Sec-MS-GEC**: 这是一个动态生成的验证头，为了防止非浏览器客户端滥用。
      - _逻辑_: 获取 Windows Epoch 时间戳 -> 圆整到最近的 5 分钟 -> 拼接 Token -> SHA256 哈希。
      - _代码位置_: `generateSecMsGec` 函数。这是关键的反爬虫绕过逻辑。

2.  **会话建立**:

    - 包括生成唯一的 `ConnectionId` 和 `TraceId`。
    - 发送 `speech.config` 消息，配置输出音频格式（通常为 `audio-24khz-48kbitrate-mono-mp3`）。

3.  **合成请求**:
    - 发送 SSML (Speech Synthesis Markup Language) 字符串。
    - 服务器流式返回音频二进制数据。

### B. 平台适配

- **Web 环境**: 使用标准 `WebSocket` 和 `isomorphic-ws`。
- **Tauri 环境**: 使用 `@tauri-apps/plugin-websocket`。
  - _原因_: 某些网络环境下浏览器 WebSocket 可能受到限制，或为了绕过 CORS/Referer 检查（Edge 服务器会检查 `Origin` 和 `User-Agent`）。Tauri 的 Rust 后端可以直接伪造这些头信息。

### C. 缓存机制

实现了两层缓存以优化流量和响应速度：

- **`audioCache` (LRUCache<Blob>)**: 内存中缓存最近生成的音频 Blob。
- **`audioUrlCache` (LRUCache<string>)**: 缓存 Blob URL，并处理 URL 的生命周期（revokeObjectURL）。

## 2. 媒体会话 (`mediaSession.ts`)

此模块负责将应用的播放状态（播放/暂停、上一曲、下一曲）与操作系统的原生媒体控制中心（通知栏、锁屏界面）同步。

### A. 双重实现

1.  **Web 标准**: 优先使用 `navigator.mediaSession` API。这使得 PWA 在移动端 Chrome/Safari 上能获得基本的控制能力。
2.  **Tauri Native**: 对于 Android/iOS 原生应用，使用自定义插件 `plugin:native-tts`。
    - 此插件通过 Rust/Swift/Kotlin 桥接，直接调用系统的 `MPNowPlayingInfoCenter` (iOS) 或 `MediaSession` (Android)。

### B. 事件与权限

- **权限**: 在 Android 上，显示前台通知（Media Notification）需要 `postNotification` 权限。代码中实现了动态申请逻辑。
- **事件监听**: 通过 `addPluginListener` 监听原生侧的按钮点击（如用户点击耳机上的暂停键），并回调 JS 处理函数。

## 3. Svelte 迁移指南

### Edge TTS 服务化

目前的 `EdgeSpeechTTS` 是一个包含静态属性的类。在 Svelte 中，建议将其转化为一个 **单例服务 (Singleton Service)**。

```typescript
// src/lib/services/tts/edge.ts
// 保持逻辑不变，确保在 SSR 期间不执行 DOM 相关操作 (如 URL.createObjectURL)
```

### 媒体控制与 Store

媒体状态非常适合使用 Svelte Store 管理。

```typescript
// src/lib/stores/media.ts
import { writable } from 'svelte/store';
import { getMediaSession } from '$lib/services/mediaSession';

export const playbackState = writable({ playing: false, title: '' });

// 订阅 store 变化并自动更新系统媒体中心
playbackState.subscribe((state) => {
  const session = getMediaSession();
  if (session) {
    session.playbackState = state.playing ? 'playing' : 'paused';
    // 更新元数据...
  }
});
```

### 环境变量

注意 `src/libs/edgeTTS.ts` 中使用了 `getNodeAPIBaseUrl()`。在 SvelteKit 中，应使用 `$env/static/public` 或 `$app/environment` 获取配置。
