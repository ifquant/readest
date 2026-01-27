# 平台实现细节 (Platform Implementations)

本文档深入剖析 `NativeAppService` (Tauri) 与 `WebAppService` (Browser) 的底层实现差异。这对于理解 Readest 如何跨平台运行以及 Svelte 迁移时的架构决策至关重要。

## 1. NativeAppService (Tauri)

### 文件系统策略

为了支持 "Portable Mode" (便携版) 和 "Custom Root Directory" (自定义数据目录)，Native 端实现了一个复杂的 **路径解析器 (Path Resolver)**。

- **getPathResolver**: 高阶函数，根据当前环境（是否 Portable，是否有自定义根目录）返回一个 `resolvePath` 函数。
- **BaseDir 枚举**: 将 `AppData`, `Books`, `Fonts` 等逻辑路径映射到物理路径。
  - _Portable Mode_: 映射到可执行文件所在目录 (`execDir`)。
  - _Custom Mode_: 映射到用户选定的任何目录。
  - _Default_: 映射到 OS 标准路径 (`appDataDir`, `appConfigDir`)。

### IO 实现 (`nativeFileSystem`)

封装了 Tauri v2 插件：

- `@tauri-apps/plugin-fs`: 核心读写 (`readFile`, `writeFile`, `readDir`)。
- `@tauri-apps/plugin-dialog`: 文件选择 (`open`, `save`)。
- `@tauri-apps/plugin-os`: 操作系统检测。

### 特殊处理

- **Content URI**: Android 上处理 `content://` 协议（如来自 Google Drive 的文件），需要通过 `copyURIToPath` 桥接方法复制到临时目录才能读取。
- **Security Scoped Resources**: iOS 上访问 `file://` 也可能受限，同样需要拷贝。

## 2. WebAppService (Browser)

### 文件系统模拟 (`indexedDBFileSystem`)

浏览器没有直接访问用户文件系统的权限（除非使用 File System Access API，且兼容性有限）。Readest 使用 **IndexedDB** 模拟了一个简单的 Key-Value 文件系统。

- **Store**: `files` ObjectStore。
- **Key**: 完整虚拟路径 (e.g. `Readest/Books/mybook.epub`).
- **Value**: `{ path: string, content: ArrayBuffer | string }`.

### IO 限制

- **readFile/writeFile**: 全部是对 IndexedDB 的 `get`/`put` 操作。
- **selectDirectory**: **不支持**。Web 端无法获取文件夹句柄。
- **saveFile**: 使用 `URL.createObjectURL` + `<a>` 标签点击模拟下载。

## 3. Svelte 迁移指南

### 架构分层

在 SvelteKit 中，建议将这部分逻辑进一步分离：

1.  **Repository Layer**: 定义 `IFileSystem` 接口。
2.  **Adapters**:
    - `TauriFileSystem`: 位于 `src/lib/platform/tauri/fs.ts`。
    - `IndexedDBFileSystem`: 位于 `src/lib/platform/web/fs.ts`。
3.  **Dependency Injection**: 在 `AppService` 初始化时注入具体的 FileSystem Adapter。

### Path Resolver 优化

目前的 `getPathResolver` 逻辑有些过度耦合（闭包层层嵌套）。
建议使用 **类 (Class)** 来管理路径状态：

```typescript
class PathResolver {
  constructor(
    private rootPath: string | null,
    private isPortable: boolean,
  ) {}

  resolve(path: string, base: BaseDir): string {
    // ... 清晰的 switch-case 逻辑
  }
}
```

### Web 端性能

IndexedDB 读写大文件（如 100MB+ PDF）可能会阻塞主线程（尽管 IDB 是异步的，但序列化/反序列化消耗 CPU）。
建议将 Web 端的文件系统操作移至 **Web Worker**，通过 `Comlink` 或 `postMessage` 通信。
