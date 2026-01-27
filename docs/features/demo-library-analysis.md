# 内置 Demo 书库功能分析

为了让新用户快速上手体验 Readest 的功能，系统内置了演示书库 (Demo Library)。该功能确保用户在首次打开应用时，书架不是空的，而是包含了几本精选的无版权/公版电子书。

## 1. 数据源 (`library.xx.json`)

演示书籍列表存储在 JSON 配置文件中，并根据用户语言环境进行分发：

- `src/data/demo/library.en.json`: 英文环境默认书单（通常包含 Standard Ebooks 的精排书籍，如 _Alice's Adventures in Wonderland_）。
- `src/data/demo/library.zh.json`: 中文环境默认书单（包含中文公版书或字体测试用书）。

## 2. 加载逻辑 (`useDemoBooks.ts`)

### 2.1 触发机制

`useDemoBooks` Hook 负责演示书籍的加载。

- **一次性锁**: 使用 `localStorage.getItem('demoBooksFetched')` 检查标记。该操作设计为**只执行一次**，避免每次刷新页面都重复导入。
- **平台检测**: 在 Web 端 (`isWebAppPlatform()`)，该逻辑尤为重要，因为 Web 端没有预置文件，必须通过网络下载。

### 2.2 导入流程

1.  **确定语言**: 通过 `getUserLang()` 获取界面语言，选择对应的 JSON 书单。
2.  **批量导入**: 遍历 `library` 数组中的 URL，并行调用 `appService.importBook(url, [], false, true)`。
    - `isDemo = true` (第四个参数): 标记这些书为演示书籍。底层可能会对演示书籍做特殊处理（例如不计入某些统计，或者在清理缓存时优先保留/删除）。
3.  **状态更新**: 导入完成后，更新 `demoBooksFetched` 标记为 `true`。

## 3. Web 端特殊性

不同于桌面端可能直接打包了本地 EPUB 文件，Web 端的演示书籍通常是 **Remote URL**。

- `appService.importBook` 需要处理跨域下载，或者直接将 URL 注册为书籍地址（如果是流式读取）。
- 目前逻辑看来是直接下载并存储到 IndexedDB 中。

## 4. 扩展性

要添加新的演示书籍，只需修改对应的 JSON 文件。这为后续运营“精选书单”或“每周推荐”留下了接口。
