# 组件分析: AboutWindow

## 1. 组件概述

`AboutWindow` 用于显示应用信息（版本、Logo）、法律信息和支持链接。它还提供了一个手动触发“检查更新”的功能。

## 2. 代码分析

### 逻辑

- **可见性**：通过自定义事件 `setDialogVisibility` 控制（类似于 `UpdaterWindow`）。
- **用户代理信息**：显示内部 webview 版本 (`parseWebViewInfo`) 以供调试。
- **检查更新**：可以手动触发更新检查流程。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

类似于 `UpdaterWindow`，使用 store 控制可见性。

```svelte
<script lang="ts">
  import Dialog from './Dialog.svelte';
  import { appStore } from '$lib/stores/app'; // 用于版本/环境的假设 store

  let isOpen = $state(false);
  // ... 事件监听逻辑 ...
</script>

<Dialog bind:isOpen title="关于">
   <div class="about-content ...">
       <img src="/icon.png" alt="Logo" />
       <h2>Readest</h2>
       <p>版本 {appStore.version}</p>

       <button onclick={checkUpdates}>检查更新</button>

       <LegalLinks />
       <SupportLinks />
   </div>
</Dialog>
```
