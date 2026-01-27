# 组件分析: Providers

## 1. 组件概述

`Providers` 是注入所有 Context 的根包装器。

- **包括**：`PostHog`, `Auth`, `IconContext`, `SyncContext`。
- **初始化**：还初始化全局主题监听器、设置 `document.lang` 以及处理 RTL 类。

## 2. 代码分析

### 逻辑

- **全局副作用**：`useEffect` 根据加载的设置设置 `document.documentElement.lang` 和 RTL 类。

## 3. Svelte 迁移指南

### Svelte 实现

在 SvelteKit 中（假设 `+layout.svelte`），此逻辑通常位于根布局脚本中。
Stores 直接导入，而不是通过 Context 提供（除非做 SSR 特定的隔离）。

```svelte
<!-- +layout.svelte -->
<script>
   import { onMount } from 'svelte';
   // 初始化逻辑
</script>

<SyncProvider>
   {@render children()}
</SyncProvider>
```

大多数 "Providers" 变为简单的导入或根级逻辑。
