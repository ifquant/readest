# 组件分析: SettingsDialog

## 1. 组件概述

`SettingsDialog` 是阅读器的主要配置中心。

- **结构**：它渲染一个包含选项卡导航栏和内容区域的 `Dialog`。
- **选项卡**：字体、布局、颜色、行为 (Control)、语言、自定义 (Misc)。
- **状态**：跟踪活动选项卡并将其持久化到 `localStorage`。
- **响应式**：在选项卡容器上使用 `ResizeObserver`，如果水平空间紧缺（移动/窄屏），则自动隐藏文本标签并仅显示图标。
- **重置功能**：允许每个活动面板注册一个“重置”功能，该功能通过 `DialogMenu`（三个点）触发。

## 2. 代码分析

### 架构

- **容器模式**：它主要编排子面板：`FontPanel`, `LayoutPanel` 等。
- **重置注册表**：它将 `onRegisterReset` prop 传递给子级。子级调用此 effect 来注册其特定的重置逻辑。这允许父级 `SettingsDialog` 触发存在于子组件内部的重置操作。
- **样式**：模态框类逻辑（`bgClassName` 等）取决于它是全局访问还是为特定书籍访问。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

```svelte
<script lang="ts">
  import Dialog from '../Dialog.svelte';
  import { useSettingsStore } from '$lib/stores/settings';
  // 导入面板...

  interface Props {
     bookKey?: string;
  }
  let { bookKey } = $props();

  let activePanel = $state('Font');
  let resetTrigger = $state(() => {}); // 回调持有者

  // 选项卡定义
  const tabs = [
     { id: 'Font', label: '字体', icon: IconFont },
     // ...
  ];

  function onRegisterReset(fn: () => void) {
      resetTrigger = fn;
  }
</script>

<Dialog isOpen={true} ...>
  <div slot="header">
      <!-- 选项卡布局 -->
      <div class="tabs ...">
          {#each tabs as tab}
             <button
                class:active={activePanel === tab.id}
                onclick={() => activePanel = tab.id}
             >
                <tab.icon />
                <span class="hidden sm:inline">{tab.label}</span>
             </button>
          {/each}

          <!-- 菜单 (重置) -->
          <DialogMenu onReset={resetTrigger} />
      </div>
  </div>

  <!-- 内容 -->
  {#if activePanel === 'Font'}
     <FontPanel {bookKey} {onRegisterReset} />
  {:else if activePanel === 'Layout'}
     <LayoutPanel {bookKey} {onRegisterReset} />
  <!-- ... -->
  {/if}
</Dialog>
```

### 关键变更

- **重置逻辑**：在 Svelte 中，绑定到组件实例 (`bind:this={componentRef}`) 允许调用子组件上的导出函数。
  - _替代方案_：Svelte 5 snippets 或简单的 Context 也可以比 React 回调更清晰地处理这种“动作注册表”模式。
