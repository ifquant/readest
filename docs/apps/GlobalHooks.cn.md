# 全局 Hooks 分析 (Global Hooks)

本文档分析 `src/hooks` 目录下的通用 Hooks，它们主要负责**平台抽象**和**通用逻辑封装**。

## 1. 平台抽象 Hooks

Readest 运行在 Web, macOS, Windows, Android, iOS 等多个平台，Hooks 是抹平差异的关键层。

### 1.1 文件选择 (`useFileSelector.ts`)

封装了 "打开文件" 的逻辑：

- **Web**: 使用 `<input type="file">` 动态创建并点击。
- **Tauri**: 调用 `appService.selectFiles` (Native Dialog)。
- **Android 特例**: 处理 `content://` URI 的解析。

### 1.2 窗口控制 (`useTrafficLight.ts` / `useSafeAreaInsets.ts`)

- **Traffic Light**: 在 macOS 上，红绿灯按钮是原生控件，Web 内容需要通过 CSS (`pl-20`) 进行避让。
- **Safe Area**: 在 iOS/Android 上，处理刘海屏和底部 Home Bar 的避让逻辑。

---

## 2. 通用逻辑 Hooks

### 2.1 国际化 (`useTranslation.ts`)

这是 `react-i18next` 的简单包装。

- **Key Logic**: `t(key, { defaultValue: key })`。如果翻译缺失，默认直接显示 Key 本身（通常 Key 就是英文原文）。

### 2.2 响应式设计 (`useResponsiveSize.ts`)

在 SVG 图标等场景中，需要根据屏幕密度或设备类型调整尺寸。
该 Hook 结合 `appService.isMobile` 和 CSS Media Query 返回合适的像素值。

### 2.3 手势 (`useLongPress.ts`, `usePullToRefresh.ts`)

封装了复杂的 Touch 事件处理，用于书架的长按菜单和下拉刷新。

---

## 3. Svelte 迁移指南

Svelte 对 "Hooks" (逻辑复用) 的处理方式更加多元：

### 3.1 纯函数 / 模块

像 `useFileSelector` 这样不依赖 Component Lifecycle 的逻辑，在 Svelte/TS 中最好直接写成普通的 **Async Function** 或 **Service Module**。不需要封装成 Hook。

```typescript
// lib/fileCursor.ts
export async function pickFile() { ... }
```

### 3.2 Actions (`use:action`)

涉及 DOM 事件绑定的 Hooks (`useLongPress`, `usePullToRefresh`, `useAutoFocus`)，是 Svelte Actions 的完美应用场景。

```svelte
<div use:longpress on:longpress={showMenu}>...</div>
```

### 3.3 Derived Stores

像 `useResponsiveSize` 这种依赖窗口状态的逻辑，可以使用 **Readable Store** 监听 `window.resize`，并在组件中通过 `$isMobile` 自动订阅。

### 3.4 国际化

可以使用 `svelte-i18n` 或简单的 Store 方案。

```svelte
<script>
  import { t } from '$lib/i18n';
</script>
<h1>{$t('hello')}</h1>
```
