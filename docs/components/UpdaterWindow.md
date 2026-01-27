# 组件分析: UpdaterWindow

## 1. 组件概述

`UpdaterWindow` 是用于处理应用程序更新的包含对话框。它支持：

- **原生更新**：通过 Tauri 的更新插件 (macOS/Windows/Linux)。
- **Android 更新**：用于获取 JSON 清单、下载 APK 和触发安装的自定义逻辑。
- **变更日志**：获取并显示变更日志，支持自动翻译。

## 2. 代码分析

### 架构

- **UpdaterWindow**：通过自定义事件 `setDialogVisibility` 处理可见性状态的包装器组件。在 `Dialog` 内部渲染 `UpdaterContent`。
- **UpdaterContent**：核心逻辑。
  - **状态**：跟踪 `downloaded` 字节, `contentLength`, `progress`, `changelogs`。
  - **Effect**：挂载时，根据平台检查更新（Tauri `check()` 或 Android 自定义 fetch）。
  - **下载逻辑**：使用 `tauriDownload`（自定义实用程序）进行带有进度跟踪的 Android APK 下载。
  - **安装**：触发 `installPackage` (Android) 或 `relaunch` (Desktop)。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

这是一个大型有状态组件。它保持为单个组件，但可以利用 Svelte 简化的异步处理。

```svelte
<script lang="ts">
  import Dialog from './Dialog.svelte';
  import { check } from '@tauri-apps/plugin-updater';

  // 状态
  let isOpen = $state(false);
  let progress = $state<number|null>(null);

  // 全局触发器的事件监听器
  // ... 类似于 Toast/AboutWindow ...

  async function checkUpdates() {
     // ... 逻辑 ...
  }
</script>

<Dialog bind:isOpen title="...">
  <div class="flex flex-col ...">
     {#if progress !== null}
        <progress value={progress} max="100"></progress>
     {/if}

     <button onclick={startDownload}>下载</button>

     <!-- 变更日志 -->
     {#await fetchChangelog()}
        <div>加载中...</div>
     {:then logs}
        {#each logs as log}
           ...
        {/each}
     {/await}
  </div>
</Dialog>
```

### 关键变更

- **异步块**：`{#await}` 对于加载变更日志非常强大，无需复杂的 `useEffect` + `useState` 样板代码。
- **事件处理**：类似于 `Toast`，通过自定义事件触发可见性的机制可能应替换为 Svelte Store (`updaterStore`) 以获得更干净的架构。
