# 组件分析: LayoutPanel

## 1. 组件概述

`LayoutPanel` 控制物理页面结构。

- **边距**：分页和紧凑模式的详细控制（上/下/左/右）。
- **间距**：行高、字间距、字母间距。
- **书写模式**：水平-TB、垂直-RL（用于CJK/蒙古语）、RTL（希伯来语/阿拉伯语）。
- **分栏**：最大列数、间隙百分比。

## 2. 代码分析

### 逻辑

- **复杂依赖**：书写模式更改（水平 -> 垂直）会完全翻转上/下/左/右边距的含义。组件包含自动调整这些值或禁用不兼容选项（如“显示页脚”影响底部边距逻辑）的逻辑。
- **响应式**：立即更新内联 CSS 变量或渲染器属性。

## 3. Svelte 迁移指南

### Svelte 实现

高度响应式的组件。Svelte 的 `$derived` (或响应式声明 `$:` ) 将很好地覆盖依赖逻辑。

```svelte
<script lang="ts">
  // ...
  let writingMode = $state('horizontal-tb');
  let isVertical = $derived(writingMode.includes('vertical'));

  // 根据方向交换边距标签的逻辑
  let topMarginLabel = isVertical ? '右边距' : '上边距';
</script>

<div class="config-item">
   <span>书写模式</span>
   <div class="btn-group">
      <button
         class:active={writingMode === 'vertical-rl'}
         onclick={() => writingMode = 'vertical-rl'}
      >
         <IconVertical />
      </button>
      <!-- ... -->
   </div>
</div>

<NumberInput label={topMarginLabel} bind:value={marginTop} ... />
```
