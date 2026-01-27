# 组件分析: LegalLinks

## 1. 组件概述

`LegalLinks` 显示“服务条款”和“隐私政策”的页脚链接。它主要为了符合 Apple 对 iOS/macOS 应用的要求（链接到标准 EULA），有条件地渲染条款 URL。

## 2. 代码分析

### Props 接口

无。

### 依赖

- `useEnv`: 用于检查 `isIOSApp` / `isMacOSApp`。
- `Link`: 处理外部打开的内部组件。

### 逻辑

- **条件 URL**：
  - 如果是 Apple 平台 (iOS/macOS)：链接到 Apple 的标准 EULA。
  - 否则：链接到 `readest.com` TOS。

## 3. Svelte 迁移指南

### Svelte 实现 (Svelte 5)

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { env } from '$lib/stores/env';
  import Link from './Link.svelte';

  let isApple = $derived($env.isIOSApp || $env.isMacOSApp);
  let termsUrl = $derived(isApple
    ? 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
    : 'https://readest.com/terms-of-service'
  );
</script>

<div class="my-2 flex flex-wrap justify-center gap-4 text-sm sm:text-xs">
  <Link href={termsUrl} class="text-blue-500 underline hover:text-blue-600">
    {$t('Terms of Service')}
  </Link>
  <Link
    href="https://readest.com/privacy-policy"
    class="text-blue-500 underline hover:text-blue-600"
  >
    {$t('Privacy Policy')}
  </Link>
</div>
```
