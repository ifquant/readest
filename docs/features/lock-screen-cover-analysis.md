# 安卓锁屏封面同步分析

Readest 针对开放式安卓电子墨水屏设备（如 Boox, Hisense, Bigme 等）提供了一个特色功能：自动将当前阅读的书籍封面设置为锁屏壁纸。

## 1. 原理

由于 Readest 是一个普通 App，无法直接修改安卓系统的锁屏配置（需要 Root 或特定 API）。因此，该功能采用了一种**“文件借用”**的策略：

1.  用户在系统设置中，将锁屏壁纸设置为某一个固定的图片路径（例如 `/storage/emulated/0/Readest/Images/last-book-cover.png`）。
2.  Readest 在后台自动将**当前最近打开的书籍**封面复制并覆盖到该路径。
3.  下次锁屏时，系统读取该文件，自然就显示了新书的封面。

## 2. 实现机制 (`useBookCoverAutoSave`)

- **触发时机**: 当用户打开任意一本书籍时，挂载 `useBookCoverAutoSave` 钩子。
- **去重检查**: 比较 `settings.savedBookCoverForLockScreen` (记录的最后一次 Hash) 与当前 `book.hash`。如果相同，说明封面已是最新，跳过操作，节省 I/O。
- **文件操作**:
  1.  定位当前书籍的缓存封面 (`appService.resolveFilePath(getCoverFilename(book))`)。
  2.  确定目标路径：默认为 `Images` 目录，或用户通过 `SettingsMenu` 指定的外部目录（为了适配某些只能读取特定文件夹做壁纸的系统）。
  3.  执行 `appService.copyFile` 覆盖 `last-book-cover.png`。
- **延迟执行**: 使用 `setTimeout` (5000ms) 和 `throttle` 防抖，通过让出启动时的 CPU 资源，避免影响阅读器首屏加载速度。

## 3. 适用范围

- **平台限制**: 仅在 `isAndroidApp` 且非 `playstore` 渠道包中开启。Google Play 政策通常不允许应用未经明确交互频繁修改外部存储中的可共享文件，且大部分普通安卓手机用户不需要此功能。
- **权限**: 需要 `Storage` 读写权限。
