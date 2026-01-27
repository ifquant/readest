# 组件分析: FormField

## 1. 组件概述

`FormField` 是专为元数据编辑设计的可复用输入框包装器。

- **特性**：
  - 标签和必填指示器。
  - 输入框 (Input) 或多行文本框 (Textarea) 模式。
  - 字段锁定切换（锁定/解锁图标）。
  - 验证消息显示。
  - 来源指示器（显示哪个自动检索提供商检索了此字段，例如 "Google Books (95%)"）。

## 2. 代码分析

### 逻辑

- **条件样式**：根据 `isLocked`（变灰）或 `error`（红框）改变样式。
- **子组件**：`SourceIndicator` 在输入框下方显示小信息徽章。`LockButton` 定位在输入容器内部。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

```svelte
<script lang="ts">
  import { clsx } from 'clsx';

  interface Props {
    field: string;
    label: string;
    value: string;
    type?: 'input' | 'textarea';
    isLocked?: boolean;
    error?: string;
    source?: string;
    onchange: (val: string) => void;
    onToggleLock: () => void;
    // ...
  }

  let { value, type = 'input', isLocked, error, source, onchange, ... }: Props = $props();
</script>

<div class="flex flex-col gap-1">
  <div class="label ...">
     <span>{label}</span>
     {#if isLocked} <span>Locked</span> {/if}
  </div>

  <div class="relative">
    {#if type === 'input'}
       <input
          {value}
          oninput={(e) => onchange(e.currentTarget.value)}
          disabled={isLocked}
          class={clsx('input ...', error && 'border-red-500')}
       />
    {:else}
       <textarea
          {value}
          oninput={(e) => onchange(e.currentTarget.value)}
          disabled={isLocked}
       ></textarea>
    {/if}

    <button onclick={onToggleLock} class="absolute right-2 ...">
       <!-- 锁定图标 -->
    </button>
  </div>

  {#if error}
     <div class="text-red-500">{error}</div>
  {/if}

  {#if source}
     <SourceIndicator {source} />
  {/if}
</div>
```
