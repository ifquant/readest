# Readest 笔记与标注功能分析

Readest 的笔记（Annotation）功能深度集成在阅读引擎 (`foliate-js`) 与 React 应用层之间。它不仅支持简单的高亮，还包含笔记、书签和摘录，并提供了丰富的上下文操作（翻译、词典、TTS等）。

## 1. 数据模型 (Data Model)

所有的笔记数据都存储在 `BookConfig` 对象中的 `booknotes` 数组里，并最终持久化到数据库或本地存储。

### 核心类型定义 (`src/types/book.ts`)

```typescript
export type BookNoteType = 'bookmark' | 'annotation' | 'excerpt';

export interface BookNote {
  id: string; // 唯一 ID
  type: BookNoteType; // 类型：书签 / 标注 / 摘录
  cfi: string; // 位置索引 (EPUB CFI)
  text?: string; // 选中的原文内容
  style?: HighlightStyle; // 高亮样式：'highlight' | 'underline' | 'squiggly'
  color?: HighlightColor; // 颜色：'red', 'yellow', 'green', ...
  note: string; // 用户输入的笔记内容

  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null; // 软删除标记
}
```

## 2. 交互架构

交互流程分为三个主要阶段：**选中 (Selection)** -> **操作 (Action)** -> **渲染 (Rendering)**。

```mermaid
graph TD
    User[用户选中一段文本] --> |Selection API| useTextSelector
    useTextSelector --> |生成 CFI 和 Range| Annotator[Annotator.tsx]
    Annotator --> |显示| Popup[工具栏气泡 (Color/Copy/Note/Translate)]

    Popup --> |点击高亮/笔记| Handler[handleHighlight / handleAnnotate]
    Handler --> |更新 Store| BookDataStore
    BookDataStore --> |React 更新| FoliateViewer
    FoliateViewer --> |调用| view.addAnnotation()
    view.addAnnotation() --> |绘制| Overlayer[Foliate Overlayer]
```

### 2.1 选中与工具栏 (`Annotator.tsx`)

- **`useTextSelector`**: 监听 DOM 的 `selectionchange`、`pointerup` 等事件，计算选中区域的坐标和 CFI。
- **工具栏弹出**: 当有文本被选中时，`Annotator` 组件会根据选中区域坐标 (`getPopupPosition`) 渲染工具栏。
- **快捷操作**: 支持“高亮”、“下划线”、“波浪线”、“复制”、“翻译”、“百科”、“TTS”等操作。

### 2.2 数据存储 (`BookDataStore`)

- 当用户创建或修改笔记时，数据会更新到 `BookConfig.booknotes`。
- **软删除**: 删除笔记时通常只设置 `deletedAt` 时间戳，以便进行同步处理。

### 2.3 渲染层 (`foliate-js` 集成)

- **初次加载**: 当书籍打开时，`Annotator` 会遍历 `booknotes`，过滤出当前章节 (`isCfiInLocation`) 的笔记。
- **绘制**: 调用 `view.addAnnotation(note)`。底层使用 `foliate-js/overlayer.js` 在文本上方绘制 SVG 或 Canvas 图层。
  - **高亮**: 绘制半透明背景色。
  - **下划线/波浪线**: 绘制 SVG 路径。

## 3. 侧边栏展示 (`BooknoteView.tsx`)

侧边栏提供了一个集中的笔记列表视图。

### 3.1 笔记分组

笔记不是平铺展示的，而是**按章节分组**。

- 利用 `findTocItemBS` (二分查找) 根据笔记的 `cfi` 找到其所属的章节 (TOC Item)。
- 将笔记聚合到对应的章节组 (`BooknoteGroup`) 中。

### 3.2 排序

- **组内排序**: 根据 `CFI` 在书中的前后顺序排序 (`CFI.compare`)。
- **组间排序**: 根据章节 ID 排序。

## 4. 特殊功能

- **笔记导出**: 支持将所有笔记导出为 Markdown 格式 (`handleExportMarkdown`)，包含章节标题、原文和笔记内容。
- **快速操作 (Quick Actions)**: 用户可以在设置中配置“选中后直接高亮”或“直接复制”，跳过工具栏弹出步骤。
- **多设备同步**: 通过 `useNotesSync` Hook（类似进度同步）将 `booknotes` 数组同步到云端。
