# 用户系统分析 (User System)

本文档分析 Readest 的用户身份认证 (`src/app/auth`) 和用户中心 (`src/app/user`) 模块。

## 1. 认证系统 (`src/app/auth/page.tsx`)

Readest 需要在 Web、Desktop (Windows/macOS/Linux) 和 Mobile (iOS/Android) 多端环境中处理统一的身份认证，这是一个典型的 **Hybrid Auth Challenge**。

### 1.1 多端适配策略

代码通过 `isTauriAppPlatform()` 和 `appService` 区分环境，采用不同的 OAuth 流程：

| 平台                     | 流程组件                 | 回调机制                                         |
| :----------------------- | :----------------------- | :----------------------------------------------- |
| **Web**                  | `<Auth />` (Supabase UI) | 标准 HTTP Redirect (`/auth/callback`)            |
| **Mobile (iOS/Android)** | Deep Link                | 自定义协议 (`readest://auth-callback`)           |
| **Desktop (Prod)**       | Deep Link                | 自定义协议 (`readest://auth-callback`)           |
| **Desktop (Dev)**        | Local Server             | 启动本地 HTTP Server (`localhost:port`) 接收回调 |

### 1.2 关键实现细节

- **Local Server (Dev)**: 使用 `@fabianlars/tauri-plugin-oauth` 在本地启动一个临时的 HTTP Server，用于在开发环境下捕获 OAuth 回调（因为开发环境通常无法注册系统级 Deep Link）。
- **Deep Link 监听**: 在 Prod 环境中，使用 `onOpenUrl` (macOS/Native) 和 `single-instance` 事件 (Windows/Linux) 来捕获外部唤起的 URL。
- **Apple Sign In**: 针对 iOS，直接调用 Native API (`getAppleIdAuth`) 获取 Identity Token，而不是走 Web OAuth 流程，以符合 App Store 审核要求。

---

## 2. 用户中心 (`src/app/user`)

用户中心不仅是展示个人信息的地方，还包含了核心的 **云存储管理** 功能。

### 2.1 云存储管理器 (`components/StorageManager.tsx`)

这是一个功能完备的文件管理器，用于管理用户上传到云端的书籍和封面。

- **分组视图**: 通过 `groupedFiles` 计算属性，将散乱的文件（Cover, Epub, PDF）按 `book_hash` 聚合展示。这解决了云端对象存储 (S3-like) 是扁平结构而 UI 需要层级结构的问题。
- **配额可视化**: 调用 `getStorageStats` 获取已用空间和总配额，并渲染进度条。
- **批量操作**: 支持多选文件进行批量删除 (`purgeFiles`)，并自动更新本地状态。

---

## 3. Svelte 迁移指南

### 3.1 Auth 流程重构

在 SvelteKit 中，Auth 流程应更加利用 SSR 能力，但在 Tauri 环境下仍需保持 SPA 模式。

- **Route**: `src/routes/auth/+page.svelte`。
- **Platform Check**: 将 `isTauriAppPlatform` 的逻辑封装为 `$lib/utils/platform`。
- **Event Listener**: 使用 `onMount` 挂载 Deep Link 监听，并在 `onDestroy` 中清理。

### 3.2 存储管理器优化

`StorageManager` 目前包含了大量 `useState` (Search, Sort, Pagination, Selection)。
在 Svelte 5 中，这可以通过 **Fine-grained Reactivity** 大幅简化：

```typescript
class StorageController {
  files = $state<FileRecord[]>([]);
  searchQuery = $state('');

  // Derived state automatically updates
  groupedFiles = $derived(this.groupFiles(this.files));
  filteredFiles = $derived(this.filterFiles(this.groupedFiles, this.searchQuery));
}
```

这样的重构可以将 500 行的巨型组件拆分为 `StorageController.ts` (逻辑) 和 `StorageManager.svelte` (视图)。
