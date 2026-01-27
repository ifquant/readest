# 组件分析: LangPanel

## 1. 组件概述

`LangPanel` 处理：

- **UI 语言**：应用程序界面的本地化。
- **翻译**：选择翻译提供商（Google, DeepL 等）和目标语言。
- **TTS**：配置朗读内容（源文本 vs 翻译文本）。
- **CJK 特定**：中文繁简转换。

## 2. 代码分析

### 逻辑

- **提供商过滤**：检查提供商是否需要认证 (`authRequired`) 或超出配额。在下拉菜单标签中显示状态。
- **重新渲染**：更改 `translationEnabled` 会触发 `recreateViewer`，因为翻译钩子挂钩到了核心渲染器逻辑中。

## 3. Svelte 迁移指南

### Svelte 实现

直接的表单绑定。

```svelte
<script lang="ts">
  import Select from '../Select.svelte';
  // ...
</script>

<div class="config-item">
   <span>界面语言</span>
   <Select bind:value={uiLanguage} options={langOptions} />
</div>

{#if isCJK}
   <div class="config-item">
      <span>繁简转换</span>
      <Select bind:value={convertMode} options={...} />
   </div>
{/if}
```
