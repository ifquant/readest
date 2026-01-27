# 组件分析: Spinner

## 1. 组件概述

`Spinner` 是一个加载指示器。

- **定位**：相对于顶部的绝对定位，考虑了 `safeAreaInsets`。
- **风格**：针对电子墨水屏（简单的 spinner）与标准屏幕（加载点）的自适应样式。

## 2. 代码分析

### 依赖

- `useThemeStore` 用于 `safeAreaInsets`。

## 3. Svelte 迁移指南

### Svelte 实现

```svelte
<script lang="ts">
  import { themeStore } from '$lib/stores/theme';

  let { loading, class: className } = $props();

  if (!loading) return; // Svelte 5 snippet 可以直接条件渲染或使用逻辑块
</script>

{#if loading}
  <div
     class="absolute ..."
     style:padding-top="{($themeStore.safeAreaInsets?.top || 0) + 64}px"
  >
     <span class={clsx('loading ...', className)}></span>
  </div>
{/if}
```
