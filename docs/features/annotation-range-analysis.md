# 标注范围微调功能分析

在触摸屏或精准度有限的设备上，一次性选中精确的文本范围并非易事。Readest 提供了“二次编辑”高亮范围的能力。

## 1. 交互设计

当用户点击一个现有的高亮（Annotation）时，除了弹出菜单外，系统会进入“编辑模式” (`AnnotationRangeEditor`)：

- **控制手柄 (Handles)**: 在选区的首尾两端出现原生的水滴状手柄（根据 `isVertical` 自动调整方向，如竖排时手柄横向伸出）。
- **拖拽反馈**: 用户按住手柄滑动时，高亮区域会实时更新，吸附到最近的字符边界。

## 2. 技术实现 (`AnnotationRangeEditor.tsx`)

这是一个覆盖在阅读器上方的绝对定位层 (`fixed inset-0 z-50`)，通过 `pointer-events-none` 穿透点击，但在手柄区域 (`pointer-events-auto`) 捕获交互。

### 2.1 坐标同步

- **初始化**: `getHandlePositionsFromRange` 将当前 DOM Range 的 `getBoundingClientRect` 转换为屏幕坐标，定位初始手柄。
- **拖拽循环**:
  1.  `Handle` 组件捕获 `pointerdown`/`pointermove`。
  2.  `useAnnotationEditor` 接收新的屏幕坐标 (x, y)。
  3.  通过 `document.caretPositionFromPoint` (或 `caretRangeFromPoint`) 反算回 DOM 节点的 Key + Offset。
  4.  更新临时的 `TextSelection` 状态，触发渲染层重绘高亮背景。

### 2.2 跨页/跨栏支持

由于 `foliate-js` 可能将内容分页渲染，若选区跨越了页面（Column），`getHandlePositions` 能够智能识别起始页和结束页的边界坐标，确保手柄始终出现在可视区域的正确位置。

## 3. 视觉细节

- **自适应配色**: 手柄颜色 (`handleColorHex`) 自动跟随高亮的颜色（如黄色高亮配黄色手柄），但在 E-ink 模式下会強制黑白反色，确保对比度。
- **触控优化**: 手柄拥有较大的触摸热区 (`touch-action: none`)，防止误触翻页。
