# 组件分析: ColorPanel

## 1. 组件概述

`ColorPanel` 管理视觉主题。

- **主题**：浅色、深色、护眼模式（Sepia）和自定义主题（用户定义的调色板）。
- **背景**：纯色或纹理图片。
- **高亮**：用于标注的自定义颜色。
- **语法高亮**：用于技术书籍中的代码块。

## 2. 代码分析

### 逻辑

- **子编辑器**：使用 `ThemeEditor`, `BackgroundTextureSelector`, `HighlightColorsEditor` 作为子组件，以保持主文件易于管理。
- **纹理引擎**：使用 `useCustomTextureStore` 加载图像图案。
- **实时预览**：通过 CSS 变量应用更改到 `document.documentElement`，确保整个应用即时反馈。

## 3. Svelte 迁移指南

### Svelte 实现

```svelte
<script lang="ts">
  import ThemeModeSelector from './color/ThemeModeSelector.svelte';
  import ThemeColorSelector from './color/ThemeColorSelector.svelte';
  import BackgroundTextureSelector from './color/BackgroundTextureSelector.svelte';

  // ... state ...
</script>

{#if showThemeEditor}
  <ThemeEditor bind:theme={editingTheme} onSave={...} />
{:else}
  <ThemeModeSelector bind:mode={themeMode} />

  <ThemeColorSelector bind:color={themeColor} themes={allThemes} />

  <BackgroundTextureSelector
     bind:textureId={selectedTexture}
     bind:opacity={bgOpacity}
  />
{/if}
```
