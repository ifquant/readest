# 组件分析: TextButton

## 1. 组件概述

`TextButton` 是带文本标签的按钮，具有多种变体。

- **变体**：Primary (蓝), Secondary (灰), Danger (红), Success (绿)。
- **尺寸**：sm, md, lg。

## 2. 代码分析

### 逻辑

- **样式**：使用映射对象 `variantClasses` 和 `sizeClasses` 动态应用 Tailwind 类。

## 3. Svelte 迁移指南

### Svelte 实现

```svelte
<script lang="ts">
  import clsx from 'clsx';

  // Props with defaults
  interface Props {
      children: any;
      onclick?: () => void;
      disabled?: boolean;
      variant?: 'primary' | 'secondary' | 'danger' | 'success';
      size?: 'sm' | 'md' | 'lg';
  }
  let { children, onclick, disabled, variant = 'primary', size = 'sm' } = $props();

  const variantClasses = {
    primary: 'text-blue-500 hover:text-blue-600',
    // ...
  };
</script>

<button
   class={clsx('btn btn-ghost ...', variantClasses[variant], ...)}
   {onclick}
   {disabled}
>
   {@render children()}
</button>
```
