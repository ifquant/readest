# 组件分析: Button

## 1. 组件概述

`Button` 是一个简单的图标按钮包装器。

- **特性**：图标渲染，禁用状态样式，工具提示 (`title`)，aria-label。
- **环境**：针对移动端与桌面端调整悬停样式 (`appService.isMobileApp`)。

## 2. 代码分析

### Props

- `icon`: ReactNode
- `onClick`: 回调函数
- `label`: string (用于 title 和 aria-label)

## 3. Svelte 迁移指南

### Svelte 实现

```svelte
<script lang="ts">
  import { appService } from '$lib/services/app';
  import clsx from 'clsx';

  interface Props {
      icon: any; // Snippet 或 Component
      onclick?: () => void;
      disabled?: boolean;
      label?: string;
      class?: string;
  }
  let { icon: Icon, onclick, disabled, label, class: className } = $props();
</script>

<button
  class={clsx(
    'btn btn-ghost h-8 min-h-8 w-8 p-0',
    appService?.isMobileApp && 'hover:bg-transparent',
    disabled && 'cursor-default !bg-transparent opacity-50',
    className
  )}
  title={label}
  aria-label={label}
  onclick={!disabled ? onclick : undefined}
>
  <Icon />
</button>
```
