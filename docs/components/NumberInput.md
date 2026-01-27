# 组件分析: NumberInput

## 1. 组件概述

`NumberInput` 是一个步进输入组件（加/减按钮 + 文本输入），针对触摸目标进行了优化。

## 2. 代码分析

### 逻辑

- **验证**：输入时的正则检查，允许小数/整数。
- **范围限制**：失去焦点时强制执行 `min`/`max`。
- **步进**：增加/减少逻辑。

## 3. Svelte 迁移指南

### Svelte 实现

```svelte
<script lang="ts">
  interface Props {
     value: number;
     min?: number;
     max?: number;
     step?: number;
     onchange: (val: number) => void;
  }
  let { value, min = 0, max = 100, step = 1, onchange } = $props();

  function update(val: number) {
      const clamped = Math.max(min, Math.min(max, val));
      onchange(clamped);
  }
</script>

<div class="flex gap-2">
  <input
     type="number"
     value={value}
     onchange={(e) => update(parseFloat(e.currentTarget.value))}
  />
  <button onclick={() => update(value - step)}>-</button>
  <button onclick={() => update(value + step)}>+</button>
</div>
```
