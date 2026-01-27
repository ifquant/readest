# 组件分析: DialogMenu

## 1. 组件概述

`DialogMenu` 是 `SettingsDialog` 内部的上下文菜单（三点菜单）。

- **特性**：
  - 切换“全局设置”模式（应用更改到所有书籍 vs 当前书籍）。
  - 触发当前面板的“恢复默认设置”。
  - 链接到特定子面板（例如，如果处于字体选项卡，则链接到“管理自定义字体”）。

## 2. 代码分析

### Props

- `activePanel`: 决定显示哪些上下文操作。
- `onReset`: 触发重置的回调函数。

## 3. Svelte 迁移指南

### Svelte 实现

```svelte
<script lang="ts">
  import MenuItem from '../MenuItem.svelte';

  interface Props {
     activePanel: string;
     onReset: () => void;
  }
  let { activePanel, onReset } = $props();
</script>

<div class="menu ...">
   <MenuItem label="恢复默认设置" onclick={onReset} />
   {#if activePanel === 'Font'}
      <MenuItem label="管理字体" ... />
   {/if}
</div>
```
