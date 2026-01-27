# 支付系统详解 (Payment System Analysis)

`src/libs/payment` 模块实现了 Readest 的双轨支付架构：Web 端使用 Stripe，移动端使用原生 IAP (In-App Purchase)。

## 1. 架构概览

为了遵守 Apple App Store 和 Google Play Store 的审核指南，Readest 根据运行平台动态切换支付提供商。

| 平台              | 支付提供商 | 核心逻辑位置          | 关键类/函数                        |
| :---------------- | :--------- | :-------------------- | :--------------------------------- |
| **Web / Desktop** | Stripe     | `libs/payment/stripe` | `createStripeCheckoutSession`      |
| **iOS / Android** | Native IAP | `libs/payment/iap`    | `IAPService`, `purchaseIAPProduct` |

两者的共同目标是：

1.  完成交易。
2.  获取凭证（Session ID 或 Receipt）。
3.  统一跳转到 `/user/subscription/success` 页面进行后端验证。

## 2. Stripe 实现 (`payment/stripe`)

### 客户端 (`client.ts`)

- **加载器**: `getStripe()` 延迟加载 `stripe-js`，使用 Base64 编码的 Public Key（简单的混淆）。
- **会话创建**: `createStripeCheckoutSession` 调用后端 API (`/stripe/checkout`) 获取 `sessionId`。
- **跳转**:
  - **Web**: 直接 `window.location.href`。
  - **Tauri**: 使用 `@tauri-apps/plugin-opener` 打开系统浏览器。这是为了避免在 WebView 内部处理复杂的支付流程（如 3DS 验证）。

### 服务端逻辑 (`server.ts` & `storage.ts`)

这是一个特殊的同构模块。虽然位于 `src/libs` 下，但 `server.ts` 导入了 `stripe` (Node.js SDK) 和 `supabase-admin`，这意味着它**只能在服务端运行**（如 Next.js API Routes）。

- **订阅管理**: `createOrUpdateSubscription` 处理 Webhook 事件，同步 Stripe 订阅状态到 Supabase (`subscriptions` 表)。
- **单次支付**: `createOrUpdatePayment` 处理一次性购买（如购买存储空间），并触发配额更新。
- **配额计算**: `storage.ts` 中的 `updateUserStorage` 聚合用户所有成功的支付记录，计算总存储空间并更新 `plans` 表。

## 3. IAP 实现 (`payment/iap`)

### 抽象层 (`client.ts`)

提供了一层统一的 API 屏蔽 iOS (StoreKit) 和 Android (BillingClient) 的差异。

- **数据规范化**: `transformIAPProductToAvailablePlan` 将原生产品对象转换为 UI 友好的 `AvailablePlan` 结构。
- **验证参数**: `getPurchaseVerifyParams` 生成用于后端验证的参数（receipt, transaction_id 等）。

### 核心流程

1.  **初始化**: `initializeIAP` 连接到底层 Store 服务。
2.  **获取产品**: `fetchAndTransformIAPPlans` 获取价格和本地化描述。
3.  **购买**: `purchaseIAPProduct` 调起系统支付弹窗。
4.  **恢复**: `restoreIAPPurchases` 恢复之前的购买（iOS 强制要求）。

## 4. Svelte 迁移指南

### API 路由拆分

`libs/payment/stripe/server.ts` 和 `storage.ts` 包含敏感的 Admin 逻辑，**绝对不能** 泄露到客户端 bundle 中。

- **SvelteKit**: 必须将这些逻辑移至 `src/routes/api/webhooks/stripe/+server.ts` 或仅在 `+page.server.ts` 中导入。
- **类型安全**: 使用 `import type` 确保类型在客户端可用，但实现代码被隔离。

### 支付状态管理

建议使用 Svelte Store 管理复杂的支付 UI 状态。

```typescript
// src/lib/stores/payment.ts
import { writable } from 'svelte/store';
import { fetchAndTransformIAPPlans } from '$lib/services/payment/iap';

function createPaymentStore() {
  const { subscribe, set, update } = writable({
    plans: [],
    loading: false,
    error: null,
  });

  return {
    subscribe,
    loadPlans: async (ids) => {
      update((s) => ({ ...s, loading: true }));
      try {
        const plans = await fetchAndTransformIAPPlans(ids);
        update((s) => ({ ...s, plans, loading: false }));
      } catch (e) {
        update((s) => ({ ...s, error: e, loading: false }));
      }
    },
  };
}
```

### 环境变量

当前代码使用 `process.env`。迁移时需替换为 SvelteKit 的 `$env/static/public` (Public Keys) 和 `$env/static/private` (Secret Keys)。

```typescript
// Old
const key = process.env.NEXT_PUBLIC_STRIPE_KEY;

// New (SvelteKit)
import { PUBLIC_STRIPE_KEY } from '$env/static/public';
```
