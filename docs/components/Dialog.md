# 组件分析: Dialog

## 1. 组件概述

`Dialog` 是一个关键的 UI 组件，用作响应式模态对话框。

- **桌面端**：渲染为标准的居中模态对话框。
- **移动端**：渲染为可通过下拉手势关闭的底部弹窗（Bottom Sheet）。
- **特性**：
  - 背景模糊和变暗。
  - 硬件返回键拦截（Android）。
  - 键盘支持（Esc 关闭）。
  - 可拖拽关闭手势（移动端）。
  - 吸附点（移动端）。
  - 安全区域边距管理。

## 2. 代码分析

### Props 接口

```typescript
interface DialogProps {
  id?: string;
  isOpen: boolean;
  children: ReactNode;
  snapHeight?: number; // 用于底部弹窗吸附点 (0-1)
  header?: ReactNode; // 自定义头部内容
  title?: string;
  className?: string; // 对话框包装类
  bgClassName?: string; // 覆盖层类
  boxClassName?: string; // 内容框类
  contentClassName?: string; // 可滚动内容区域类
  onClose: () => void;
}
```

### 依赖

- `useDrag`: 用于手势处理的自定义 Hook。
- `useDeviceControlStore`: 用于 Android 返回键拦截。
- `useThemeStore`: 用于基于安全区域的样式调整。
- `Overlay`: 背景遮罩子组件。

### 逻辑

- **生命周期**：
  - 打开时：聚焦对话框，捕获焦点（部分），获取返回键权限（Android）。
  - 关闭时：将焦点恢复到之前的元素，释放返回键权限。
- **移动端手势**：
  - 计算拖拽距离和速度。
  - 为了拖拽时的性能，直接更新 DOM 节点的 `transform: translateY(...)`。
  - 根据阈值/速度决定是回弹、展开至全屏还是关闭。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { clsx } from 'clsx';
  import Overlay from './Overlay.svelte';
  import { slide, fade } from 'svelte/transition'; // 或者自定义拖拽动画
  import { useDrag } from '$lib/actions/drag'; // 作为 action 重新实现 useDrag？

  // Stores
  import { themeStore } from '$lib/stores/theme';
  import { deviceControlStore } from '$lib/stores/device';
  import { t } from '$lib/i18n';

  interface Props {
    id?: string;
    isOpen: boolean;
    children?: import('svelte').Snippet;
    header?: import('svelte').Snippet;
    title?: string;
    snapHeight?: number;
    class?: string;
    bgClass?: string;
    boxClass?: string;
    contentClass?: string;
    onClose: () => void;
  }

  let {
    id = 'dialog',
    isOpen,
    children,
    header,
    title,
    snapHeight,
    class: className,
    bgClass,
    boxClass,
    contentClass,
    onClose
  }: Props = $props();

  let dialogElement: HTMLDialogElement;
  let isMobile = $state(false); // 通过媒体查询检测
  let isFullHeightInMobile = $state(!snapHeight);

  // 高效地复制 useDrag 逻辑是关键。
  // 在 Svelte 中，actions (use:drag) 非常适合做这个。

  function handleBackKey(e: CustomEvent) {
    if (e.detail.keyName === 'Back') onClose();
  }

  $effect(() => {
    if (isOpen) {
      if ($deviceControlStore.isAndroid) {
        deviceControlStore.acquireBackKey();
        window.addEventListener('native-key-down', handleBackKey as EventListener);
      }
    } else {
       if ($deviceControlStore.isAndroid) {
        deviceControlStore.releaseBackKey();
        window.removeEventListener('native-key-down', handleBackKey as EventListener);
      }
    }
  });

</script>

<!-- 拖拽逻辑可能会移至 Svelte Action 或保持使用类似 hook 的结构 -->

{#if isOpen}
  <dialog
    bind:this={dialogElement}
    {id}
    open
    class={clsx(
        'modal sm:min-w-90 z-50 h-full w-full !items-start !bg-transparent sm:w-full sm:!items-center',
        className
    )}
    onclose={onClose}
  >
    <Overlay
      class={clsx('dialog-overlay z-10 bg-black/50 sm:bg-black/50', bgClass)}
      onDismiss={onClose}
    />

    <div
      class={clsx(
        'modal-box settings-content absolute z-20 flex flex-col',
        'h-full max-h-full w-full max-w-full',
        /* ... 响应式类名 ... */
        boxClass
      )}
      style:padding-top="{/* 安全区域逻辑 */ 0}px"
    >
      <!-- 拖拽句柄 (移动端) -->
      <div class="drag-handle ... sm:hidden" use:dragAction>...</div>

      <!-- 头部 -->
      <div class="dialog-header ...">
        {#if header}
           {@render header()}
        {:else}
           <!-- 默认头部 -->
           <span class="font-bold">{title ?? ''}</span>
           <button onclick={onClose}>Close</button>
        {/if}
      </div>

      <!-- 内容 -->
      <div class={clsx('overflow-y-auto ...', contentClass)}>
        {@render children?.()}
      </div>
    </div>
  </dialog>
{/if}
```

### 关键变更

- **Actions**：`useDrag` hook 将事件监听器附加到元素上，这正是 Svelte Action (`use:drag`) 的教科书式定义。
- **可见性**：Svelte 的 `{#if isOpen} ... {/if}` 块结合 `transition:fade` 或 `transition:fly` 提供了更清晰的声明式动画 API，取代了 React 中经常使用的 `opacity-0` / `pointer-events-none` 技巧。
