# IAP (应用内购买) 架构分析

为了支撑云存储扩容和高级翻译额度，Readest v0.9.90 引入了 IAP 模块。该模块封装了原生平台（iOS App Store, Google Play Store）的支付能力。

## 1. 跨平台桥接 (`IAPService`)

由于 Tauri 官方插件生态中缺乏成熟的 IAP 支持，Readest 实现了一套自定义的桥接方案。

- **Types**: 定义了统一的 `IAPProduct`, `IAPPurchase` 接口，屏蔽了 iOS `transactionId` 和 Android `purchaseToken/orderId` 的差异。
- **通信**: 通过 `plugin:native-bridge` 通道与 Rust/Swift/Kotlin 层通信。
  - `iap_is_available`: 检查支付环境是否可用（如家长控制是否禁用）。
  - `iap_fetch_products`: 获取商品详情（本地化价格）。
  - `iap_purchase_product`: 发起购买流程。
  - `iap_restore_purchases`: 恢复购买（处理重装应用后的权益找回）。

## 2. 平台策略 (`NativeAppService`)

IAP 功能并非在所有平台开启。`nativeAppService.ts` 中的 `hasIAP` 属性控制了相关 UI 的显隐：

- **iOS**: 始终开启 (`OS_TYPE === 'ios'`)。
- **Android**: 仅在 Google Play 渠道包开启 (`DIST_CHANNEL === 'playstore'`)。直接下载的 APK（F-Droid 或 GitHub Release）通常不支持 Play Billing，因此会隐藏购买入口。
- **Desktop**: 目前不支持 IAP，未来可能通过 Stripe/Web 支付实现。

## 3. 权益关联 (`Quota`)

IAP 购买成功后，客户端会获得收据 (Receipt/Token)。

- **验证**: 客户端将收据发送给 Supabase Edge Functions (后端)。
- **更新**: 后端验证收据有效性后，更新 `users` 表中的 `storage_quota` 或 `translation_quota` 字段。
- **同步**: 客户端下次同步用户资料时，会拉取到最新的 `purchase` 额度（见 `DEFAULT_STORAGE_QUOTA` 定义），从而解锁更多云空间。

## 4. 恢复购买

符合 App Store 审核指南，在“设置 -> 账户”页面提供了“恢复购买”按钮。调用 `restorePurchases` 获取所有过往交易，并重新提交给后端进行权益对账，防止漏单。
