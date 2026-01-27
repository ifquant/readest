# UI 组件库与设计系统 (UI Kit & Design System)

Readest 拥有一套基于 Tauri 和 React 构建的跨平台 UI 系统，旨在兼顾桌面端的精细操作与移动端的触控体验，同时通过 Tailwind CSS 和 CSS Variables 实现高度可定制的主题引擎。

## 1. 样式与主题引擎

基础样式架构位于 `apps/readest-app/src/styles`。

### 1.1 Tailwind CSS 配置 (`globals.css`)

- **分层架构**: 遵循 `@tailwind base`, `components`, `utilities` 分层。
- **安全区域**: 定义 `--safe-area-inset-*` 变量，适配移动端刘海屏。
- **特定平台适配**:
  - `data-eink="true"`: 针对墨水屏设备强制去除阴影、动画，增强对比度。
  - `foliate-view`: 针对阅读器视图的特殊布局处理。

### 1.2 动态主题系统 (`themes.ts`)

Readest 不仅支持浅色/深色模式，还支持任意配色方案的生成。

- **Palette 生成**: 使用 `tinycolor2` 库，基于 `bg` (背景) 和 `fg` (前景) 色自动生成由浅到深的色阶 (`base-100` 到 `base-300`)。
- **内置主题**: 预设 Default, Sepia, Solarized, Nord 等 10+ 种阅读主题。
- **自定义注入**: `applyCustomTheme` 函数将计算好的颜色转换为 CSS 变量 (`--b1`, `--bc`, `--p` 等) 并注入到 `<style id="theme-styles">` 标签中，实现运行时换肤。

## 2. 核心交互组件 (`src/components`)

组件库的设计核心是**响应式交互 (Responsive Interaction)**，同一组件在不同设备上表现不同。

### 2.1 响应式弹窗 (`Dialog.tsx`)

- **Desktop**: 表现为屏幕中央的传统模态框 (Modal)。
- **Mobile**: 表现为可拖拽的底部抽屉 (Bottom Sheet)。
  - 集成 `useDrag` Hook 处理手势拖拽、速度阈值判断 (`VELOCITY_THRESHOLD`)。
  - 支持“半开” (Snap) 和“全开”状态。
  - 拦截安卓物理返回键 (`Back Key`) 关闭弹窗。

### 2.2 虚拟化列表 (`Bookshelf.tsx`)

虽然 `Bookshelf` 是业务组件，但在 UI 实现上它展示了网格/列表切换的模式：

- **Grid**: 响应式 `grid-cols-*` (Tailwind) + CSS Grid 布局。
- **List**: Flex 布局。
- **Cover**: 支持 `fit` (完整显示) 和 `crop` (填充裁剪) 两种封面渲染模式。

### 2.3 其他基础组件

- **Spinner**: 加载指示器。
- **Toast**: 全局消息通知队列。
- **Dropdown/Menu**: 封装了 Popper.js 逻辑的弹出菜单，处理边界碰撞检测。

## 3. 设计原则

1.  **移动优先 (Mobile First)**: CSS 中优先编写移动端样式，使用 `sm:`, `md:` 断点适配桌面端。
2.  **沉浸式体验**:
    - `useThemeStore` 控制系统状态栏显隐。
    - `window-border`: 在 macOS/Linux 上自定义窗口边框，统一视觉风格。
3.  **无障碍与性能**:
    - 使用 `transform` 代替 `top/left` 进行动画以提升帧率。
    - 墨水屏模式下自动禁用所有 CSS Transition (`.no-transitions`)。
