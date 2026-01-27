# 翻译服务详解 (Translation Service)

`src/services/translators` 实现了多源翻译与高性能缓存机制。

## 1. 缓存架构 (`cache.ts`)

为了节省配额和提高响应速度，系统实现了 **双层缓存机制 (Dual-Layer Cache)**。

- **Layer 1: Memory Cache**: JavaScript 对象 (`memoryCache`)。读写速度最快，页面刷新丢失。
- **Layer 2: IndexedDB**: 浏览器本地数据库 (`TranslationCache`)。持久化存储，支持海量数据。

### 数据流

1.  请求翻译时，先查 Memory Cache。
2.  若未命中，查 IndexedDB，命中后回填 Memory Cache。
3.  若仍未命中，调用 Provider API，结果写入 Memory + IndexedDB。

### 缓存维护

- **初始化预加载**: 应用启动时 (`initCache`)，自动从 IndexedDB 加载最近使用的数据到内存 (`preloadOptions`)。
- **自动清理 (Pruning)**: 定时任务检测过期 (`maxAge`) 或超量 (`maxEntries`, `maxSizeInBytes`) 数据，并在空闲时清理，防止数据库无限膨胀。

## 2. 翻译管道

`index.ts` 导出服务接口。

- **Preprocess**: 清理换行符、合并断句，优化翻译质量。
- **Polish**: 对翻译结果进行后处理（如移除多余空格，修复标点）。

## 3. Svelte 迁移指南

### Service Worker Caching

IndexedDB 也可以在 Service Worker 中访问。迁移后，建议将整个翻译请求拦截逻辑移至 Service Worker。
这样，即使用户离线，只要缓存中有记录，依然可以“翻译”已读过的段落。

### Svelte Store 集成

当前缓存是基于 Promise 的命令式 API。
可以封装一个 `translationStore`，提供响应式状态：

```typescript
const { translation, loading, error } = translationStore.translate(text);
```
