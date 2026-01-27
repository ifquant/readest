# 组件分析: UserAvatar

## 1. 组件概述

`UserAvatar` 显示用户的个人资料图片。

- **缓存**：将图像数据（base64）缓存在 `localStorage` 中，以允许离线显示或更快的立即加载。

## 2. 代码分析

### 逻辑

- **存储键**：哈希 URL 以创建密钥。
- **获取**：手动将图像作为 Blob 获取 -> FileReader -> Base64 字符串。

## 3. Svelte 迁移指南

### Svelte 实现

类似于 CachedImage，但专门用于 `localStorage`。

```svelte
<script lang="ts">
   // ...
   let { url } = $props();
   let cachedSrc = $state(localStorage.getItem(getKey(url)));

   $effect(() => {
       if (url && !cachedSrc) {
           fetchAndCache(url).then(data => cachedSrc = data);
       }
   });
</script>

<img src={cachedSrc || url} ... />
```
