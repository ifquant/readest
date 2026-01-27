# 组件分析: MenuItem

## 1. 组件概述

`MenuItem` 是一个多功能组件，代表菜单中的单个操作或链接。

- **视觉**：支持标签、图标、描述、快捷键徽章和切换状态（对勾）。
- **行为**：可以是按钮或嵌套的子菜单（`<details><summary>...`）。
- **交互**：处理点击，如果 `transient` prop 为真，它会通知父级下拉菜单关闭（通常通过由 `Dropdown` 注入的 `setIsDropdownOpen` prop）。

## 2. 代码分析

### Props 接口

包含广泛的 props，包括 `label`, `toggled`, `description`, `shortcut`, `disabled`, `transient`, `children` (用于子菜单), 和 `setIsDropdownOpen` (注入)。

### 逻辑

- **图标处理**：使用提供的 `Icon` prop，或者如果设置了 `toggled`，默认使用 `MdCheck`（对勾）。
- **布局**：`flex` 行布局，左侧图标，中间标签，右侧快捷键。下方显示描述。
- **子菜单**：如果存在 `children`，在 `<ul>` 内渲染 `<details>` 元素（原生 HTML 手风琴）。这创建了一个嵌套菜单 UI。
- **瞬态模式**：如果 `transient={true}`，点击会调用 `setIsDropdownOpen(false)`。

## 3. Svelte 迁移指南

### Svelte 实现

如 `Dropdown` 分析中所述，与父级的通信应通过 **Context** 进行。

```svelte
<script lang="ts">
  import { getContext } from 'svelte';
  import { clsx } from 'clsx';
  // 导入图标...

  // 来自父级 Dropdown 的 Context
  const dropdown = getContext<{ close: () => void } | undefined>('dropdown');

  interface Props {
    label: string;
    description?: string;
    toggled?: boolean;
    transient?: boolean;
    disabled?: boolean;
    children?: import('svelte').Snippet; // 用于子菜单
    // ...
  }

  let { label, toggled, transient, disabled, children, onclick, ...rest }: Props = $props();

  function handleClick() {
     if (disabled) return;
     onclick?.();
     if (transient) dropdown?.close();
  }
</script>

{#if children}
  <ul class="menu ..." role="menuitem">
    <li>
      <details>
        <summary class="...">
           <!-- 内容 -->
           {label}
        </summary>
        {@render children()}
      </details>
    </li>
  </ul>
{:else}
  <div class="flex">
    <button
       role={disabled ? 'none' : 'menuitem'}
       onclick={handleClick}
       class="..."
       {disabled}
    >
       <!-- 内容 (相同的布局逻辑) -->
    </button>
  </div>
{/if}
```
