# 组件分析: Quota

## 1. 组件概述

`Quota` 显示使用统计信息（例如存储、限制），并带有可选的进度条。它对使用情况进行颜色编码（绿色 < 50% < 黄色 < 80% < 红色）。

## 2. 代码分析

### Props 接口

```typescript
{
  quotas: {
    name: string;
    tooltip: string;
    used: number;
    total: number;
    unit: string;
  }[];
  className?: string;
  labelClassName?: string;
  showProgress?: boolean;
}
```

### 逻辑

- **计算**：计算每个配额项目的 `usagePercentage`。
- **颜色逻辑**：
  - > 80%: 红色 (`bg-red-500`)
  - 50% - 80%: 黄色 (`bg-yellow-500`)
  - < 50%: 绿色 (`bg-green-500`)
- **渲染**：映射 `quotas` 数组。如果 `showProgress` 为真，则渲染背景进度条（绝对定位）。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

```svelte
<script lang="ts">
  import { clsx } from 'clsx';

  interface QuotaItem {
    name: string;
    tooltip: string;
    used: number;
    total: number;
    unit: string;
  }

  interface Props {
    quotas: QuotaItem[];
    class?: string;
    labelClass?: string;
    showProgress?: boolean;
  }

  let {
    quotas,
    class: className,
    labelClass,
    showProgress
  }: Props = $props();

  function getBgColor(percentage: number) {
    if (percentage > 80) return 'bg-red-500';
    if (percentage > 50) return 'bg-yellow-500';
    return 'bg-green-500';
  }
</script>

<div class={clsx('text-base-content w-full rounded-md text-base sm:text-sm', className)}>
  {#each quotas as quota (quota.name)}
    {@const percentage = (quota.used / quota.total) * 100}
    {@const bgColor = getBgColor(percentage)}

    <div
      class={clsx(
        'relative w-full overflow-hidden rounded-md',
        showProgress && 'bg-base-300'
      )}
    >
      {#if showProgress}
        <div
          class="absolute left-0 top-0 h-full {bgColor}"
          style:width="{percentage}%"
        ></div>
      {/if}

      <div
        class={clsx(
          'relative flex items-center justify-between gap-4 p-2',
          labelClass
        )}
      >
        <span class="truncate" title={quota.tooltip}>
          {quota.name}
        </span>
        <div class="text-right text-sm">
          {quota.used} / {quota.total} {quota.unit}
        </div>
      </div>
    </div>
  {/each}
</div>
```

### 关键变更

- **@const**：在 `{#each}` 循环内使用 `{@const}` 有效地为当前迭代计算派生值，取代了 `map()` 内的逻辑。
