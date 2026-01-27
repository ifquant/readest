# 云备份状态可见性分析 (Cloud Backup Status)

Readest v0.9.43 阶段的核心改进是将隐性的同步状态变为显性的用户反馈，让用户明确知晓每一本书是否已备份到云端。

## 1. 状态定义

基于 `Book` 对象的两个核心时间戳字段判断状态：

- `uploadedAt`: 书籍最后一次上传到云端的时间。
- `downloadedAt`: 书籍最后一次从云端下载（或本地导入/修改）的时间。

| 状态                      | 判据                          | 图标/表现                                        |
| :------------------------ | :---------------------------- | :----------------------------------------------- |
| **仅本地 (Local Only)**   | `!uploadedAt`                 | 显示 **云上传图标** (`LiaCloudUploadAltSolid`)   |
| **仅云端 (Cloud Only)**   | `uploadedAt && !downloadedAt` | 显示 **云下载图标** (`LiaCloudDownloadAltSolid`) |
| **已同步 (Synced)**       | `uploadedAt && downloadedAt`  | 不显示任何图标 (Clean State)                     |
| **传输中 (Transferring)** | `transferProgress !== null`   | 显示 **环形进度条** (`radial-progress`)          |

## 2. UI 实现 (`BookItem.tsx`)

### 2.1 状态指示器

在书架网格 (`BooksGrid`) 或列表模式下，每本书封面的角落或信息栏会动态渲染状态图标。

- **代码位置**: `BookItem.tsx` -> `.show-cloud-button` 容器内。
- **交互**:
  - 点击“上传图标” -> 触发 `handleBookUpload`。
  - 点击“下载图标” -> 触发 `handleBookDownload`。

### 2.2 传输队列 (`TransferQueuePanel`)

当任务开始后，状态不会立即变成完成，而是进入传输队列。

- **全局队列**: 右下角的悬浮面板 (`TransferQueuePanel`) 会展示当前正在排队及传输的任务列表。
- **实时进度**: `BookItem` 组件通过 props 接收 `transferProgress`，利用 CSS 变量 `--value` 渲染纯 CSS 的环形进度条，提供流畅的视觉反馈。

## 3. 错误处理与重试

- 如果上传/下载失败，系统会通过全局 Toast 提示用户（如 "Failed to upload..."）。
- 状态不会变更，用户可以再次点击图标重试。
- 删除逻辑中也集成了云端与本地的具体选择（"Delete from Cloud", "Delete from Local", "Both"），进一步强化了用户对文件位置的掌控感。

## 4. 移动端适配

该设计同时适配了桌面和移动端：

- **Desktop**: 悬停 (Hover) 时显示详细操作按钮。
- **Mobile**: 图标常驻或通过长按菜单触发，确保触摸屏用户也能直观感知状态。
