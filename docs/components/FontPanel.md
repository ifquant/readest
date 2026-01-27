# 组件分析: FontPanel

## 1. 组件概述

`FontPanel` 配置排版：

- **字体家族**：衬线、无衬线、等宽、CJK 特定字体。
- **属性**：大小、字重、最小尺寸。
- **系统字体**：通过 Tauri/Electron bridge 获取原生系统字体。
- **自定义字体**：链接到 `CustomFonts` 子面板管理。

## 2. 代码分析

### 逻辑

- **系统字体加载**：使用 `getSysFontsList` (异步 bridge 调用) 填充下拉菜单。
- **字体映射**：复杂的映射处理，如 `"Serif"` -> CSS `font-family: "Times New Roman", serif`。
- **CJK 处理**：根据正则表达式模式过滤字体，以检测针对中文/日文/韩文优化的字体。

## 3. Svelte 迁移指南

### Svelte 实现

```svelte
<script lang="ts">
  import FontDropdown from './FontDropDown.svelte';
  import NumberInput from './NumberInput.svelte';

  let { bookKey } = $props();
  // ... state ...
</script>

<div class="space-y-6">
  <!-- 启用覆盖 -->
  <div class="config-item">
     <span>覆盖书籍字体</span>
     <input type="checkbox" class="toggle" bind:checked={overrideFont} />
  </div>

  <!-- 大小输入 -->
  <NumberInput label="默认字体大小" bind:value={fontSize} min={10} max={60} />

  <!-- 字体面 -->
  <div class="card ...">
     <div class="config-item">
        <span>默认字体</span>
        <FontDropdown
           selected={defaultFont}
           options={standardFonts}
           moreOptions={systemFonts}
           onSelect={updateFont}
        />
     </div>
  </div>
</div>
```
