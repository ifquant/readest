# 组件分析: SupportLinks

## 1. 组件概述

`SupportLinks` 渲染一组社交媒体/社区图标（GitHub, Discord, Reddit），引导用户进入支持渠道。

## 2. 代码分析

### Props 接口

无。

### 依赖

- `react-icons/fa`: FontAwesome 图标。
- `useResponsiveSize`: 基于屏幕宽度/高度动态计算图标大小，虽然初始化为静态 `24`。

### 逻辑

- **响应式大小**：使用 `useResponsiveSize(24)`，这可能会在不同设备上缩放图标。
- **布局**：`flex-col` 容器带有一个标签，后跟一排圆形图标按钮。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import Link from './Link.svelte';
  import { FaGithub, FaDiscord, FaReddit } from 'svelte-icons-pack/fa';
  import Icon from '$lib/components/Icon.svelte';

  // 如果需要，复制 useResponsiveSize 逻辑，或使用 CSS clamp/媒体查询
  let iconSize = 24;
</script>

<div class="my-2 flex flex-col items-center gap-2">
  <p class="text-neutral-content text-sm">{$t('Get Help from the Readest Community')}</p>
  <div class="flex gap-4">
    <Link
      href="https://github.com/readest/readest"
      class="flex items-center gap-2 rounded-full bg-gray-800 p-1.5 text-white transition-colors hover:bg-gray-700"
      title="GitHub"
      aria-label="GitHub"
    >
      <Icon src={FaGithub} size={iconSize} />
    </Link>
    <!-- Discord -->
    <Link
      href="https://discord.gg/gntyVNk3BJ"
      class="flex items-center gap-2 rounded-full bg-indigo-600 p-1.5 text-white transition-colors hover:bg-indigo-500"
      title="Discord"
      aria-label="Discord"
    >
      <Icon src={FaDiscord} size={iconSize} />
    </Link>
    <!-- Reddit -->
    <Link
      href="https://reddit.com/r/readest/"
      class="flex items-center gap-2 rounded-full bg-orange-600 p-1.5 text-white transition-colors hover:bg-orange-500"
      title="Reddit"
      aria-label="Reddit"
    >
      <Icon src={FaReddit} size={iconSize} />
    </Link>
  </div>
</div>
```
