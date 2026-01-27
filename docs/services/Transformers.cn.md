# 文本处理管道详解 (Transformers Service)

`src/services/transformers` 实现了一个可插拔的文本处理管道，用于在渲染前动态修改 EPUB/HTML 内容。主要用于繁简转换、校对替换、样是注入等。

## 1. 管道架构

- **Pipeline**: `index.ts` 导出了 `availableTransformers` 数组。
- **Execution**: 只有被启用的 Transformer 才会执行。执行顺序由数组顺序决定 (Punctuation -> Footnote -> Language ... -> Proofread)。
- **Context**: 每个 Transformer 接收 `TransformContext`，包含原始内容、视图设置、书籍元数据等。
- **Wrapper**: `src/services/transformService.ts` 提供了 `transformContent` 函数，它是外部调用的唯一入口，负责按顺序应用所有启用的 Transformer。

## 2. 核心 Transformer

### Proofread Transformer (`proofread.ts`)

最复杂的 Transformer，用于基于规则的文本替换（"正则搜索替换"）。

- **范围控制**: 支持 `selection` (仅当前段落)、`book` (全书)、`library` (全局) 三种作用域。
- **CFI 支持**: 对于 `selection` 范围，利用 `foliate-js/epubcfi` 精确解析并定位 DOM 节点。
- **性能优化**: 使用 `TreeWalker` 只遍历文本节点，避免破坏 HTML 结构。
- **正则规范化**: `normalizePattern` 自动处理单词边界 (`\b`) 和 Unicode 标志 (`u`)，特别是处理 CJK 字符的边界问题（CJK 通常不需要 `\b`）。

### 其它

- **SimpleCC**: 基于查表的简繁转换。
- **Sanitizer**: 清理不安全的 HTML 标签 (script, iframe)。
- **Footnote**: 将特定的链接转换为弹窗注脚格式。

## 3. Svelte 迁移指南

### Web Worker 迁移

目前的 Transformer 均在主线程运行。对于大章节或复杂的正则替换 (`proofread.ts`)，可能会阻塞 UI。
建议利用 SvelteKit 的 Worker 支持，将管道移至 Web Worker。

**架构建议**:

1.  创建一个通用 Worker: `src/lib/workers/transformer.worker.ts`。
2.  主线程发送 `content` 和 `config`，Worker 返回处理后的 HTML 字符串。
3.  对于 `proofread` 的 DOM 操作，Worker 中可使用 `jsdom` 或 `linkedom` (轻量级) 来模拟 DOM 环境，或者纯字符串处理（难度较大）。_注: 目前代码强依赖 DOMParser，因此必须在 Worker 中 polyfill DOM 环境或保持在主线程但使用 Time Slicing。_
