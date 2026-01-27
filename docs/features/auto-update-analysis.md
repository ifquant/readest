# 自动更新机制分析 (Auto Update)

Readest 的自动更新功能旨在确保用户能够及时获取最新的功能和修复。由于 Readest 支持多平台（Desktop, Android），其更新机制也针对不同平台进行了适配。

## 1. 桌面端 (Desktop: macOS / Windows / Linux)

桌面端的更新依赖于 **Tauri 官方更新插件** (`@tauri-apps/plugin-updater`)。

### 1.1 配置 (`tauri.conf.json`)

Tauri 的配置中定义了更新服务器的 Public Key 和 Endpoint。

```json
"updater": {
  "pubkey": "...", // Minisign 公钥，用于验证更新包签名
  "endpoints": [
    "https://download.readest.com/releases/latest.json",
    "https://github.com/readest/readest/releases/latest/download/latest.json"
  ]
}
```

### 1.2 检查流程 (`helpers/updater.ts`)

- **调用**: `check()` 函数由 Tauri 插件提供。
- **逻辑**: 它会自动请求上述 Endpoint，对比本地版本号。
- **弹窗**: 如果发现新版本，调用 `showUpdateWindow(update.version)`，创建一个新的 Tauri Webview 窗口 (`ValidatorWindow`)，加载 `/updater` 路由。

## 2. 安卓端 (Android)

由于 Tauri 目前的 Updater 插件对移动端支持有限（或 Readest 选择自定义实现），Android 端采用了一套**自定义的更新检查机制**。

### 2.1 检查流程

- **请求**: `helpers/updater.ts` 中的 `checkForAppUpdates` 会手动 fetch 一个 JSON 文件 (`READEST_UPDATER_FILE`)。
- **比较**: 使用 `semver` 库比较远程版本与本地 `getAppVersion()`。
- **弹窗**: 如果发现更新，调用 `setUpdaterWindowVisible`，在**当前窗口**内显示一个模态对话框（Dialog），而不是新开窗口。

## 3. 更新 UI (`UpdaterWindow.tsx`)

`/updater` 路由或模态框最终都渲染 `UpdaterContent` 组件。

### 3.1 核心功能

- **显示变更日志 (Changelog)**:
  - 从服务器拉取 `changelog.json`。
  - **自动翻译**: 如果用户语言不是英语，会调用翻译服务 (`useTranslator`) 将更新日志实时翻译成用户语言。
- **下载与安装**:
  - **桌面端**: 委托给 `update.downloadAndInstall()`，由 Tauri 处理下载、校验签名和替换二进制文件。
  - **Android 端**:
    1.  根据架构 (`arm64` vs `universal`) 构造下载 URL。
    2.  调用 `tauriDownload` 下载 APK 到缓存目录。
    3.  使用 `installPackage` (Native Bridge) 触发系统的 APK 安装流程。

## 4. 触发时机

- **自动检查**:
  - 应用启动时触发。
  - 设有防抖/间隔机制 (`CHECK_UPDATE_INTERVAL_SEC`)，避免频繁请求，默认会检查 `lastAppUpdateCheck` 本地存储键值。
- **显示新功能提示**:
  - 如果当前版本比 `lastShownReleaseNotesVersion` 新（意味着刚更新完），会自动弹出“What's New”窗口，展示本次更新的日志。
