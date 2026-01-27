# 阅读控制功能分析：禁用点击翻页

为了防止误触，特别是对于习惯只使用键盘或滚轮翻页的用户，Readest 提供了“禁用点击翻页 (Disable Click Navigation)”选项。

## 1. 交互逻辑 (`usePagination.ts`)

点击事件的处理逻辑位于 `handleInternalClick` (或类似的点击处理流中)。系统将屏幕水平方向分为三个区域：

- **左侧**: 上一页
- **中间**: 唤起/隐藏菜单 (`toggleBars`)
- **右侧**: 下一页

### 1.1 默认行为

- 点击左侧 -> `viewSettings.swapClickArea ? next : prev`
- 点击右侧 -> `viewSettings.swapClickArea ? prev : next`
- 点击中间 -> Toggle Bars

### 1.2 启用“禁用点击翻页”后

当 `viewSettings.disableClick` 为 `true` 时：

- **逻辑变更**: 无论点击屏幕的左侧、右侧还是中间，**一律视为点击中间**。
- **结果**:
  - 点击任何空白区域都会唤起或隐藏菜单栏。
  - 翻页动作被拦截。

## 2. 边缘情况与优先级

- **链接/交互元素**: `event.target` 检测优先级更高。如果用户点击的是链接 (`<a>`)、图片 (`<img>`且有预览逻辑) 或脚注，会优先响应这些元素的默认行为，而不会进入翻页/菜单判断逻辑。
- **拖拽选中**: 文本选择操作由浏览器原生处理或 `Annotator` 拦截，不触发 Click 翻页。

## 3. UI 设置 (`ControlPanel.tsx`)

该开关位于“控制/操作”面板中。

- **持久化**: 该设置属于 `ViewSettings`，意味着可以针对每一本书单独设置（例如漫画书可能希望点击翻页，而参考书希望防误触）。
- **组合效应**: 它可以与 `swapClickArea`（左右互换）、`fullscreenClickArea`（全屏点击向下翻页）等其他控制选项共存，但优先级最高（一旦禁用，其他区域映射失效）。
