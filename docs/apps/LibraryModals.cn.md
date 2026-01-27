# 书架模态窗口分析 (Library Modals)

书架功能不仅仅是展示书籍，还包含了复杂的数据管理功能，这些功能通常通过模态窗口 (Modal) 呈现。
本文档分析 `src/app/library/components` 下的三个关键模态组件：数据迁移、传输队列、分组管理。

## 1. 数据迁移窗口 (`MigrateDataWindow.tsx`)

### 1.1 核心职责

允许用户将应用的**数据根目录** (`Data/`) 移动到文件系统的其他位置。
这对 Android 用户尤为重要（支持将数据迁移到外置 SD 卡），桌面用户也可能需要整理磁盘空间。

### 1.2 迁移流程 (Transaction-like)

为了保证数据安全，迁移过程模拟了事务操作：

1.  **验证**: 确保新旧目录不同。
2.  **复制**: 逐个复制文件 (`appService.copyFile`)，并实时更新 UI 进度条。
3.  **校验**: 读取新目录，比对文件存在性和大小 (`appService.readDirectory`)。
4.  **切换**:
    - 删除旧目录 (`appService.deleteDir`)。
    - 更新 `settings.customRootDir` 指向新路径。
    - 持久化设置并重启应用 (`relaunch`)。

---

## 2. 传输队列面板 (`TransferQueuePanel.tsx`)

### 2.1 状态管理

UI 通过 `useTransferQueue` Hook 与全局 `TransferStore` 通信。

- **实时性**: 列表会根据 `transfer.progress` 和 `transfer.speed` 高频刷新。
- **聚合统计**: 顶部状态栏显示 Active/Pending/Completed/Failed 的总数。

### 2.2 交互设计

- **过滤**: 支持按状态筛选 (All/Active/Completed/Failed)。
- **批量操作**: Retry All Failed, Clear Completed。
- **队列控制**: 全局暂停/恢复 (Pause/Resume)。

---

## 3. 分组管理弹窗 (`GroupingModal.tsx`)

### 3.1 虚拟文件系统

Readest 的分组是基于平铺数据结构的**虚拟文件夹**。

- `Book.groupName` 存储完整路径 (e.g., "Tech/Programming/Rust")。
- Modal 内部维护了 `currentPath` 状态，实现了类似 Finder/Explorer 的层级导航体验。

### 3.2 复杂逻辑

- **重命名**: 修改一个分组名实际上是批量更新所有相关书籍的 `groupName` 字段（前缀匹配替换）。
- **面包屑导航**: 动态生成面包屑，支持点击跳转到上级目录。
- **新建分组**: 自动生成 "Untitled Group N" 名称，防止冲突。

---

## 4. Svelte 迁移指南

### 4.1 模态框架构

React 中通常将 Modal 放在组件树深处，通过 `createPortal` 渲染。
Svelte 推荐使用全局 `<ModalContainer />` + Store 的模式：

```typescript
// stores/modal.ts
export const modal = writable<ComponentType | null>(null);
export const modalProps = writable<any>({});

// 触发
modal.set(MigrateDataModal);
modalProps.set({ onConfirm: ... });
```

### 4.2 迁移任务 (Migrate Logic)

`MigrateDataWindow` 中包含大量**非 UI 逻辑**（文件复制、校验）。
这些逻辑应提取到 `src/lib/services/migration.ts` 中，作为一个纯 TS 模块，UI 层只负责展示进度 Store 的状态。

### 4.3 传输队列优化

传输列表的高频更新在 React 中可能导致性能问题 (Re-render)。
Svelte 的细粒度响应性非常适合此场景：将每个 `TransferItem` 封装为独立组件，只更新变动的进度条，不重绘整个列表。
