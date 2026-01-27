# 鉴权与用户系统 (Auth & User)

这部分文档涵盖了应用的身份认证流程 (`src/app/auth`) 和用户中心页面 (`src/app/user`)。

## 1. 身份认证 (`auth/page.tsx`)

Readest 支持多平台、多渠道的 OAuth 登录，实现逻辑相当复杂。

### 1.1 核心组件

使用 `Supabase Auth UI` (`@supabase/auth-ui-react`) 来渲染标准的 Email/Password 表单，大大减少了 UI 代码量。

### 1.2 跨平台 OAuth 策略

为了在不同平台（Web, Desktop, Mobile）上都能安全地完成 OAuth 回调，采用了分流策略：

- **Web**: 标准 HTTP Redirect (`/auth/callback`)。
- **Desktop (Tauri)**:
  - **Deep Link**: 注册 `readest://` 协议，从浏览器唤起应用。
  - **Local Server**: 在本地启动临时 HTTP Server (`localhost:port`) 接收回调（用于不支持 Custom Scheme 的环境或开发模式）。
- **Mobile (iOS/Android)**:
  - 使用 `ASWebAuthenticationSession` (iOS) 或 `Custom Tab` (Android) 打开 OAuth 页面，体验更原生。
  - 回调通过 Deep Link 处理。

### 1.3 苹果登录 (Sign in with Apple)

由于 iOS 对隐私的严格要求，Native App 必须使用系统原生的 Apple Sign In API，而不是 Web 跳转。
代码通过 `getAppleIdAuth` 调用 Native Bridge 获取 `identityToken`，再传给 Supabase 进行校验。

## 2. 用户中心 (`user/page.tsx`)

用户中心不仅是信息展示，也是**支付**和**账户管理**的入口。

### 2.1 支付集成 (Payments)

支持双轨制支付系统，根据平台自动切换：

- **Stripe (Web/Desktop)**:
  - 创建 Checkout Session。
  - 支持 **Embedded Checkout** (在应用内嵌入 iframe 支付) 或跳转浏览器。
  - 提供 Customer Portal 管理订阅。
- **IAP (Mobile)**:
  - 调用 `iap/client.ts` 发起内购。
  - 必须提供 "Restore Purchases" (恢复购买) 功能以符合 App Store 审核。

### 2.2 存储管理

- 整合了 `useQuotaStats` Hook，展示存储空间使用率。
- 提供 `StorageManager` 组件清理大文件。

## 3. Svelte 迁移指南

### Auth UI 迁移

Supabase 官方并未提供 Svelte 版本的 Auth UI 组件。
迁移方案：

1.  **手动实现表单**: 使用 Svelte 实现登录/注册表单，调用 `supabase.auth.signInWithPassword`。
2.  **使用社区库**: 寻找 Svelte 适配的 Auth UI 库，或直接 port React 版本的 CSS。

### OAuth 流程迁移

核心逻辑在于 `getTauriRedirectTo` 和回调监听。这部分逻辑是纯 JS/Tauri API，可以完整复用到 SvelteKit 的 `src/routes/auth/+page.svelte` 和 `onMount` 中。

### 支付逻辑迁移

支付逻辑主要集中在 `handleStripeSubscribe` 和 `handleIAPSubscribe` 事件处理器中。
建议将其提取到 `src/lib/services/payment.ts` 中，使 UI 层更轻量。
