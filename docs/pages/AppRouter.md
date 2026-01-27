# 核心应用页面 (App Router)

## 1. 根布局 (`src/app/layout.tsx`)

这是应用的骨架。它负责：

- 设置 HTML `lang` 和 `className` (Edge-to-Edge 适配)。
- 定义全局 `<head>` 元数据 (Meta Tags, PWA Manifest)。
- 包裹全局 Provider (`EnvProvider`, `Providers`)。

### Svelte 迁移 (`src/routes/+layout.svelte`)

```svelte
<script>
  import '../app.css'; // Global CSS
  import { onMount } from 'svelte';
  import { initServices } from '@/stores/envStore';

  onMount(() => {
    initServices();
  });
</script>

<svelte:head>
  <title>Readest</title>
  <meta name="application-name" content="Readest" />
  <!-- Other meta tags -->
</svelte:head>

<slot />
```

---

## 2. 书架页面 (`src/app/library/page.tsx`)

**分析**：这是一个“巨型组件”（32KB+），承载了应用的主 Dashboard。

- **功能**：展示图书列表、搜索、过滤、导入图书（Upload）、同步状态展示。
- **状态**：通过 `useLibraryStore` 管理图书数据。
- **交互**：点击图书跳转到 `/reader`。

### Svelte 迁移 (`src/routes/library/+page.svelte`)

建议在迁移时进行拆分：

1.  **`+page.svelte`**: 只作为容器和布局。
2.  **`LibraryGrid.svelte`**: 图书网格展示。
3.  **`LibraryToolbar.svelte`**: 搜索和过滤栏。
4.  **`BookUploader.svelte`**: 处理文件导入逻辑。

数据获取建议放在 `+page.ts` (Client-side load) 或者直接在组件中订阅 `libraryStore`。

---

## 3. 阅读器页面 (`src/app/reader/page.tsx`)

**分析**：核心阅读体验。

- **布局**：通常是全屏模式，隐藏系统 UI。
- **核心组件**：
  - `EpubReader` / `PdfReader`: 实际的渲染引擎（基于 iframe 或 canvas）。
  - `ReaderMenu`: 顶部/底部菜单（字体、进度、目录）。
- **路由参数**：通常需要 `?bookId=xxx`。

### Svelte 迁移 (`src/routes/reader/+page.svelte`)

```svelte
<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import ReaderEngine from './components/ReaderEngine.svelte';

  $: bookId = $page.url.searchParams.get('bookId');
</script>

{#if bookId}
  <ReaderEngine {bookId} />
{:else}
  <p>No book selected</p>
{/if}
```

## Svelte 独有优势

在 React 中，路由切换导致的大组件重挂载是一个性能瓶颈。SvelteKit 的布局系统 (`+layout.svelte`) 允许我们将 `Library` 和 `Reader` 的公共外壳（如果有）提取出来，或者利用 Svelte 极快的组件初始化速度，提供更流畅的页面切换动画。
