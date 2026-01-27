# 组件分析: ModalPortal

## 1. 组件概述

`ModalPortal` 是一个实用组件，使用 `ReactDOM.createPortal` 将其子组件渲染到 `document.body` 中。它确保模态框/覆盖层跳出父级 DOM 层级（z-index 上下文），以显示在所有内容的顶部。

## 2. 代码分析

### Props 接口

```typescript
{
  children: ReactNode;
  showOverlay?: boolean;
}
```

### 逻辑

- 将子组件包装在固定定位的 `div.inset-0.z-[100]` 中。
- 将此包装器 teleport 到 `document.body`。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

Svelte 提供了内置的 `<svelte:body>`，但它不支持直接像 portal 一样追加子元素。然而，Svelte 3/4/5 有通用的 portal 实现方法，通常作为 action 或手动移动节点的组件来实现。

实际上，在 Svelte 中，通常只需将 `<Modal>` 组件放置在根 `+layout.svelte` 中，或者如果需要严格的 DOM 隔离，则使用处理 portal 的库。

使用专用 Portal 组件 action 的直接移植：

```svelte
<script lang="ts">
  import { mount, unmount } from 'svelte';
  import { clsx } from 'clsx';

  interface Props {
    children?: import('svelte').Snippet;
    showOverlay?: boolean;
  }
  let { children, showOverlay = true }: Props = $props();

  // 在 Svelte 5 中，如果使用库，portal 通常通过 `teleport` prop 完成，
  // 或者手动移动 DOM 节点。
  // 核心中目前有 <svelte:element> 但还没有原生的 <svelte:portal>。

  // 常见模式：使用 action 'use:portal'

  function portal(node: HTMLElement) {
      document.body.appendChild(node);
      return {
          destroy() {
              if (node.parentNode) {
                  node.parentNode.removeChild(node);
              }
          }
      };
  }
</script>

<div
  use:portal
  class={clsx(
    'fixed inset-0 isolate z-[100] flex items-center justify-center',
    showOverlay && 'bg-black bg-opacity-50'
  )}
  style:transform="translateZ(0)"
>
  {@render children?.()}
</div>
```
