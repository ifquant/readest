# 组件分析: FontDropDown

## 1. 组件概述

`FontDropdown` 是一个高度专门化的字体选择组件。

- **特性**：
  - **预览**：*在字体本身中*渲染每个选项，以便用户看到它的样子。
  - **虚拟化**：使用 `react-window` (FixedSizeList) 高效处理数百种字体。
  - **分类**：拆分标准字体和系统字体（通常是庞大的列表）。

## 2. 代码分析

### 逻辑

- **虚拟列表**：计算高度和项目数量。
- **项目渲染器**：`FontItem` 组件使用内联样式 `fontFamily: ...` 渲染单个行。
- **嵌套下拉菜单**：“系统字体”渲染为子菜单（flyout），它*也*包含一个虚拟化列表。

## 3. Svelte 迁移指南

### Svelte 实现

Svelte 拥有出色的虚拟列表库（例如 `svelte-virtual-list`）。

```svelte
<script lang="ts">
  import VirtualList from 'svelte-virtual-list';

  interface Props {
     options: FontOption[];
     onSelect: (font: string) => void;
  }
  let { options, onSelect } = $props();
</script>

<div class="dropdown ...">
   <button>Selected Font</button>

   <div class="dropdown-content ... h-64 overflow-hidden">
      <VirtualList items={options} let:item>
          <div
             class="item"
             style:font-family={item.family}
             onclick={() => onSelect(item.value)}
          >
             {item.label}
          </div>
      </VirtualList>
   </div>
</div>
```
