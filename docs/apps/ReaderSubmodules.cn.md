# 阅读器子模块分析 (Reader Submodules)

本文档补充分析 `src/app/reader/components` 下的四大核心子模块：**Notebook** (笔记分屏), **FooterBar** (底部控制栏), **Annotator** (标注系统), **TTS** (朗读系统)。

## 1. 笔记系统 (`notebook/`)

### 1.1 架构

Notebook 是一个**独立的分屏容器**，通常位于阅读器右侧。

- **Notebook.tsx**: 容器组件。复用了 `useDrag` 逻辑（同 Sidebar）来实现拖拽调整宽度。
- **NoteEditor.tsx**: 简单的文本编辑区域，用于创建/编辑笔记。

### 1.2 数据流

笔记数据 (`BookNote`) 存储在 `bookDataStore` 的 `config.booknotes` 数组中。

- **创建**: 用户在正文选中文字 -> 点击 "Annotate" -> `Notebook` 打开 -> 输入内容 -> 保存。
- **关联**: 笔记通过 `CFI` (Canonical Fragment Identifier) 与正文位置强绑定。

---

## 2. 底部栏 (`footerbar/`)

### 2.1 职责

`FooterBar` 是一个纯 UI 容器，根据设备类型渲染子组件：

- **MobileFooterBar**: 手机端布局（可能是精简版）。
- **DesktopFooterBar**: 桌面端布局（包含完整进度条、翻页按钮、章节跳转）。

### 2.2 核心逻辑

- **进度同步**: 实时监听 `readerStore` 的 `progress`，计算百分比 (`progressFraction`) 渲染进度条。
- **去抖动 (Debounce)**: 拖拽进度条时使用 `debounce` 避免频繁触发 `view.goToFraction()`。

---

## 3. 标注系统 (`annotator/`)

这是阅读器最复杂的交互模块，负责处理**文本选择**、**高亮绘制**和**弹出菜单**。

### 3.1 核心组件 (`Annotator.tsx`)

这是一个 "Headless" 逻辑组件（大部分时候不渲染可见 UI），它挂载在 Reader 上层。

- **事件监听**: 使用 `useTextSelector` Hook 统一处理 Mouse/Touch/Pointer 事件。
- **Foliate 集成**: 通过 `useFoliateEvents` 监听 `onDrawAnnotation` 事件，调用 Canvas 或 DOM 绘制高亮 (`Overlayer`)。

### 3.2 弹出层管理 (Popup Manager)

当用户选中文本时，`Annotator` 计算选区矩形 (`getBoundingClientRect`)，并动态定位弹出菜单：

- **AnnotPopup**: 高亮颜色选择、复制、TTS 触发。
- **Dict/Wiki/Trans**: 查词、维基百科、翻译浮层。
- **自适应定位**: `repositionPopups` 函数确保浮层在滚动时不脱离视口。

---

## 4. 朗读系统 (`tts/`)

### 4.1 控制器 (`TTSControl.tsx`)

这是 TTS 功能的 UI 入口。

- **生命周期**: 初始化 `TTSController` (Service Layer)，建立与 `EdgeTTS` 或 Native WebView TTS 的连接。
- **Unblock Audio**: 在 Mobile Safari/Chrome 上，为了防止后台播放被杀，使用了一个 "静音音频轨道" (`unblockAudio`) Hack。

### 4.2 媒体中心集成

深度集成 `MediaSession API`。

- 允许用户通过**系统锁屏界面**或**耳机按键**控制 播放/暂停/上一句/下一句。
- 同步封面图 (`fetchImageAsBase64`) 和章节信息到系统通知栏。

---

## 5. Svelte 迁移指南

### 5.1 标注系统重构

`Annotator.tsx` 目前是一个 900 行的巨型组件。迁移时应拆分：

- **Logic Layer**: 将事件监听、坐标计算提取为 `useSelection` Action 或 Controller Class。
- **UI Layer**: Svelte 的 Slot 和 Portal 机制非常适合做浮层 (`<Popup>`)，不再需要手动计算大量的 `z-index` 和绝对定位（可以利用 Floating UI 库）。

### 5.2 TTS 状态机

TTS 的状态（Play, Pause, Buffering）目前分散在 `TTSControl` 和 `TTSController` 中。
建议在 Svelte 中使用 **Finite State Machine (FSM)** 模式重构 `ttsStore`，让 UI 只是状态的纯映射。

### 5.3 组件复用

`Notebook` 和 `Sidebar` 共享了大量的 "拖拽调整大小" 逻辑。
在 Svelte 中，这应该被封装为一个通用的 `<ResizablePane>` 组件或 `web component`。
