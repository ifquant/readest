# 组件分析: BookDetailEdit

## 1. 组件概述

`BookDetailEdit` 是用于编辑书籍元数据的表单界面。它允许修改字段，管理锁定状态（以防止自动覆盖），以及替换封面图片。

## 2. 代码分析

### 逻辑

- **表单字段**：根据配置数组（`titleAuthorFields`, `metadataGridFields`）渲染 `FormField` 组件列表。
- **封面管理**：允许使用本地文件替换封面或重置封面。处理用于预览的 Blob URL 生成。
- **锁定系统**：每个字段都有锁定状态。锁定的字段是只读的，并且不包括在“自动检索”更新中。这对于希望在获取缺失数据的同时保留手动编辑的用户至关重要。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

```svelte
<script lang="ts">
  import FormField from './FormField.svelte';
  import BookCover from '../BookCover.svelte';

  interface Props {
     metadata: BookMetadata;
     lockedFields: Record<string, boolean>;
     onFieldChange: (field: string, val: string) => void;
     // ...
  }

  let { metadata, lockedFields, onFieldChange, ... }: Props = $props();

  // 封面图片选择逻辑...
</script>

<div class="bg-base-100 relative w-full rounded-lg">
  <!-- 封面部分 -->
  <div class="mb-6 flex gap-4">
     <div class="cover-field ...">
        <BookCover ... />
        <!-- 编辑按钮 -->
     </div>

     <!-- 核心字段 -->
     <div class="flex-1 ...">
        {#each titleAuthorFields as field}
           <FormField
              label={field.label}
              value={field.value}
              isLocked={lockedFields[field.field]}
              onchange={(val) => onFieldChange(field.field, val)}
              ...
           />
        {/each}
     </div>
  </div>

  <!-- 网格字段 -->
  <div class="grid ...">
     {#each metadataGridFields as field}
        <FormField ... />
     {/each}
  </div>

  <!-- 操作栏 -->
  <div>
     <button onclick={onSave}>保存</button>
     <!-- ... -->
  </div>
</div>
```
