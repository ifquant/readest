# 组件分析: Link

## 1. 组件概述

`Link` 是外部链接的抽象。

- **平台特定**：在 Tauri/Desktop 上，它拦截点击以使用 `openUrl` 在系统默认浏览器中打开 URL。在 Web 上，它像标准的 `<a>` 标签一样行为。

## 2. 代码分析

### 逻辑

- `isTauriAppPlatform()` 检查决定行为。
- `e.preventDefault()` 防止在 WebView 内导航。

## 3. Svelte 迁移指南

### Svelte 实现

```svelte
<script lang="ts">
  import { isTauriAppPlatform } from '$lib/services/environment';
  import { openUrl } from '@tauri-apps/plugin-opener';

  let { href, children, ...rest } = $props();

  async function handleClick(e: MouseEvent) {
     if (isTauriAppPlatform()) {
         e.preventDefault();
         await openUrl(href);
     }
  }
</script>

<a {href} target="_blank" rel="noopener noreferrer" onclick={handleClick} {...rest}>
   {@render children()}
</a>
```
