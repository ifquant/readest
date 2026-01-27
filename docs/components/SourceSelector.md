# 组件分析: SourceSelector

## 1. 组件概述

`SourceSelector` 是在“自动检索”期间使用的模态对话框。当找到多个元数据结果时（例如，来自不同的提供商，如 Google Books, OpenLibrary），此组件允许用户选择应用哪一个。

## 2. 代码分析

### Props 接口

- `sources`: `MetadataSource` 对象列表（包含元数据 + 置信度分数）。
- `onSelect`: 用户选择来源时的处理程序。

### 逻辑

- **渲染**：渲染卡片列表，每个卡片显示书籍封面、标题、作者和置信度徽章（绿/黄/红）。
- **交互**：选择来源会调用 `onSelect` 并关闭模态框。
- **回退**：“保留手动输入”选项允许取消选择而不应用更改。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

模态覆盖层内的标准列表渲染。

```svelte
<script lang="ts">
  import BookCover from '../BookCover.svelte';

  interface Source {
     confidence: number;
     data: BookMetadata;
     // ...
  }

  interface Props {
     sources: Source[];
     isOpen: boolean;
     onSelect: (s: Source) => void;
     onClose: () => void;
  }

  let { sources, isOpen, onSelect, onClose }: Props = $props();
</script>

{#if isOpen}
  <div class="source-selector fixed inset-0 ... bg-black/50">
     <div class="modal-box ...">
        <h3>选择元数据来源</h3>

        <div class="space-y-3">
           {#each sources as source}
              <button onclick={() => onSelect(source)} class="...">
                 <BookCover book={...} />
                 <!-- 详情 -->
                 <div>{source.confidence}%</div>
              </button>
           {/each}
        </div>
     </div>
  </div>
{/if}
```
