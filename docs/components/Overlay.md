# 组件分析: Overlay

## 1. 组件概述

`Overlay` 是模态框、弹出窗口和对话框的背景组件。它覆盖屏幕，处理变暗效果，并提供点击关闭的目标。

## 2. 代码分析

### Props 接口

```typescript
{
  onDismiss: () => void;
  dismissLabel?: string;
  className?: string;
}
```

### 逻辑

- **关闭**：在点击时或聚焦状态下按下特定键（Esc, Enter, Space）时触发 `onDismiss`。
- **无障碍性**：具有 `role='none'` 但处理 keydown 事件。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

```svelte
<script lang="ts">
  import { clsx } from 'clsx';

  interface Props {
    onDismiss: () => void;
    class?: string;
  }

  let { onDismiss, class: className }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (['Escape', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      onDismiss();
    }
  }
</script>

<div
  class={clsx('overlay fixed inset-0 cursor-default', className)}
  role="none"
  tabindex="-1"
  onclick={onDismiss}
  oncontextmenu={onDismiss}
  onkeydown={handleKeydown}
></div>
```
