# 组件分析: Dropdown

## 1. 组件概述

`Dropdown` 是一个复杂的菜单组件。它包含一个切换按钮和一个开启/关闭的内容区域。

- **组成**：打开时使用 `Overlay` 作为背景。
- **交互**：处理点击、触摸和键盘导航。
- **Props 注入**：它使用 `React.cloneElement` 将 `setIsDropdownOpen` 注入其子组件（特别是 `MenuItem` 组件），允许它们在被点击时关闭下拉菜单。这是一种非常 React 特有的模式（"Render Hijacking"）。

## 2. 代码分析

### 逻辑 / 复杂性

- **enhanceMenuItems**：递归遍历 `children` 以查找 `MenuItem` 组件并注入 `setIsDropdownOpen` prop。这允许声明式用法 `<Dropdown><MenuItem /><MenuItem /></Dropdown>` 而无需手动连线。
- **焦点管理**：处理 blur 事件以在焦点离开时关闭下拉菜单，并包含针对触摸交互的特定逻辑（防止移动端过早关闭）。
- **Overlay**：打开时渲染透明覆盖层以捕获外部点击。

## 3. Svelte 迁移指南

### 迁移策略 (高复杂度)

Svelte 中不存在 `React.cloneElement` 模式。Svelte 倾向于使用 **Context** 在父级 (`Dropdown`) 和深层子级 (`MenuItem`) 之间进行通信。

### Svelte 实现 (Svelte 5)

#### Dropdown.svelte

```svelte
<script lang="ts">
  import { setContext, onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import Overlay from './Overlay.svelte';

  interface Props {
     label: string;
     toggleButton: import('svelte').Snippet;
     children: import('svelte').Snippet;
     dropdownClass?: string;
     // ...
  }

  let { label, toggleButton, children, ...rest }: Props = $props();

  let isOpen = $state(false);

  // 为子组件创建一个上下文来控制下拉菜单
  setContext('dropdown', {
    close: () => isOpen = false,
    isOpen: () => isOpen
  });

  function toggle() {
      isOpen = !isOpen;
  }
</script>

<div class="dropdown-container flex">
  {#if isOpen}
     <Overlay onDismiss={() => isOpen = false} />
  {/if}

  <div class="dropdown ..." >
     <button aria-expanded={isOpen} onclick={toggle} ...>
        {@render toggleButton()}
     </button>

     <div role="menu" ...>
        {#if isOpen}
           <!-- 在 Svelte 5 中，snippets 很直观 -->
           <!-- 子组件 (菜单项) 将消费 context -->
           {@render children()}
        {/if}
     </div>
  </div>
</div>
```

#### MenuItem.svelte (Context 消费者)

```svelte
<script lang="ts">
  import { getContext } from 'svelte';

  const dropdown = getContext<{ close: () => void }>('dropdown');

  let { transient = false, onclick, ...rest } = $props();

  function handleClick() {
      onclick?.();
      if (transient) {
          dropdown?.close();
      }
  }
</script>

<button onclick={handleClick} ...>
 ...
</button>
```

### 关键变更

- **移除 `React.cloneElement`**：替换为 `setContext` (父级) 和 `getContext` (子级)。这是这种复合组件的“Svelte 方式”。
