# 组件分析: BookDetailView

## 1. 组件概述

`BookDetailView` 是一个展示组件，以只读格式显示书籍信息。它包括书籍封面、标题/作者、操作按钮（编辑、删除、云同步标签）和元数据字段网格。

## 2. 代码分析

### Props 接口

接收 `book`, `metadata`, `fileSize`, 和各种操作处理程序（`onEdit`, `onDelete` 等）。

### 逻辑

- **条件渲染**：仅当书籍状态支持时才显示按钮（上传/下载）（通过 `book.uploadedAt`, `book.downloadedAt` 检查）。
- **格式化**：大量使用实用函数（`formatDate`, `formatBytes`, `formatAuthors`）以良好地呈现原始数据。
- **HTML 渲染**：对于 Description 字段使用 `dangerouslySetInnerHTML`，因为它可能包含基本的格式化标签。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

```svelte
<script lang="ts">
  import BookCover from '../BookCover.svelte';
  import Dropdown from '../Dropdown.svelte';
  // ... 导入

  interface Props {
     book: Book;
     metadata: BookMetadata | null;
     // ...
  }
  let { book, metadata, ... }: Props = $props();

  // 格式化辅助函数可以直接导入或在模板中使用
</script>

<div class="relative w-full rounded-lg">
  <div class="flex h-32 ...">
     <BookCover book={book} mode="list" />

     <div class="title-author ...">
        <p class="..."> {formatTitle(book.title)} </p>

        <div class="actions ...">
           {#if onEdit}
              <button onclick={onEdit}>编辑</button>
           {/if}

           {#if onDelete}
              <Dropdown label="删除选项">
                  <!-- 菜单项 -->
              </Dropdown>
           {/if}
        </div>
     </div>
  </div>

  <div class="grid ...">
     <!-- 元数据网格 -->
     <div>
        <span class="font-bold">{$t('Publisher')}</span>
        <p>{formatPublisher(metadata?.publisher)}</p>
     </div>
     <!-- ... -->
  </div>

  <!-- 描述 -->
  <div>
     {@html metadata?.description || 'No description'}
  </div>
</div>
```

### 关键变更

- **HTML 注入**：`dangerouslySetInnerHTML` 在 Svelte 中变为 `{@html ...}`。
