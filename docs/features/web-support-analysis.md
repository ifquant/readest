# 现代浏览器支持分析

为了让 Readest 脱离 Tauri 容器，直接在现代浏览器（Chrome/Edge/Safari/Firefox）中作为纯 Web 应用运行，需要解决的核心问题是**系统能力的抽象与降级**。

## 1. 架构现状

目前 Readest 已经具备良好的跨平台架构基础：

- **抽象层 (`AppService`)**: 所有涉及文件系统、窗口控制、设备交互的逻辑都封装在 `AppService` 接口中。
- **环境检测 (`environment.ts`)**: 在应用启动时，根据 `NEXT_PUBLIC_APP_PLATFORM` 环境变量或运行时特征，动态决定实例化 `NativeAppService` 还是 `WebAppService`。

## 2. 核心适配点

### 2.1 文件系统 (`WebAppService`)

Web 端无法直接访问用户的本地硬盘（出于安全沙箱限制）。

- **存储方案**: 现有的 `webAppService.ts` 已经实现了一套基于 **IndexedDB** 的虚拟文件系统 (`indexedDBFileSystem`)。
  - 书籍、封面、配置等所有数据都作为 `Blob` 存储在 IndexedDB 的 `files` 对象仓库中。
  - **路径映射**: 同样支持虚拟的 `/Readest/Books`, `/Readest/Data` 等路径结构。
- **限制**:
  - **容量限制**: 浏览器通常会对 IndexedDB 存储配额进行限制（通常是可用磁盘空间的 50%-80%）。
  - **性能**: 大文件（如几百MB的 PDF）读写性能不如原生文件系统，可能需要流式优化。

### 2.2 文件导入与导出

- **导入 (`openFile`)**: 必须通过 `<input type="file">` 或拖拽 API 获取 `File` 对象。无法像桌面端那样拥有 `selectDirectory` 能力来批量扫描文件夹。
- **导出 (`saveFile`)**: 无法“保存到原位置”。Web 端只能通过生成 Blob URL 并触发 `<a>` 标签下载，由浏览器接管下载行为，通常只能保存到用户的“下载”目录。

### 2.3 窗口与系统集成

Web 应用运行在浏览器标签页中，失去了对操作系统窗口的控制权。

- **多窗口**: 原生应用支持“新窗口打开书籍”，Web 端通常需降级为“单页应用 (SPA) 路由跳转”或使用 `window.open` (体验较差)。
- **系统菜单**: 无法定制 macOS 菜单栏。
- **右键菜单**: 浏览器的原生右键菜单会干扰应用交互，需要完全自定义上下文菜单（目前已有部分实现）。
- **Auto Update**: Web 应用更新依赖于服务器重新部署和 Service Worker 缓存更新，不需要 Tauri 的 Updater 插件。

## 3. 部署与构建

### 3.1 环境变量

构建 Web 版本时，必须设置环境变量：

```bash
NEXT_PUBLIC_APP_PLATFORM=web
NEXT_PUBLIC_API_BASE_URL=https://api.readest.com # 指向真实的后端 API
```

### 3.2 跨域 (CORS) 与 API

如果 Web 版直接请求第三方 API（如翻译、TTS、百科），会面临跨域限制。

- **解决方案**: 需要由 Readest 的 Next.js 后端 (`/api/*`) 进行代理转发，而不是在前端直接发起请求。
- **Cloud Sync**: 同步功能依赖 Supabase，Web 端通过 HTTPS 与 Supabase 通信，通常配置好 CORS 即可正常工作。

### 3.3 PWA 支持

为了接近原生体验，建议配置 PWA (Progressive Web App)：

- **Manifest**: 既然有了 `manifest.json`，可以允许用户“安装”到桌面。
- **Service Worker**: 实现离线加载，确保无网状态下也能打开已缓存的书籍。
- **File Handling API**: 高级 PWA 特性允许注册文件关联（如直接打开 .epub），但这目前仅在部分 Chromium 浏览器支持。

## 4. 缺失功能清单

在纯 Web 模式下，以下功能可能不可用或受限：

1.  **本地文件夹监控**: 无法自动扫描用户特定目录下的新书。
2.  **全局快捷键**: 无法在浏览器失焦时响应媒体键（翻页）。
3.  **高级系统集成**: 如 macOS 的各种系统级认证、Touch Bar 支持等。
4.  **KOSync Server Discovery**: Web 端无法进行 UDP 广播/组播发现局域网内的 KOReader 设备，必须手动输入 IP。
