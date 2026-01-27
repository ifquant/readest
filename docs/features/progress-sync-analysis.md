# 阅读进度同步机制分析

Readest 采用了一套复杂的双层同步策略，既确保了跨设备的阅读进度一致性，又保持了与外部生态系统（如 KOReader）的互操作性。

## 1. 双层架构 (Dual-Layer Architecture)

Readest 并不依赖单一的“进度源”，而是并行同步两股完全独立的数据流。

| 层级                       | 组件              | 目标端            | 数据格式            | 目的                                                                  |
| -------------------------- | ----------------- | ----------------- | ------------------- | --------------------------------------------------------------------- |
| **原生同步 (Native Sync)** | `useProgressSync` | Supabase (App DB) | `BookConfig` (Json) | Readest 客户端之间的全状态同步（包含主题、字体、精确的 CFI 位置等）。 |
| **KOSync**                 | `useKOSync`       | KOSync Server     | XPointer / 百分比   | 与 KOReader (墨水屏设备) 互通。                                       |

## 2. 原生同步 (`useProgressSync.ts`)

这是 Readest 自身客户端之间的主要同步机制。

### 工作流

1.  **触发 (Trigger):**
    - **拉取 (Pull):** 当书籍被打开时自动触发 (`useEffect`)。
    - **推送 (Push):** 当本地进度发生变化时触发，带有防抖机制 (Debounce 5秒)。
2.  **数据负载 (Data Payload):** 序列化并推送整个 `BookConfig` 对象。包含：
    - `location` (EPUB CFI) - 精确到字符级别的阅读位置。
    - `viewSettings` (Theme, Font, etc.) - 阅读环境配置（如字号、主题）。
3.  **冲突解决:** 基于 `updatedAt` 时间戳，采用“后写入者胜” (Last-write-wins) 策略。

## 3. KOSync 集成 (`useKOSync.ts`)

这一层专门用于对接 **KOReader** 生态。由于 KOReader 使用完全不同的渲染引擎 (CREngine)，直接同步 CFI 是无法互通的。

### 3.1 数据转换 (The Bridge)

Readest 在其内部格式 (CFI) 和 KOReader 格式 (XPointer) 之间进行实时转换。

- **推送 (Readest -> KOReader):**

  - Hook: `generateKOProgress`
  - 过程: 将当前的 CFI 转换为“标准化的 XPointer”，使用 `XCFI` 工具类。
  - 负载: `{ document: hash, progress: "/body/...", percentage: 0.45, device: "readest" }`

- **拉取 (KOReader -> Readest):**
  - Hook: `applyRemoteProgress`
  - 过程: 获取远程的 XPointer。使用 `getCFIFromXPointer` 在 DOM 中搜索并找到最匹配该 XPointer 的元素。
  - 动作: `view.goTo(cfi)` 跳转到计算出的 CFI 位置。

### 3.2 冲突策略

用户可以在设置中配置冲突处理策略 (`settings.kosync.strategy`):

- **静默 (Silent):** 自动处理。如果远程时间戳 > 本地，则覆盖本地。
- **提示 (Prompt):** 如果远程更新，弹出 `KOSyncResolver` 对话框。
- **发送/接收 (Send/Receive):** 强制单向同步。

### 3.3 冲突解决 UI (`KOSyncResolver.tsx`)

当在“提示”模式下检测到冲突时：

1.  用户会看到一个对话框，对比本地进度与远程进度。
2.  **预览:** UI 会为两个位置计算人类可读的预览文本（例如：“第 45 页 / 共 300 页 (15%)”），辅助用户决策。
3.  **决策:**
    - **使用本地 (Use Local):** 触发强制推送到服务器。
    - **使用远程 (Use Remote):** 触发 `applyRemoteProgress` 跳转到服务器记录的位置。

## 4. 关键实现细节

### 防抖 (Debouncing)

两个 Hook 都使用了 `debounce`（通常为 5 秒），以防止用户快速滚动或翻页时向服务器发送过多请求。

### 哈希匹配 (Hash Matching)

同步完全依赖书籍文件的 **MD5 Hash**。

- 如果你修改了 EPUB 文件（例如通过 Calibre 转换），哈希值会改变。
- Readest 会将其视为一本完全不同的书。
- KOSync 使用此哈希（`document` 字段）来映射进度，确保不会将进度同步到错误的书籍版本上。
