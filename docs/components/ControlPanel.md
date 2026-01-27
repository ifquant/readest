# 组件分析: ControlPanel

## 1. 组件概述

`ControlPanel` 管理行为设置（交互逻辑）：

- **滚动与分页**：在流动模式之间切换。
- **点击区域**：点击翻页、交换侧边、全屏点击。
- **硬件按键**：音量键翻页（Android）。
- **电子墨水模式**：高对比度优化。
- **安全**：JS 启用。

## 2. 代码分析

### 架构

- **Hooks**：大量与 `useReaderStore` (Foliate viewer 实例) 和 `useDeviceControlStore` (Android bridge) 交互。
- **同步**：
  - `useState` 用于本地 UI 状态。
  - `useEffect` 用于保存更改到持久层 (`saveViewSettings`) 并立即应用到实时渲染器 (`view.renderer.setAttribute(...)`)。
  - 某些设置（如 `allowScript`）需要完全重新创建 viewer (`recreateViewer`) 才能生效。

## 3. Svelte 迁移指南

### Svelte 实现

状态理想情况下应直接从 store 响应，但由于我们需要在写入时保存，因此“拆分 Store”或“表单 Store”方法很好。

```svelte
<script lang="ts">
  import { viewSettings } from '$lib/stores/viewSettings';
  import { reader } from '$lib/stores/reader';

  // 从 store 初始化的本地状态
  let scrolled = $state($viewSettings.scrolled);

  // 响应性
  $effect(() => {
     // 应用到渲染器
     if ($reader) {
         $reader.renderer.setAttribute('flow', scrolled ? 'scrolled' : 'paginated');
     }
     // 持久化
     viewSettings.update(s => ({ ...s, scrolled }));
  });
</script>

<div class="space-y-6">
  <div class="config-item">
     <span>滚动模式</span>
     <input type="checkbox" class="toggle" bind:checked={scrolled} />
  </div>
  <!-- ... -->
</div>
```
