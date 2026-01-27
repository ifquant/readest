# 组件分析: BookCover

## 1. 组件概述

`BookCover` 处理书籍封面的显示，并提供健壮的回退机制。

- **模式**：网格（大图） vs 列表（小图/图标）。
- **回退**：如果图片加载失败或缺失，它会渲染一个带有标题和作者的生成 CSS 封面。
- **特性**：“书脊”视觉效果，元数据更新的响应性。

## 2. 代码分析

### 逻辑

- **状态**：`imageLoaded` 和 `imageError` 跟踪加载状态，以便在 `Next/Image` 和回退 Div 之间切换。
- **Memoization**：使用 `memo` 比较函数进行严格保护，以防止在大型图书馆网格中重新渲染。
- **Ref 逻辑**：在 ref 上直接进行 DOM 操作 (`classList.toggle`) 以切换可见性，而不触发 React 渲染（可能是性能优化？）。

## 3. Svelte 迁移指南

### Svelte 实现

Svelte 的 `{#await}` 或简单的状态标志效果很好。直接的 DOM 操作不太必要；标准的响应式足够快。

```svelte
<script lang="ts">
  import { slide } from 'svelte/transition';

  let { book, mode = 'grid' } = $props();
  let imageError = $state(false);
  let imageLoaded = $state(false);

  let coverUrl = $derived(book.metadata?.coverImageUrl || book.coverImageUrl);
</script>

<div class="book-cover ...">
  {#if coverUrl && !imageError}
     <img
        src={coverUrl}
        onload={() => imageLoaded = true}
        onerror={() => imageError = true}
        class:invisible={!imageLoaded}
     />
  {/if}

  {#if !imageLoaded || imageError}
     <div class="fallback-cover ...">
        {book.title}
     </div>
  {/if}
</div>
```
