# 组件分析: HighlighterIcon

## 1. 组件概述

`HighlighterIcon` 是一个代表荧光笔的专用图标组件。与标准的单色图标不同，它允许独立自定义“笔尖颜色”(`tipColor`)，用于在 UI 中指示选定的高亮颜色。

## 2. 代码分析

### Props 接口

扩展自 `react-icons` 的 `IconBaseProps`：

- `tipColor`: string (默认: '#FFD700')
- `tipStyle`: React.CSSProperties

### 依赖

- `react-icons`: 使用 `GenIcon` 辅助函数来构建 SVG。

### 逻辑

- **双路径 SVG**：图标由两条路径构成：
  1.  笔身（使用 `currentColor` 匹配父级文本颜色）。
  2.  笔尖/墨水（使用 `tipColor` 以显示动态高亮颜色）。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

```svelte
<script lang="ts">
  interface Props {
    tipColor?: string;
    size?: string | number;
    class?: string;
    style?: string;
    [key: string]: any;
  }

  let {
    tipColor = '#FFD700',
    size = '1em',
    class: className,
    style,
    ...rest
  }: Props = $props();
</script>

<svg
  viewBox="0 0 256 256"
  fill="none"
  width={size}
  height={size}
  class={className}
  {style}
  xmlns="http://www.w3.org/2000/svg"
  {...rest}
>
  <!-- 笔身 -->
  <path
    d="M253.66,106.34a8,8,0,0,0-11.32,0L192,156.69,107.31,72l50.35-50.34a8,8,0,1,0-11.32-11.32L96,60.69A16,16,0,0,0,93.18,79.5L72,100.69a16,16,0,0,0,0,22.62L76.69,128,136,187.31l4.69,4.69a16,16,0,0,0,22.62,0l21.18-21.18A16,16,0,0,0,203.31,168l50.35-50.34A8,8,0,0,0,253.66,106.34ZM152,180.69,83.31,112,104,91.31,172.69,160Z"
    fill="currentColor"
  />
  <!-- 笔尖 -->
  <path
    d="M18.34,186.34c-4.209212,4.20621-2.516471,11.37196,3.13,13.25l72,24c0.815308,0.27382,1.669943,0.41232,2.53,0.41c2.12237,0.002,4.15842-0.84009,5.66-2.34L136,187.31c13.62143,13.61626-70.243446-70.24754-64-64l4.69,4.69z"
    fill={tipColor}
  />
</svg>
```

### 关键变更

- **SVG 内联**：Svelte 中直接内联 SVG 比使用 `GenIcon` 抽象更干净。
- **Props**：`tipColor` 直接传递给第二条路径的 `fill` 属性。
