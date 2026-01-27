# 自定义 CSS 功能分析 (Custom CSS)

自定义 CSS 是 Readest 为高阶用户提供的核心个性化功能。它允许用户注入任意 CSS 代码到阅读器内核 (`<iframe>` 内部)，从而极其精细地控制排版样式，甚至覆盖应用默认的渲染逻辑。

## 1. 配置模型

- **字段**: `viewSettings.userStylesheet` (string类型)。
- **作用域**:
  - **Global**: 全局默认样式，应用于所有书籍。
  - **Per-Book**: 针对特定书籍的覆盖样式。
  - `userUIStylesheet`: 理论上还存在针对 UI 界面的自定义 CSS（如隐藏某些按钮），但在 `getStyles` 中主要处理的是内容样式。

## 2. 注入管线 (`utils/style.ts`)

`getStyles` 函数是样式生成的总线，它按顺序拼接各种样式块：

1.  `LayoutStyles`: 边距、行高、对齐等基础排版。
2.  `FontStyles`: 字体族、字号。
3.  `ColorStyles`: 颜色模式（深色/浅色）、背景纹理。
4.  `TranslationStyles`: 翻译对照文本的显隐控制。
5.  **`UserStylesheet`**: **最后拼接**。

**关键点**: 因为 `UserStylesheet` 是最后拼接的，根据 CSS 优先级规则（同权重下后定义生效），用户书写的样式可以轻松覆盖系统生成的默认样式。

## 3. 用户界面 (`MiscPanel.tsx`)

在“其他设置”面板中提供了一个简易的代码编辑器：

- **实时预览**: 虽然代码是文本框输入，但通过 React 状态绑定，修改可能会即时反映（取决于 `saveViewSettings` 的防抖策略，代码中是 `setDraftContentStylesheet` 本地状态暂存）。
- **非 ASCII 支持**: 必须确保 CSS 中的非 ASCII 字符（如中文字体名 `"霞鹜文楷"`）在存储和传输过程中不乱码。Readest 的存储层（Supabase/IndexedDB）均基于 UTF-8，因此原生支持。

## 4. 常见用例

用户通常使用此功能来：

- 修改特定 HTML 标签的样式（如 `h1 { color: red; }`）。
- 微调图片显示（`img { max-width: 80%; }`）。
- 隐藏不需要的元素（如某些广告页或版权页）。
- 使用高级 CSS 特性（如 `text-shadow`）。

## 5. 安全性暗示 (Sanitization)

目前直接注入用户提供的 CSS 字符串。虽然 CSS 相对安全，但如果是从不可信来源导入的配置（如分享的配置字符串），理论上存在利用 CSS Exfiltration 攻击的风险（极低）。系统目前假定用户对其输入的 CSS 负责。
