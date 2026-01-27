# 组件分析: Menu

## 1. 组件概述

`Menu` 是菜单项的容器，通常在弹出窗口或复杂的下拉菜单中使用。它管理焦点（挂载时自动聚焦选择）和键盘导航（Esc 取消）。

## 2. 代码分析

### 依赖

- `useKeyDownActions`: 用于处理 'Escape' 键的自定义 Hook。

### 逻辑

- **自动聚焦**：使用 `useEffect` 和 `setTimeout` 查找第一个具有 `role="menuitem"` 的元素并聚焦它。这确保了菜单打开时的键盘可访问性。
- **样式**：限制高度 (`max-h-[calc(100vh-96px)]`) 并启用滚动。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { clsx } from 'clsx';

  interface Props {
    children?: import('svelte').Snippet;
    class?: string;
    style?: string; // Svelte 中可是字符串或对象
    onCancel?: () => void;
  }
  let { children, class: className, style, onCancel }: Props = $props();

  let menuRef: HTMLDivElement;

  function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel?.();
  }

  onMount(() => {
    // Svelte 的 `tick` 可能比 setTimeout 更好，或者直接使用 requestAnimationFrame
    setTimeout(() => {
        if (menuRef) {
            const firstItem = menuRef.querySelector('[role="menuitem"]') as HTMLElement;
            firstItem?.focus();
        }
    }, 200);
  });
</script>

<div
  bind:this={menuRef}
  role="none"
  class={clsx('menu-container ...', className)}
  {style}
  onkeydown={handleKeydown}
>
  {@render children?.()}
</div>
```
