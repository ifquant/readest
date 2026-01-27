# 组件分析: Toast

## 1. 组件概述

`Toast` 是一个全局通知系统组件。

- **事件驱动**：它不依赖于父级的 props。相反，它监听全局 `eventDispatcher` 的 `'toast'` 事件。这允许应用程序的任何部分（甚至是当非 React 服务）触发 toast。
- **类型**：Info, Success, Warning, Error。
- **队列**：目前一次处理一条消息（替换前一条），或处理简单的顺序更新。

## 2. 代码分析

### 逻辑

- **全局监听器**：`useEffect` 在挂载时注册 `toast` 事件监听器。
- **自动关闭**：使用 `setTimeout` 在一段时间后隐藏 toast。Ref (`toastDismissTimeout`) 用于在新 toast 在旧 toast 完成之前到达时清除计时器。
- **样式**：基于 `toastType` 的不同颜色/图标。
- **定位**：右上角（桌面）或顶部/居中（移动/各种配置）。遵循安全区域边距。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

理想情况下，在 Svelte 中，此状态应位于 **Store** 中，组件仅使用该 store。这将逻辑（事件监听）与视图分离。

#### Store (`toastStore.ts`)

```typescript
import { writable } from 'svelte/store';
import { eventDispatcher } from '$lib/utils/event';

export const toastState = writable({ message: '', visible: false, ... });

// 在组件外部设置监听器，或在布局 'setup' action 中设置
eventDispatcher.on('toast', (e) => {
    // 更新 store
});
```

#### Toast.svelte

```svelte
<script lang="ts">
  import { toastState } from './toastStore';
  import { fade, fly } from 'svelte/transition';

  // 从 store 派生值
  let { message, type, visible } = $toastState;
</script>

{#if visible}
  <div
    class="toast ..."
    transition:fly={{ y: -20, duration: 300 }}
  >
    <div class="alert ...{type}">
       {message}
    </div>
  </div>
{/if}
```

### 关键变更

- **关注点分离**：将事件监听器逻辑移至 store 或专用服务模块，使 UI 组件纯粹响应式。
- **动画**：使用 Svelte transitions (`transition:fly`) 进行进入/离开动画。
