# 组件分析: useMetadataEdit (Hook)

## 1. 组件概述

`useMetadataEdit` 是一个自定义 hook，封装了元数据编辑器的业务逻辑。它实际上充当了 `BookDetail` 组件的“Controller”或“ViewModel”。

## 2. 代码分析

### 职责

- **状态管理**：持有 `editedMeta`（草稿状态），`lockedFields`，`fieldErrors`，`fieldSources`。
- **验证**：`handleFieldValidation` 对输入运行检查（日期格式、ISBN 校验、必填字段）。
- **锁定逻辑**：切换锁，处理全部锁定/全部解锁。
- **自动检索集成**：调用 `searchMetadata` 服务，处理结果，并将选定的结果合并到 `editedMeta` 中（遵循锁定字段）。
- **合并逻辑**：应用源数据时，遍历键并仅更新未锁定且具有有效值的字段。

## 3. Svelte 迁移指南

### Svelte 实现 (状态逻辑)

在 Svelte 5 中，这应该是一个基于 Rune 的类（`.svelte.ts` 文件）。

```typescript
// MetadataEditor.svelte.ts
import { searchMetadata } from '$lib/services/metadata';

export class MetadataEditor {
  editedMeta = $state<BookMetadata>({} as BookMetadata);
  lockedFields = $state<Record<string, boolean>>({});
  errors = $state<Record<string, string>>({});
  sources = $state<Record<string, string>>({}); // field -> source name

  constructor(initialMeta: BookMetadata) {
    this.editedMeta = { ...initialMeta };
    // 初始化锁
  }

  updateField(field: string, value: string) {
    if (this.lockedFields[field]) return;
    this.editedMeta[field] = value;
    this.validate(field, value);
  }

  toggleLock(field: string) {
    this.lockedFields[field] = !this.lockedFields[field];
  }

  async autoRetrieve() {
    // ... searchMetadata 逻辑 ...
    // ... 设置可用来源 ...
  }

  applySource(source: MetadataSource) {
    // 将 source.data 合并到 this.editedMeta 的逻辑
    // 跳过锁定字段
  }
}
```

### 组件中的使用

```svelte
<script>
   const editor = new MetadataEditor(book.metadata);
</script>

<input
  value={editor.editedMeta.title}
  oninput={(e) => editor.updateField('title', e.currentTarget.value)}
/>
```
