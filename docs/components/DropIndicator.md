# 组件分析: DropIndicator

## 1. 组件概述

`DropIndicator` 是当用户将文件拖动到应用程序窗口上方时显示的视觉提示。它显示一个全屏覆盖层和一个居中的图标，指示用户释放文件。

## 2. 代码分析

### Props 接口

无 Props。函数式组件。

### 依赖

- `useTranslation`: 用于本地化文本。
- `react-icons/hi2`: 用于箭头图标。

### 逻辑

- **静态渲染**：它本身不处理拖动逻辑；它纯粹是视觉组件。可见性通常由父级 CSS 类切换（例如，`drop-zone.drag-over .drop-indicator { display: block }`）。
- **结构**：
  - `.drag-overlay`: 变暗的背景。
  - `.drop-indicator`: 带有图标和文本的居中框。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { HiArrowDownTray } from 'svelte-icons-pack/hi2'; // 假设的图标库
  import Icon from '$lib/components/Icon.svelte'; // 包装器
</script>

<div class="drag-overlay"></div>
<div class="drop-indicator">
  <div class="flex flex-col items-center justify-center">
    <Icon src={HiArrowDownTray} class="h-12 w-12" />
    <p class="mt-2 font-medium">{$t('Drop to Import Books')}</p>
  </div>
</div>
```

### 关键变更

- **Fragments**：React 使用 `<>` 片段。Svelte 组件本来就可以有多个顶级元素（在 Svelte 5 snippets/render 标签中），但通常我们只需列出它们。
- **依赖**：需要兼容 Svelte 的图标解决方案。
