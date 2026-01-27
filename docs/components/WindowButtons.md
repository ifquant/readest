# 组件分析: WindowButtons

## 1. 组件概述

`WindowButtons` 渲染 OS 级别的窗口控件（最小化、最大化、关闭）。

- **平台**：仅与 Tauri/Desktop 相关。
- **拖拽支持**：因为我们渲染自定义标题栏，所以处理自定义窗口拖动逻辑（拦截指针事件）。

## 2. 代码分析

### 逻辑

- **拖动**：复杂的指针事件处理 (`pointerdown`, `pointermove`) 以区分“点击”（最大化）和“拖动”（移动窗口）。
- **排除**：检查 `isExcludedElement` 以确保单击标题栏内的按钮（如特定控件）不会触发窗口拖动。
- **Tauri API**：调用 `getCurrentWindow().startDragging()`。

## 3. Svelte 迁移指南

### Svelte 实现

将拖动逻辑包装在 Svelte Action 中：`use:windowDrag`。

```svelte
<script lang="ts">
  import { useWindowDrag } from '$lib/actions/window';
  import { windowService } from '$lib/services/window'; // Tauri API 的包装器
</script>

<div class="window-buttons" use:windowDrag>
   <button onclick={windowService.minimize}>-</button>
   <button onclick={windowService.toggleMaximize}>[]</button>
   <button onclick={windowService.close}>X</button>
</div>
```
