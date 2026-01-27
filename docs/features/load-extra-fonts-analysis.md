# 额外字体加载机制分析

Readest 提供了强大的字体自定义能力，不仅内置了精心挑选的系统/在线字体，还允许用户加载本地的自定义字体，以满足不同语言（特别是 CJK 竖排）和审美需求。

## 1. 内置/在线字体 (`mountAdditionalFonts`)

在阅读器初始化时（`FoliateViewer`, `Reader` 组件挂载时），系统会调用 `src/styles/fonts.ts` 中的 `mountAdditionalFonts`。

### 1.1 策略

- **按需加载**: 字体被分为 "Basic"（西文为主）和 "CJK"（中日韩）。仅当书籍元数据表明是 CJK 语言或运行在 CJK 环境下时，才会加载庞大的中文字体库。
- **CDN 加速**:
  - Google Fonts: 用于 Roboto, Merriweather 等西文字体。
  - Mirror/CDN: 对于 CJK 字体（如霞鹜文楷、思源宋体），由于体积巨大，使用了 `jsdelivr`、`unpkg` 或特定的镜像加速服务 (`ik.imagekit.io`)，并配合 `font-display: swap` 优化加载体验。
- **Resource Hints**: 动态插入 `<link rel="preconnect">` 和 `<link rel="dns-prefetch">` 到 `<head>`，加速字体服务器的 DNS 解析和连接建立。

## 2. 自定义字体系统 (`CustomFontStore`)

用户可以上传自己的 `.ttf`, `.otf`, `.woff`, `.woff2` 字体文件。

### 2.1 存储与管理 (`useCustomFontStore`)

- **文件位置**: 字体文件物理存储在应用数据目录的 `Readest/Fonts` 子目录下。
- **元数据**: 字体信息（ID, 名称, 路径, 粗细, 样式）保存在全局 `Settings.json` 的 `customFonts` 字段中。
- **状态管理**: Zustand store 维护了运行时状态，包括 `blobUrl`（已加载的 Blob 地址）、`loaded`（加载状态）、`error`（错误信息）。

### 2.2 加载流程 (`loadFont`)

由于浏览器安全限制（尤其是 Web 版或沙箱环境），无法直接通过 `file://` 协议引用本地字体文件。

1.  **读取文件**: 通过 `AppService.openFile`读取字体文件的二进制内容 (`ArrayBuffer`)。
2.  **创建 Blob**: 将二进制数据封装为 `Blob` 对象，指定正确的 MIME 类型（如 `font/ttf`）。
3.  **生成 URL**: 使用 `URL.createObjectURL(blob)` 生成一个临时的 `blob:` 协议 URL。
4.  **保存状态**: 将此 `blobUrl` 更新到 Store 中。

### 2.3 注入与应用 (`mountCustomFont`)

当阅读器（iframe）准备好或字体加载完毕时：

1.  **构建 CSS**: `createFontCSS` 函数生成 `@font-face` 规则。
    ```css
    @font-face {
      font-family: 'MyCustomFont';
      src: url('blob:https://readest.app/...');
      font-display: swap;
    }
    ```
2.  **动态插入**: 在目标 `document`（阅读器的 iframe 文档）的 `<head>` 中创建或更新 `<style id="custom-font-{id}">` 标签。
3.  **应用**: 用户在“字体设置”面板选择该字体后，阅读器引擎会将 `font-family` 设置为该自定义字体的名称。

## 3. 生命周期管理

- **内存释放**: 为了防止内存泄漏，当字体被移除、应用卸载或窗口关闭 (`beforeunload`) 时，系统会调用 `URL.revokeObjectURL(blobUrl)` 销毁占用的 Blob 内存。
- **跨上下文**: 字体不仅注入到主阅读视图，还会注入到**脚注弹窗** (`FootnotePopup`) 的 iframe 中，确保弹窗内的文字风格与正文一致。
