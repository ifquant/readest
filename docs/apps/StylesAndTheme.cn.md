# 样式与主题系统 (Styles & Theme)

Readest 采用了 **Tailwind CSS** 结合 **CSS Variables** 的混合样式架构，并实现了一套动态的主题切换系统。

## 1. 全局样式 (`src/styles/globals.css`)

### 1.1 CSS 变量定义

在 `:root` (亮色) 和 `[data-theme='dark']` (暗色) 选择器下定义了语义化的颜色变量：

- `--color-base-100`, `--color-base-200`, `--color-base-300`: 背景色层级。
- `--color-base-content`: 文本色。
- `--color-primary`: 主题色 (Readest Orange)。

### 1.2 Tailwind 配置

Tailwind 被配置为使用这些 CSS 变量，而不是硬编码的颜色值。
这意味着 `bg-base-100` 在切换主题时会自动变色，无需 React 重渲染。

```css
/* 示例 */
.bg-base-100 {
  background-color: var(--color-base-100);
}
```

## 2. 主题系统 (`src/styles/themes.ts`)

为了支持丰富的阅读器自定义，Readest 不仅仅有 Light/Dark 模式，还支持 **预设主题 (Themes)**。

- **数据结构**: `Theme` 对象包含 `backgroundColor`, `color` (text), `isDark` 标志。
- **注入机制**: 参考 `FoliateViewer.tsx`，主题并不通过 CSS 类切换，而是直接修改 Reader 容器的 CSS 属性 (`view.renderer.setStyles`) 或注入 `<style>` 标签。这是为了覆盖电子书内部可能存在的强样式 (User Agent Stylesheet Override)。

## 3. 字体管理 (`src/styles/fonts.ts`)

核心功能是 `mountCustomFont`。
由于电子书在 iframe (Web) 或 Webview (Tauri) 中渲染，宿主页面的 `@font-face` 无法直接生效。
Readest 必须动态构建 `@font-face` 规则并注入到阅读器的 `document.head` 中。

## 4. Svelte 迁移指南

### 4.1 全局 CSS

`globals.css` 可以直接移动到 SvelteKit 的 `src/app.css`，并在 `src/routes/+layout.svelte` 中引入。
Tailwind 配置文件 (`tailwind.config.js`) 可以直接复用。

### 4.2 主题切换

Svelte 的 Reactivity 非常适合处理主题。
可以创建一个 `theme` Store，并在 `+layout.svelte` 中监听：

```svelte
<script>
  import { theme } from '$lib/stores/theme';
  import { onMount } from 'svelte';

  $: {
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', $theme);
    }
  }
</script>
```

### 4.3 字体注入

`fonts.ts` 是纯逻辑，可以直接迁移为工具函数。
建议将其与 `ReaderLogic` 结合，作为 `useReaderAction` 的一部分，在阅读器挂载时自动执行。
