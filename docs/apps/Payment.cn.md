# 支付系统分析 (Payment System)

Readest 的支付系统基于 Stripe 实现，涵盖了订阅 (Subscription) 和单次购买 (One-time Payment)。
后端逻辑位于 `src/app/api/stripe`，前端 UI 位于 `src/app/user/components/subscription`。

## 1. 架构概览

- **Source of Truth**: Stripe 是计费状态的唯一真理来源。
- **Sync Layer**: 通过 Webhook 将 Stripe 的状态实时同步到 Supabase 数据库。
- **Access Control**: 应用层 (App) 读取 Supabase 中的 `plans` 表来决定用户权限 (Free/Pro/Max)。

---

## 2. Webhook 实现 (`api/stripe/webhook/route.ts`)

这是支付系统的中枢神经。Next.js API Route 接收 Stripe 的 POST 请求。

### 2.1 关键事件处理

| Stripe Event Type               | Action            | Database Update                              |
| :------------------------------ | :---------------- | :------------------------------------------- |
| `checkout.session.completed`    | 用户完成支付/订阅 | 创建/更新 `customers` 和 `subscriptions` 表  |
| `invoice.payment_succeeded`     | 自动续费成功      | 更新订阅 `current_period_end`，设为 `active` |
| `invoice.payment_failed`        | 扣款失败          | 标记订阅为 `past_due`，提示用户              |
| `customer.subscription.deleted` | 用户取消或过期    | 标记订阅为 `cancelled`，降级 Plan 为 `free`  |

### 2.2 安全性

- **签名校验**: 必须校验 `stripe-signature` 头，防止伪造请求。
- **Admin Client**: Webhook 逻辑运行在服务端，使用 `createSupabaseAdminClient` (Bypass RLS) 直接写入数据库，这是因为 Webhook 请求也是无用户 Session 的。

---

## 3. 前端集成

虽然本次重点分析的是 `src/app`，但提及支付前端也是必要的。
`src/app/user/components` 下的 `PlansComparison` 和 `Checkout` 组件负责：

1.  **展示**: 从 Stripe API (或缓存) 获取当前价格和产品列表。
2.  **发起**: 调用 `/api/stripe/checkout` 创建 Session，并重定向到 Stripe Hosted Page。
3.  **管理**: 调用 `/api/stripe/portal` 重定向到 Stripe Customer Portal 进行改卡或退订。

---

## 4. Svelte 迁移指南

### 4.1 API 迁移

- `src/app/api/stripe/webhook/route.ts` -> `src/routes/api/stripe/webhook/+server.ts`。
- 逻辑基本可直接复制，只需调整 Request/Response 对象（NextRequest -> SvelteKit RequestEvent）。

### 4.2 状态同步

Stripe Webhook 是异步的。用户支付完成后重定向回 App 时，数据库可能尚未完成同步。
**建议**: 在支付成功回调页 (`/user?success=true`) 增加一个 Polling 机制或手动触发一次 `/api/sync-subscription`，以确保用户立即看到 Pro 状态。
