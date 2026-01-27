# 组件分析: Alert

## 1. 组件概述

`Alert` 是一个模态确认对话框组件。

- **特性**：标题、消息、“确认”与“取消”按钮。
- **无障碍性**：捕获焦点/键盘事件（通过 `useKeyDownActions`）。

## 2. 代码分析

### 逻辑

- **Ref**：`useKeyDownActions` 将详细的键盘监听器（回车 -> 确认，Esc -> 取消）附加到包装 div 上。

## 3. Svelte 迁移指南

### Svelte 实现

使用原生的 `<dialog>` 元素或移植后的 `use:trapFocus` action。

```svelte
<script lang="ts">
  let { title, message, onCancel, onConfirm } = $props();
  let processing = $state(false);

  function handleConfirm() {
     processing = true;
     onConfirm();
  }
</script>

<div role="alert" class="alert ..." onkeydown={...}>
   <h3>{title}</h3>
   <p>{message}</p>
   <div class="actions">
      <button onclick={onCancel}>取消</button>
      <button onclick={handleConfirm} disabled={processing}>确认</button>
   </div>
</div>
```
