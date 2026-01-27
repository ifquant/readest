# 其他应用路由 (Misc Routes)

除了核心业务路由外，`src/app` 还包含一些辅助性的路由和资源。

## 1. 离线页面 (`src/app/offline`)

这是一个 PWA (Progressive Web App) 特性页面。
当用户在无网络连接且 Service Worker 无法提供缓存响应时，浏览器会自动导航到 `/offline`。
实现通常很简单：显示一个 "网络已断开" 的提示图标。

## 2. 更新器页面 (`src/app/updater`)

- **用途**: 用于显示应用更新日志 (Changelog) 或手动触发更新检查。
- **Native 集成**: 在 Tauri 环境中，Auto Updater 通常有独立的 Window 逻辑，但在 Web 环境或某些特殊流程中，可能回退到此页面展示信息。

## 3. 字体资源 (`src/app/fonts`)

存放了 `Geist` 字体文件 (Variable Fonts)。
在 Next.js 中，通常利用 `next/font/local` 加载这些字体，并将其 CSS Variable 注入到 `root layout` 中，从而实现高性能的字体加载（避免 Layout Shift）。

## 4. Svelte 迁移指南

### PWA Offline

SvelteKit 配合 `@vite-pwa/sveltekit` 插件可以轻松生成 Service Worker。
离线页面可以放在 `src/routes/offline/+page.svelte`。

### 字体处理

SvelteKit 支持导入字体资源。通常在 `src/app.css` 或 `+layout.svelte` 中使用 `@font-face` 引用：

```css
@font-face {
  font-family: 'Geist';
  src: url('/fonts/GeistVF.woff') format('woff');
}
```

或者将字体文件放在 `static/fonts` 目录中以便直接访问。
