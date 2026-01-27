# 组件分析: CachedImage

## 1. 组件概述

`CachedImage` 管理具有内存缓存的异步图片加载。

- **用例**：显示需要异步获取/生成（例如，从 blob 或受保护的端点）并缓存以避免重新获取的图片。
- **缓存**：使用全局 `Map<string, string>` (`imageUrlCache`)。

## 2. 代码分析

### 逻辑

- **全局缓存**：`imageUrlCache` 和 `loadingPromises` 映射存在于组件外部（单例模式）。
- **Effect**：`useEffect` 处理异步获取 (`onGenerateCachedImageUrl`) 和状态更新。处理取消 (`cancelled` 标志)。

## 3. Svelte 迁移指南

### Svelte 实现

该逻辑非常适合 **Svelte Action** 或 **Resource** 模式（Svelte 5 request）。

```svelte
<script lang="ts">
   // 缓存逻辑可以移至单独的 ts 模块
   import { getCachedImage } from '$lib/services/imageCache';

   let { src, alt, ... } = $props();

   // Svelte 5 await 块
</script>

{#await getCachedImage(src)}
   <div class="pulse-loader"></div>
{:then url}
   <img src={url} {alt} ... />
{:catch}
   <FallbackIcon />
{/await}
```
