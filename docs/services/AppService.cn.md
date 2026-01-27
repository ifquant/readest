# AppService 架构详解 (Platform Abstraction Layer)

`AppService` 是 Readest 处理 Web (Next.js) 与 Native (Tauri) 平台差异的核心抽象层。它确保业务逻辑只需调用统一接口，而无需关心底层运行环境。

## 1. 核心设计

采用 **策略模式 (Strategy Pattern)**，定义统一的抽象基类，并针对不同平台提供具体实现。

- **Base Class**: `BaseAppService` (在 `appService.ts` 中定义)
  - 定义了所有平台必须实现的接口：文件操作、窗口控制、系统交互等。
- **Web Implementation**: `WebAppService` (`webAppService.ts`)
  - 使用 Browser API (IndexedDB, File API, window.open) 模拟原生行为。
- **Native Implementation**: `NativeAppService` (`nativeAppService.ts`)
  - 使用 Tauri Rust Plugins (fs, dialog, shell, os) 调用系统原生能力。

## 2. 关键功能对比

| 功能         | Native (Tauri)                                   | Web (Browser)                     |
| :----------- | :----------------------------------------------- | :-------------------------------- |
| **文件系统** | 直接读写 OS 文件系统 (`@tauri-apps/plugin-fs`)   | 使用 IndexedDB 模拟文件存储       |
| **文件选择** | Native File Dialog (`@tauri-apps/plugin-dialog`) | HTML `<input type="file">`        |
| **外部链接** | 系统默认浏览器打开 (`plugin-shell`)              | `window.open`                     |
| **窗口控制** | `WebviewWindow` API (最大化/最小化/关闭/拖拽)    | 不支持 (只有简单的 Titlebar 模拟) |
| **PWA 支持** | N/A                                              | 检测 `beforeinstallprompt` 事件   |

## 3. 初始化流程

在 `src/services/environment.ts` 中通过工厂模式延迟加载：

```typescript
// 按需动态导入，避免并在 Web 端加载 Tauri 依赖导致报错
if (isTauriAppPlatform()) {
  const { NativeAppService } = await import('@/services/nativeAppService');
  return new NativeAppService();
} else {
  const { WebAppService } = await import('@/services/webAppService');
  return new WebAppService();
}
```

## 4. Svelte 迁移指南

### 单例模式重构

不再通过 `environment.ts` 导出复杂的 Promise 或对象，而是建立一个明确的全局单例服务。

```typescript
// src/lib/services/app/index.ts
import { browser } from '$app/environment';
import type { IAppService } from './types';

let appService: IAppService;

export async function getAppService(): Promise<IAppService> {
  if (appService) return appService;

  if (window.__TAURI__) {
    const { NativeAppService } = await import('./native');
    appService = new NativeAppService();
  } else {
    const { WebAppService } = await import('./web');
    appService = new WebAppService();
  }

  await appService.init();
  return appService;
}
```

### 上下文注入

在 SvelteKit 的根布局 `src/routes/+layout.svelte` 或 `+layout.ts` 中初始化 AppService，并通过 Context API 传递给子组件（或者直接使用上述单例导出）。推荐使用单例导出，因为 AppService 是全局唯一的。
