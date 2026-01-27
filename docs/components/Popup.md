# 组件分析: Popup

## 1. 组件概述

`Popup` 是一个具有定位意识的容器，渲染一个带有方向箭头的“气泡”风格框。它大量用于文本选择菜单、上下文菜单和工具提示。

## 2. 代码分析

### Props 接口

- `position`: 目标 `{x, y}` 坐标。
- `trianglePosition`: 箭头的坐标和方向 (`up`, `down`, `left`, `right`)。
- `width`, `height`: 尺寸限制。

### 逻辑

- **三角形渲染**：使用 `getTriangleStyles` 辅助函数动态生成 CSS 边框，形成指向正确方向的三角形。
- **内容调整大小**：使用 `ResizeObserver` 跟踪内容高度变化并根据需要调整定位（例如，如果弹出窗口向上增长）。
- **智能定位**：根据提供的锚点和三角形方向调整 `top`/`left`，以确弹出窗口相对于选定文本/元素的逻辑位置正确。
- **电子墨水优化**：为电子墨水设备添加边框，因为这些设备上阴影不可见。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    isOpen?: boolean;
    width: number;
    // ...
  }

  let { isOpen = true, width, height, position, trianglePosition, ... }: Props = $props();

  let containerRef: HTMLDivElement;
  let childrenHeight = $state(0);

  // Resize Observer Action
  function resizeObserver(node: HTMLElement) {
      const ro = new ResizeObserver((entries) => {
          for (const entry of entries) {
              childrenHeight = entry.contentRect.height;
          }
      });
      ro.observe(node);
      return { destroy: () => ro.disconnect() };
  }

  // 派生样式逻辑
  let outerTriangleStyle = $derived(getTriangleStyles(trianglePosition, 7, 0));
  // ...
</script>

<div>
  <!-- 外部三角形 -->
  <div class="..." style={outerTriangleStyle}></div>

  <!-- 容器 -->
  <div
     use:resizeObserver
     class="..."
     style:width="{width}px"
     ...
  >
     {@render children?.()}
  </div>
</div>
```
