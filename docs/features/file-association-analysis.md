# 文件关联与打开机制分析 (File Associations)

Readest 支持通过操作系统的“打开方式”直接打开电子书文件（如双击 .epub 文件）。这一功能涉及 **Tauri 配置**、**Rust 后端事件捕获** 以及 **前端路由处理** 的跨层协作。

## 1. 注册关联 (Tauri Configuration)

在 `src-tauri/tauri.conf.json` 的 `bundle.fileAssociations` 字段中定义了应用支持的文件类型。这会告诉操作系统（Windows 注册表、macOS Info.plist、Linux Desktop Entry）将特定扩展名与 Readest 绑定。

支持的格式包括：`epub`, `mobi`, `azw3`, `fb2`, `cbz`, `pdf` 等。

## 2. 后端捕获 (Rust Layer)

后端逻辑主要位于 `src-tauri/src/lib.rs`，负责接收操作系统传递的文件路径，并将其安全地传递给前端。

### 2.1 启动时打开 (Cold Start)

当应用未运行且通过文件启动时，文件路径作为命令行参数传递。

1.  **解析参数**: `get_files_from_argv` 从 `std::env::args()` 中提取文件路径。
2.  **权限授权**: `allow_file_in_scopes` 将这些路径加入 Tauri 的安全白名单 (`fs_scope` 和 `asset_protocol_scope`)，允许前端读取。
3.  **注入变量**: 等待 `window-ready` 事件后，通过 `window.eval` 执行 `window.OPEN_WITH_FILES = ["path/to/file"]`，将路径注入到前端的全局上下文。

### 2.2 运行时打开 (Runtime / Single Instance)

当应用已在运行，用户再次双击文件时：

- **单例模式**: 使用 `tauri-plugin-single-instance` 插件检测到新实例启动。
- **事件转发**: 阻止新窗口创建，并发射 `single-instance` 事件给主窗口，负载包含新的命令行参数（即文件路径）。
- **macOS 特殊处理**: macOS 触发 `RunEvent::Opened` 事件。Readest 捕获此事件，同样执行权限授权和变量注入逻辑。

## 3. 前端处理 (Frontend Layer)

前端通过 Hook 和工具函数监听来源，并触发书籍导入流程。

### 3.1 监听器 (`useOpenWithBooks.ts`)

这个 Hook 在应用启动时运行，建立多源监听：

- **`single-instance`**: 监听来自 Windows/Linux 的运行时文件打开请求。
- **`open-files`**: 监听 macOS 的特定事件。
- **`native-bridge:shared-intent`**: 监听 Android 的“分享到 Readest”意图。
- **Deep Link**: 监听 iOS 的 URL Scheme 打开请求。

### 3.2 下发与导入

当捕获到文件路径后（`handleOpenWithFileUrl`）：

1.  **设置全局变量**: 更新 `window.OPEN_WITH_FILES`。
2.  **触发重载**: 设置 `checkOpenWithBooks` 状态，并强制导航到 `/library` 页面 (`navigateToLibrary`)。

### 3.3 库页面逻辑 (`openWith.ts`)

在 Library 页面加载时，`parseOpenWithFiles` 统一检查：

1.  `window.OPEN_WITH_FILES` (主要来源)
2.  CLI 参数 (次要来源)
3.  Deep Link 意图 (移动端)

一旦发现待处理的文件，Library 组件会自动调用 `importBook` 服务将文件导入数据库并打开阅读器。
