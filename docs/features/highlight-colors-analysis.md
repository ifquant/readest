# 自定义高亮颜色功能分析

为了满足用户对色彩语义的个性化需求（例如：黄色=重点，绿色=疑问，红色=即使修正），Readest 允许用户自定义五种标准高亮色槽位的具体色值。

## 1. 颜色槽位模型

系统预定义了 5 个不可变的高亮语义槽位 (`HighlightColor`)，但其对应的 RGB 值是可变的：

- `red` (默认: #f87171)
- `yellow` (默认: #facc15)
- `green` (默认: #4ade80)
- `blue` (默认: #60a5fa)
- `violet` (默认: #a78bfa)

这种“语义不变，色值可变”的设计，确保了数据迁移时的稳定性（数据库只存语义 `"red"`），而在不同设备或主题下可以展现不同的视觉效果（如暗黑模式下使用更柔和的红色）。

## 2. 配置与存储 (`constants.ts`)

- **默认值**: `HIGHLIGHT_COLOR_HEX` 常量定义了 tailwindcss 风格的默认调色板 (400系列)。
- **用户配置**: `ReadSettings` 接口中包含 `customHighlightColors` 字典。
- **编辑器**: `HighlightColorsEditor.tsx` 提供了一个直观的设置界面，用户可以点击任意一个颜色圆点，弹出原生选色器 (`<input type="color">`) 进行修改。

## 3. 渲染管线

当阅读器加载时，`getStyles` (在 `utils/style.ts` 中) 会读取 `customHighlightColors`。

- **CSS 变量**: 虽然代码未直接展示 `getStyles` 内部细节，但通常做法是将这些颜色映射为 CSS 变量（如 `--highlight-red`）注入到 iframe 的 `<style>` 中。
- **标注渲染**: 当 `foliate-js` 渲染高亮 (`<mark>` 或 `<span>`) 时，会根据标注对象的 `color` 属性（如 "red"）应用对应的背景色样式。

## 4. 扩展应用：TTS 高亮

除了静态笔记高亮，TTS 朗读时的高亮色 (`ttsHighlightOptions`) 也可以从这些自定义颜色中选择，或者独立配置（`customTtsHighlightColors`），确保朗读进度的视觉焦点足够清晰且不刺眼。
