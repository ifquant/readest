# 竖排文档弹窗方向分析 (Vertical Popup Direction)

Readest 针对 CJK 经典的竖排（直排）书籍提供了专门的弹窗交互适配。这确保了在繁体中文或日文竖排书籍中，选中文字或点击脚注时，弹窗（Popup）出现的位置符合用户直觉且不遮挡内容。

## 1. 定位策略差异 (`src/utils/sel.ts`)

核心逻辑位于 `getPosition` 函数中，根据 `isVertical` 参数采取完全不同的计算策略。

### 1.1 横排模式 (Horizontal Mode)

- **方向**: 优先 **上下 (`up` / `down`)**。
- **锚点**: 取选中区域的**水平中点**。
  - `start`: 尝试定位在选中区域的上方 (Top)。
  - `end`: 尝试定位在选中区域的下方 (Bottom)。
- **决策**: 优先选择上方 (`up`)，除非上方空间不足（例如靠近屏幕顶部）才切换到下方。

### 1.2 竖排模式 (Vertical Mode)

- **方向**: 优先 **左右 (`left` / `right`)**。
  - 因为竖排文字行是垂直分布的，弹出框若位于上下，极易与当前正在阅读的文字行重叠。
  - 左右侧通常是行与行之间的空白，或者是页边距。
- **锚点**: 取选中区域的**垂直中点** (`(top + bottom) / 2`)。
- **决策**:
  - 计算选中区域左侧剩余空间 (`leftSpace`) 和右侧剩余空间 (`rightSpace`)。
  - **空间优先**: 哪边空间大，弹窗就出现在哪边。例如，如果选中靠近右侧边缘的文字，弹窗会自动出现在左侧 (`left`)。

## 2. 弹窗坐标计算 (`getPopupPosition`)

确定了方向（如 `left`）和锚点（Triangle Position）后，需要计算整个弹窗盒子的 `(x, y)` 坐标。

| 方向      | X 坐标计算           | Y 坐标计算            |
| :-------- | :------------------- | :-------------------- |
| **Up**    | `center.x - width/2` | `top.y - height`      |
| **Down**  | `center.x - width/2` | `bottom.y + padding`  |
| **Left**  | `left.x - width`     | `center.y - height/2` |
| **Right** | `right.x + padding`  | `center.y - height/2` |

- **边界限制**: 计算结果最后会经过 `constrainPointWithinRect` 修正，确保弹窗永远不会超出屏幕可视区域（Viewport）。

## 3. 应用场景

### 3.1 文本选中菜单 (Annotator)

当用户在竖排书籍中拖拽选中一段文字时，工具栏（高亮/笔记/复制）会遵循上述逻辑，出现在选中文字的侧边，而不是头顶或脚下。

### 3.2 脚注弹窗 (Footnote)

脚注弹窗同样复用了这一逻辑。

- 在竖排书中点击注脚标号，弹窗会从标号的左侧或右侧“滑出”。
- **尺寸适配**: 竖排模式下的脚注弹窗通常更窄更高（`setResponsiveHeight` 基于屏幕高度，`setResponsiveWidth` 较窄），以适应竖排阅读的视觉流。

## 4. 实现细节

- **坐标转换**: 现代电子书经常使用 `transform: scale()` 或 `column-count` 进行排版。`getPosition` 中考虑了 `frameElement` 的 `transform` 矩阵 (`sx`, `sy`)，将 iframe 内部的相对坐标正确映射到主窗口的绝对坐标系中。
- **Padding 处理**: 选中区域 (`clientRects`) 可能会包含额外的 padding。代码中会读取 `computedStyle` 并进行剔除，确保弹窗紧贴真实的文字边缘。
