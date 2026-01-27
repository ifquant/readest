# 组件分析: CustomFonts

## 1. 组件概述

`CustomFonts` 是用户上传字体文件（`.ttf`, `.otf` 等）的管理界面。

- **操作**：导入（文件选择器），删除。
- **显示**：已安装字体家族的网格。

## 2. 代码分析

### 逻辑

- **导入流程**：使用 `appService.importFont` (bridge) -> 解析元数据 -> 添加到 `customFontStore` -> 加载 font face 到 DOM (`mountCustomFont`)。
- **分组**：将单个字体文件（常规、粗体、斜体）分组为 Family 进显示。

## 3. Svelte 迁移指南

### Svelte 实现

```svelte
<script lang="ts">
   import { customFontStore } from '$lib/stores/fonts';

   // ...
   function handleImport() {
       // ... service call
       customFontStore.add(newFont);
   }
</script>

<div class="grid ...">
   <button onclick={handleImport}>导入</button>

   {#each $customFontStore.families as family}
      <div class="card ...">
         {family.name}
         {#if isDeleteMode}
            <button onclick={() => deleteFamily(family)}>X</button>
         {/if}
      </div>
   {/each}
</div>
```
