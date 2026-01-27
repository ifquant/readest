# 库与工具概览 (Libraries & Utilities)

## 简介

`apps/readest-app` 中的 `src/libs` 目录作为 **核心业务逻辑层**。与包含通用助手（字符串操作、数学）的 `src/utils` 不同，`src/libs` 包含驱动应用程序主要功能的特定领域逻辑：阅读、同步和支付。

## 结构

| 模块         | 描述                                                           | 关键程度 |
| :----------- | :------------------------------------------------------------- | :------- |
| **Document** | `document.ts`: 电子书解析器的核心。处理 EPUB/PDF/MOBI 的摄入。 | 🔴 高    |
| **System**   | `storage.ts`, `sync.ts`: 文件系统和云同步的适配器。            | 🔴 高    |
| **Audio**    | `edgeTTS.ts`, `mediaSession.ts`: 这个 TTS 引擎和系统控制。     | 🟡 中    |
| **Payment**  | `payment/`: Stripe (Web) 和 IAP (Mobile) 的抽象接口。          | 🟡 中    |
| **Metadata** | `metadata.ts`: 获取图书封面和信息的 API。                      | 🟢 低    |

## Svelte 迁移策略 (通用)

### 1. "Service" 模式

`src/libs` 中的大多数文件导出独立的函数或类。在 SvelteKit 中，这些应被视为位于 `src/lib/services/` 中的 **Services**。

- **单例**: 有状态的服务（如 `SyncClient`, `EdgeSpeechTTS`）应实例化为单例。
- **纯函数**: 无状态逻辑（如 `DocumentLoader`）可以直接导入。

### 2. 同构考虑 (Isomorphic)

Readest 运行在浏览器和 Tauri（Node.js/Rust 上下文）上。

- **Web APIs**: `document.ts` 严重依赖 `File`, `Blob`, 和 `Web Worker`（通过导入）。这些是浏览器原生的，对于客户端 Svelte 是安全的。
- **Tauri 插件**: `storage.ts` 动态切换实现。确保所有 Tauri 插件导入都由 `isTauriAppPlatform()` 保护，或动态导入以避免破坏 SSR（服务端渲染）。

```typescript
// 示例: 安全的 Tauri 导入
if (browser && window.__TAURI__) {
  const { invoke } = await import('@tauri-apps/api/core');
}
```

### 3. 状态管理

目前，React 组件直接调用这些库并在本地管理结果状态（加载中、错误）。
**建议**:

- 将状态管理 _移入_ Svelte Stores 以共享资源（例如 `storage.ts` 中的 `downloadProgress` store）。
- 将 UI 特定状态（如 "解析中"）保留在组件本地。
