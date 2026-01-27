# 组件分析: TextEditor

## 1. 组件概述

`TextEditor` 是一个自动调整大小的 `textarea`。

- **特性**：高度自动增长，最大行数限制，“Cmd+Enter 保存”，“Esc 取消”。

## 2. 代码分析

### 逻辑

- **自动调整大小**：`adjustHeight` 函数计算 `scrollHeight` 并设置元素像素高度。
- **命令句柄 (Imperative Handle)**：通过 Ref 向父级暴露 `focus`, `blur`, `setValue`。

## 3. Svelte 迁移指南

### Svelte 实现

Svelte 有更简单的方法来绑定尺寸，或者直接使用标准的 auto-resize action。

```svelte
<script lang="ts">
  let { value = $bindable(), minRows = 1, maxRows, onSave, onEscape } = $props();
  let textarea: HTMLTextAreaElement;

  function adjustHeight() {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
  }
</script>

<textarea
  bind:this={textarea}
  bind:value
  oninput={adjustHeight}
  onkeydown={(e) => {
      if (e.key === 'Escape') onEscape();
      if (e.key === 'Enter' && e.metaKey) onSave();
  }}
></textarea>
```
