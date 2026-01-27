# 文档解析分析 (Document Parser Analysis)

`src/libs/document.ts` 是 Readest 电子书处理的核心，承载了所有格式解析、元数据提取和渲染模型构建的逻辑。它采用 **外观模式 (Facade)**，为上层 UI 提供了一个统一的 `BookDoc` 接口，屏蔽了底层不同格式（EPUB, PDF, MOBI 等）的差异。

## 1. 核心架构与依赖

### 主要依赖

- **`foliate-js`**: 核心解析引擎。Readest 很大程度上复用了 Foliate 的解析逻辑 (epub, pdf, mobi, comic-book, fb2)。
- **`@zip.js/zip.js`**: 用于解压 EPUB/CBZ/FBZ 等基于 ZIP 的格式。
- **`js-md5`**: 计算文件哈希（虽在此文件中未直接显式调用，但在生态中用于唯一标识）。
- **`fflate`**: 用于 MOBI 格式的解压（作为 foliates.js 的依赖注入）。

### 数据模型

- **`BookDoc`**: 统一的书籍对象模型。
  - `metadata`: 标准化的元数据（标题、作者、封面等）。
  - `toc`: 树状目录结构。
  - `sections`: 线性化的内容分片（用于阅读进度计算）。
  - `getCover()`: 异步获取封面 Blob。
- **`DocumentLoader`**: 针对不同文件类型的加载适配器。

## 2. 解析流程详解

`DocumentLoader.open()` 是入口函数，根据文件签名（Magic Bytes）或扩展名决定解析策略。

### A. ZIP 容器 (EPUB, CBZ, FBZ)

1.  **检测**: 读取文件前 4 字节，检查是否为 `50 4B 03 04` (PK..)。
2.  **加载器**: `makeZipLoader()` 使用 `@zip.js/zip.js` 创建一个虚拟文件系统。
    - _优化_: 定义了 `loadText` 和 `loadBlob` 辅助函数，按需解压文件内容，避免一次性加载整个压缩包到内存。
3.  **分发**:
    - **CBZ (Comic Book)**: 调用 `foliate-js/comic-book.js`。
    - **FBZ (Zipped FB2)**: 查找 `.fb2` 文件，解压后作为 XML 处理。
    - **EPUB**: 标准流程，调用 `foliate-js/epub.js`。

### B. PDF

1.  **检测**: 检查 `%PDF-` 签名。
2.  **处理**: 调用 `foliate-js/pdf.js`。PDF 处理通常依赖 PDF.js（在 foliate 内部），这是一个纯 Web 实现。

### C. MOBI / AZW / AZW3

1.  **检测**: 使用 `foliate-js/mobi.js` 的 `isMOBI` 检查。
2.  **解压**: 注入 `fflate.unzlibSync` 进行解压。
3.  **模型**: 创建 `MOBI` 实例。Readest 区分了 `MOBI` (老格式), `AZW`, `AZW3` (KF8) 以便于后续可能的特殊处理。

### D. FB2 (FictionBook)

1.  **检测**: XML MIME 类型或文件扩展名。
2.  **处理**: 直接解析 XML 结构。

## 3. 关键实现细节

### 文件类型推断

文件不仅通过扩展名识别，还实现了基于内容的嗅探 (`isZip`, `isPDF`)。这提高了对被错误命名文件的鲁棒性。

```typescript
// 二进制嗅探示例
private async isZip(): Promise<boolean> {
  const arr = new Uint8Array(await this.file.slice(0, 4).arrayBuffer());
  return arr[0] === 0x50 && arr[1] === 0x4b && arr[2] === 0x03 && arr[3] === 0x04;
}
```

### MIME 类型映射

维护了 `MIMETYPES` 和 `EXTS` 两个常量对象，用于在浏览器上下文和后端存储之间进行 MIME 类型与扩展名的双向转换。

## 4. Svelte 迁移指南

此模块是**纯逻辑且框架无关**的，迁移到 Svelte 非常直接。

### 推荐策略

1.  **保持现状**: 该文件几乎不需要修改即可在 SvelteKit 项目中运行。
2.  **Client-Side Utility**: 由于依赖 `File` 和 `Blob` 对象，它应作为客户端工具库 (`src/lib/utils/document.ts`).
3.  **Web Worker 集成 (深层优化)**:
    - 解析大文件（尤其是计算 MD5 和解压大型 EPUB）是 CPU 密集型的。
    - **Svelte 建议**: 将 `DocumentLoader` 的实例化和 `open()` 调用移至 **Shared Web Worker**。
    - 使用 Comlink 或原生 `postMessage` 传递解析后的轻量级元数据，将繁重的 Blob 处理保留在 Worker 中。

### 示例: Svelte Store 集成

```typescript
// src/lib/stores/bookParser.ts
import { writable } from 'svelte/store';
import { DocumentLoader } from '$lib/utils/document';

export const parseStatus = writable({ loading: false, error: null });

export async function parseBook(file: File) {
  parseStatus.set({ loading: true, error: null });
  try {
    const loader = new DocumentLoader(file);
    const { book, format } = await loader.open();
    // ... 处理书籍对象
    return book;
  } catch (e) {
    parseStatus.update((s) => ({ ...s, error: e.message }));
  } finally {
    parseStatus.update((s) => ({ ...s, loading: false }));
  }
}
```
