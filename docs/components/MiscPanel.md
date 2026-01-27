# 组件分析: MiscPanel

## 1. 组件概述

`MiscPanel` 为“高级用户”提供注入自定义 CSS 的界面。

- **作用域**：“书籍内容 CSS”（影响电子书 iframe）和“阅读器 UI CSS”（影响应用程序外壳）。

## 2. 代码分析

### 逻辑

- **验证**：使用 `validateCSS` 实用程序（可能使用解析库）在保存前检查语法错误。检查 `isValid`。
- **草稿状态**：在输入时维护本地草稿状态。仅当用户点击“应用”或失去焦点时保存/应用（如果存在自动保存逻辑）。
- **清理**：`formatCSS` 清理输入。

## 3. Svelte 迁移指南

### Svelte 实现

```svelte
<script lang="ts">
   let cssContent = $state('');
   let error = $state<string|null>(null);

   function apply() {
       const res = validateCSS(cssContent);
       if (res.isValid) {
           viewSettings.update(s => ({ ...s, userStylesheet: cssContent }));
           error = null;
       } else {
           error = res.error;
       }
   }
</script>

<div class="config-item-block">
   <span>自定义 CSS</span>
   <textarea bind:value={cssContent} class:error={!!error}></textarea>
   {#if error} <span class="error">{error}</span> {/if}
   <button onclick={apply}>应用</button>
</div>
```
