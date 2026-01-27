# 快捷键系统分析

Readest 拥有两套快捷键响应机制：一套运行在宿主（Electron/Tauri/Browser）层，另一套运行在阅读器 iframe 内部。为了提供无缝体验，系统实现了复杂的事件穿透与统一分发。

## 1. 架构：跨层级事件总线

由于安全性限制，iframe 内的键盘事件无法直接冒泡到父窗口。

1.  **捕获层 (`iframeEventHandlers.ts`)**: 在 `foliate-js` 渲染的 iframe document 上监听 `keydown` / `keyup`。
2.  **通信层**: 将 `key`, `code`, `ctrlKey` 等状态序列化，通过 `window.postMessage('iframe-keydown', ...)` 发送给父窗口。
3.  **分发层 (`useKeyDownActions.ts` / `useShortcuts`)**: 父窗口统一接收这些消息，以及自身的键盘事件，查表 (`shortcuts.ts`) 匹配用户指令。
4.  **执行层**: 调用 `ReaderStore` 或 `DeviceControlStore` 执行翻页、跳转章节、调整字号等操作。

## 2. 章节跳转快捷键

针对用户反馈的“章节跳转”需求，v0.9.90 引入了明确的快捷键定义：

- **上一章 / 下一章 (Previous/Next Section)**:
  - `Alt + ArrowUp` / `Alt + ArrowDown`
  - `Opt + ArrowUp` / `Opt + ArrowDown` (macOS)
- **上一页 / 下一页 (Previous/Next Page)**:
  - `ArrowLeft` / `ArrowRight` (默认)
  - `h` / `l` (Vim 模式)
  - `PageUp` / `PageDown`
- **半页跳转**: `Shift + ArrowUp/Down` (用于长图或连续滚动模式)。

## 3. 自定义配置

`shortcuts.ts` 中定义了 `DEFAULT_SHORTCUTS` 常量，并提供了 `loadShortcuts()` 从 `localStorage` 读取用户自定义配置的能力。这允许高级用户修改键位映射（例如改回 `Cmd+Arrow` 风格）。
