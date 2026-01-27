# 组件分析: Slider

## 1. 组件概述

`Slider` 是自定义实现的范围滑块。

- **特性**：自定义拇指气泡，RTL 支持，最大/最小图标，填充进度条。
- **交互**：包装原生 `<input type="range">` 但使用单独的 `div` 层进行轨道和填充的样式设置。

## 2. 代码分析

### 逻辑

- **RTL 检测**：DOM 遍历以检查 `dir="rtl"`。
- **映射**：支持自定义 `valueToPosition` / `positionToValue` 函数（非线性缩放）。

## 3. Svelte 迁移指南

### Svelte 实现

```svelte
<script lang="ts">
  let { value = $bindable(50), min = 0, max = 100, ... } = $props();

  let visualPercentage = $derived(((value - min) / (max - min)) * 95);
</script>

<div class="relative ...">
  <!-- 轨道 -->
  <div class="bg..."></div>
  <!-- 填充 -->
  <div style:width="{visualPercentage}%"></div>

  <!-- 原生输入框 (透明度 0) -->
  <input type="range" bind:value {min} {max} ... />
</div>
```
