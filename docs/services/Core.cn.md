# 服务层分析 (Service Layer)

## 概述

`src/services` 目录包含了 Readest 的核心业务逻辑和平台抽象层。与 `src/libs`（纯函数库）不同，Service 层是有状态的，负责管理应用程序的生命周期、文件系统访问以及平台特定的功能实现。

## 核心抽象：AppService

Readest 使用 `AppService` 接口来统一不同平台（Web 与 Desktop/Mobile）的行为。

### 1. 架构模式

- **BaseAppService (抽象类)**: 定义了通用的业务逻辑，如导入图书、下载封面、迁移数据。它依赖于抽象的 `FileSystem` 接口。
- **NativeAppService (Tauri)**: 实现了基于 `@tauri-apps/plugin-fs` 的文件系统。使用 Rust 后端提供的能力。
- **WebAppService (Browser)**: 实现了基于 `IndexedDB` 的虚拟文件系统。允许应用在浏览器中离线运行。

### 2. 文件系统抽象 (`FileSystem`)

为了抹平差异，应用定义了一套虚拟路径系统：

- **BaseDir**: 枚举值，如 `'Books'` (图书目录), `'Data'` (应用数据), `'Cache'` (缓存)。
- **ResolvedPath**: 将虚拟路径解析为真实路径（Tauri 下是绝对路径，Web 下是 IndexedDB Key）。

### Svelte 迁移指南

#### 单例模式

在 React 中，Service 通常通过 Context 传递。在 SvelteKit 中，建议创建一个单例并在根布局或 `hooks.client.ts` 中初始化。

```typescript
// src/lib/services/index.ts
import { browser } from '$app/environment';
import { NativeAppService } from './nativeAppService';
import { WebAppService } from './webAppService';

export let appService: AppService;

export async function initAppService() {
  if (appService) return;

  // 简单的平台检测逻辑
  if (window.__TAURI__) {
    appService = new NativeAppService();
  } else {
    appService = new WebAppService();
  }

  await appService.init();
}
```

#### 依赖注入

为了更好的测试性和服务端渲染 (SSR) 兼容性，建议使用 Svelte 的 Context API (`setContext`, `getContext`) 在组件树中共享 Service 实例，或者直接使用上述的全局单例（如果 Service 是纯客户端的）。

## 核心实现细节

### 1. 图书导入 (`importBook`)

这是最复杂的逻辑之一，位于 `BaseAppService`。

- **流程**: 打开文件 -> 检测格式 (DocumentLoader) -> 计算 MD5 -> 生成元数据 -> 复制/写入文件 -> 生成封面 -> 保存配置。
- **Web Worker**: 建议将 MD5 计算和文件解析移至 Web Worker，避免阻塞主线程。

### 2. IndexedDB 文件系统 (`webAppService.ts`)

Web 端实现了一个完整的 KV 文件系统。

- **性能**: 对于大文件（如几百MB的 PDF），`IndexedDB` 读写可能会有性能瓶颈。建议使用 `FileSystem Access API` (OPFS) 作为未来的优化方向。

### 3. 数据迁移 (`runMigrations`)

Readest 包含一个基于版本号的迁移系统。

- **建议**: 在 SvelteKit 中，可以在 `+layout.svelte` 的 `onMount` 中执行迁移检查。

## 目录结构建议

```
src/lib/
  services/
    base/
      appService.ts
      fileSystem.ts
    platforms/
      native.ts
      web.ts
    modules/
      transfer.ts
      tts.ts
```
