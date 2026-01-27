# 工具类服务详解 (Utility Services)

`src/utils` 目录下包含了一些实质上属于 "外部服务集成" 的模块。

## 1. DeepL Client (`deepl.ts`)

这是 DeepL 翻译服务的非官方实现，直接调用了 Web 版的 JSON-RPC 接口。

### 核心 Hack 逻辑 (`buildRequestData`)

为了绕过简单的反爬机制，客户端手动计算 `timestamp`：

- 逻辑：`Timestamp = Date.now()`
- 混淆：如果文本中包含字符 `i`，时间戳会被调整：`ts - (ts % iCount) + iCount`。
- API：`LMT_handle_texts` (DeepL 内部接口)。

### Svelte 迁移警告

- **Server-side Proxy**: 在浏览器端直接调用此无 Key 接口可能会受限于 CORS 或 IP 封禁。
- **Backup Plan**: 建议保留此实现作为 "Free Tier" 的一种变通手段，但应优先考虑接入官方 API 或本地模型，并将其逻辑封装到标准 `TranslatorProvider` 中。

## 2. In-App Purchase (`iap.ts`)

`IAPService` 类封装了 Tauri 的 Rust 侧插件功能 (`plugin:native-bridge`)。

- **Channels**: 支持 iOS (AppStore) 和 Android (PlayStore)。
- **Interface**:
  - `fetchProducts()`: 获取商品列表。
  - `purchaseProduct()`: 发起支付。
  - `restorePurchases()`: 恢复购买。

## 3. Telemetry (`telemetry.ts`)

PostHog 的轻量级封装。

- **Privacy**: 检查 `localStorage` 中的 `readest-telemetry-opt-out` 标志。
- **Migration**: SvelteKit 中建议在 `src/hooks.client.ts` 中初始化 PostHog。
