# 组件分析: Select

## 1. 组件概述

`Select` 是原生 `<select>` 元素的样式化包装器。

## 2. 代码分析

### 逻辑

- **事件阻止**：在按键按下时调用 `e.stopPropagation()`，以防止事件冒泡到通过全局监听器（如翻页快捷键）。

## 3. Svelte 迁移指南

### Svelte 实现

```svelte
<script lang="ts">
  interface Option { value: string; label: string; }
  let { value = $bindable(), options } = $props();
</script>

<select bind:value onkeydown={(e) => e.stopPropagation()} ...>
   {#each options as opt}
      <option value={opt.value}>{opt.label}</option>
   {/each}
</select>
```
