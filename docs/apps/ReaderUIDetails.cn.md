# 阅读器 UI 细节分析 (Reader UI Details)

本文档补充分析阅读器界面中交互最复杂的三个组件：**View Menu** (视图菜单), **Search Bar** (搜索栏), **TOC View** (目录视图)。

## 1. 视图菜单 (`ViewMenu.tsx`)

这是用户定制阅读体验的核心入口，位于顶部栏右侧。

### 1.1 状态同步

UI 状态直接绑定到 `ReaderStore` 和 `ViewSettings`。

- **Zoom Mode**: 支持 `fit-page` (适应页面) 和 `fit-width` (适应宽度)。
- **Spread Mode**: `none` (单页), `auto` (双页)。
- **Scroll Mode**: 切换垂直滚动/水平翻页，这会触发 `flow` 属性的变化 (`scrolled` vs `paginated`)。

### 1.2 "Zen Mode"

全屏模式 (`tauriHandleToggleFullScreen`) 的触发点也在这里。

---

## 2. 全文搜索 (`sidebar/SearchBar.tsx`)

Readest 实现了基于各种格式 (Epub/PDF) 的全文搜索，并做了深度的性能优化。

### 2.1 缓存机制

为了避免重复搜索大文件带来的卡顿，搜索结果会被持久化。

- **Key 生成**: `md5(searchTerm + JSON(config))`。
- **存储位置**: `${SEARCH_CACHE_DIR}/${bookHash}/...json`。
- **流程**: 用户输入 -> 计算 Hash -> 检查本地文件 -> 有缓存则直接加载 -> 无缓存则调用 `view.search()` 生成器。

### 2.2 防抖与历史

- `debounce(500ms)` 防止输入时频繁触发。
- `localStorage` 记录最近 10 条搜索历史。
- **CJK 优化**: 对中文/日文/韩文，允许单字搜索 (`MINIMUM_SEARCH_TERM_LENGTH_CJK = 1`)，而英文限制为 2 字符。

---

## 3. 智能目录 (`sidebar/TOCView.tsx`)

### 3.1 虚拟化策略

针对包含数千章节的巨型书籍（如技术文档或合集），组件会自动切换渲染模式：

- **Sections > 256**: 使用 `react-window` (`FixedSizeList`) 进行虚拟滚动，只渲染视口内的 DOM。
- **Sections <= 256**: 使用普通 `div` 渲染，以获得更好的原生滚动体验。

### 3.2 交互优化

- **Auto Scroll**: 阅读进度变化时，目录会自动滚动到当前章节并高亮。
- **Interaction Cooldown**: 这是一个精妙的细节。
  用户手动滚动目录时，设置一个 10秒 的 "冷却时间" (`interactionCooldownMs`)，在此期间**禁用自动滚动**。这防止了用户在浏览目录时被阅读器进度的自动同步强行拉回当前章节，解决了极其恼人的体验问题。

---

## 4. Svelte 迁移指南

### 4.1 虚拟列表

Svelte 生态中有 `svelte-virtual-list` 或更现代的 `@tanstack/svelte-virtual`。
鉴于 Svelte 5 的高性能，阈值 (256) 可能可以调高。

### 4.2 搜索生成器

React 中处理 Generator (`for await`) 需要复杂的副作用控制。
Svelte 的 `{#await}` 块或者使用 `rxjs` Observable 来包装搜索流会更优雅。

### 4.3 状态持久化

`ViewMenu` 中有大量的 `useEffect` 用于保存设置 (`saveViewSettings`)。
在 Svelte 中，可以使用 Custom Store (带 `subscribe` 副作用) 来自动持久化：

```typescript
// stores/viewSettings.ts
function createPersistentStore(key, initial) {
  const store = writable(initial);
  store.subscribe((value) => saveToDisk(key, value));
  return store;
}
```

这将消除 90% 的样板代码。
