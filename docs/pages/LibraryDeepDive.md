# 书架模块深度解析 (Library Module Deep Dive)

## 核心逻辑 (`src/app/library/page.tsx`)

书架 (Library) 是应用的“中枢神经”，它不仅是一个展示层，还承担了大量的数据管理职责。

### 无限滚动与虚拟化

- 虽然代码中未直接显示虚拟列表库，但引用了 `OverlayScrollbarsComponent`。
- 对于拥有上千本书的用户，渲染性能是关键。
- Readest 使用 `useResponsiveSize` 动态计算网格布局。

### 导入流程 (Import Pipeline)

该流程由 `importBooks` 函数编排：

1.  **文件选择**: `selectFiles` (Native) 或 `<input type="file">` (Web)。
2.  **解析**: `AppService.importBook` 负责解压 EPUB/PDF，提取元数据和封面。
3.  **入库**: 更新 `IndexedDB` (Web) 或文件系统索引 (Native)。
4.  **同步**: 如果开启了 `autoUpload`，会触发 `transferManager.queueUpload` 将书籍上传到云端。

### 状态管理

- `useLibraryStore`: 全局图书列表。
- `local state`: 选中模式 (`isSelectMode`), 过滤状态, 搜索关键词。

```typescript
// 复杂的交互逻辑耦合在 Page 组件中
const handleImportBooksFromDirectory = async () => {
  // 1. 权限检查
  // 2. 递归扫描目录
  // 3. 过滤支持的扩展名
  // 4. 批量导入
};
```

## Svelte 迁移指南

### 拆分策略

目前的 `page.tsx` 有 900 行代码，包含了 UI、业务逻辑和事件处理。迁移时必须进行 **逻辑抽离 (Logic Extraction)**。

### 1. 业务逻辑 -> Stores

创建一个 `libraryManager.ts` (Svelte Store) 来封装导入和文件操作。

```typescript
// src/lib/stores/libraryManager.ts
import { writable } from 'svelte/store';
import { appService } from './envStore';

function createLibraryManager() {
  const { subscribe, update } = writable({ importing: false, progress: 0 });

  return {
    subscribe,
    async importFiles(files) {
      update((s) => ({ ...s, importing: true }));
      // ... import logic copied from page.tsx ...
      update((s) => ({ ...s, importing: false }));
    },
  };
}
export const libraryManager = createLibraryManager();
```

### 2. UI 组件化

- `+page.svelte`: 仅保留布局。
- `BookGrid.svelte`: 负责渲染书籍列表。
- `ImportZone.svelte`: 处理拖拽上传 (`useDragDropImport` 迁移为 Svelte Action)。

#### 拖拽上传 (Svelte Action)

```typescript
// src/lib/actions/dragdrop.ts
export function dragdrop(node: HTMLElement, onFiles: (files: File[]) => void) {
  const handleDrop = (e) => {
    e.preventDefault();
    onFiles(e.dataTransfer.files);
  };
  node.addEventListener('drop', handleDrop);
  return {
    destroy() {
      node.removeEventListener('drop', handleDrop);
    },
  };
}
```

```svelte
<!-- ImportZone.svelte -->
<div use:dragdrop={files => libraryManager.importFiles(files)}>
  Drop books here
</div>
```
