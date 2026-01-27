# 后台传输队列功能分析

Readest v0.9.96 引入了统一的后台传输队列 (Transfer Queue)，用于管理电子书的云端上传与下载任务，替代了以往分散的加载状态。

## 1. 架构核心 (`useTransferQueue`)

传输系统基于 zustand 的 `useTransferStore` 状态管理。

- **状态模型**: `TransferItem` 包含了任务类型 (upload/download/delete)、状态 (pending/in_progress/completed/failed/cancelled)、进度百分比、速度以及错误信息。
- **生命周期**: 任务被添加到队列后，会自动由后台 worker (或 React Effect 模拟的 worker) 调度执行。支持暂停 (`isQueuePaused`) 和恢复。

## 2. 界面交互 (`TransferQueuePanel`)

UI 组件提供了一个模态浮层，功能包括：

- **批量操作**: 自动扫描当前视图中“未上传”或“未下载”的书籍，提供“上传全部”/“下载全部”的一键操作按钮。
- **实时监控**:
  - 进度条与百分比。
  - 实时传输速度 (`formatSpeed` 计算 bytes/s)。
  - 状态图标 (`MdCloudUpload`, `MdCloudDownload`, `MdCheckCircle` 等)。
- **筛选与清洗**: 支持按状态 (Active, Completed, Failed) 筛选任务列表；支持一键清除已完成或失败的任务记录。

## 3. 错误处理

系统为每个任务维护独立的 Retry 机制。

- 失败的任务会保留在列表中，并显示具体的错误原因 (如 "Network Error")。
- 用户点击重试 (`MdRefresh`) 可重新将任务加入 Pending 队列。

## 4. 业务价值

在处理几百本电子书的大型书库同步时，前台阻塞式的 Loading 体验极差。传输队列将耗时操作解耦到后台，用户可以继续阅读或整理书架，仅在需要时查看队列状态，大幅提升了应用的响应性。
