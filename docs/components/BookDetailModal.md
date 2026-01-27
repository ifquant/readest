# 组件分析: BookDetailModal

## 1. 组件概述

`BookDetailModal` 是查看和编辑书籍元数据的编排组件。它是一个模态包装器，在“查看模式”(`BookDetailView`) 和“编辑模式”(`BookDetailEdit`) 之间切换，并处理高级操作（删除、下载、导出）。

## 2. 代码分析

### 架构

- **状态**：跟踪 `editMode`, `bookMeta`（异步获取），`activeDeleteAction`（用于确认对话框）。
- **逻辑**：
  - 在挂载时获取最新的元数据和文件大小。
  - 使用 `useMetadataEdit` hook 来管理编辑状态的复杂性（验证、锁定、自动检索）。
  - 处理带有确认步骤的删除/导出操作的生命周期。

### 依赖

- `BookDetailView` / `BookDetailEdit`：子组件。
- `SourceSelector`：用于在自动检索期间选择元数据来源。
- `Dialog`：包装器。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

此组件是 **Container Component** 模式的理想候选者。

```svelte
<script lang="ts">
  import Dialog from '../Dialog.svelte';
  import BookDetailView from './BookDetailView.svelte';
  import BookDetailEdit from './BookDetailEdit.svelte';
  import SourceSelector from './SourceSelector.svelte';
  import { useMetadataEdit } from './useMetadataEdit'; // 逻辑提取到类/store

  interface Props {
    book: Book;
    isOpen: boolean;
    onClose: () => void;
    // ... handlers
  }

  let { book, isOpen, onClose, ...handlers }: Props = $props();

  let editMode = $state(false);
  let detailState = $state(createBookDetailState(book)); // 假设的状态类

  // 切换模式的逻辑
  async function save() {
      // await detailState.save();
      editMode = false;
  }
</script>

<Dialog bind:isOpen title={editMode ? '编辑元数据' : '书籍详情'}>
  {#if editMode}
      <BookDetailEdit
         book={book}
         onCancel={() => editMode = false}
         onSave={save}
         ...
      />
  {:else}
      <BookDetailView
         book={book}
         onEdit={() => editMode = true}
         ...
      />
  {/if}
</Dialog>

<!-- 确认对话框逻辑... -->
```

### 关键变更

- **Hook 重构**：`useMetadataEdit` 是一个复杂的 React Hook。在 Svelte 5 中，这种逻辑完美封装在一个基于 rune 的辅助类中（例如 `class MetadataEditor { ... }`），该类暴露响应式状态（`editor.lockedFields`, `editor.editedMeta`）。
