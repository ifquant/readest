# PHContext (PostHog) 分析

## 目的

`PHContext` 初始化并提供 PostHog 分析集成。

1.  **初始化**：使用 API 密钥和主机初始化 `posthog-js`。
2.  **遥测控制**：检查 `TELEMETRY_OPT_OUT_KEY` 以尊重用户隐私。
3.  **会话跟踪**：为所有分析事件注册当前的 `$app_version`。
4.  **Provider**：将应用包裹在 `<PostHogProvider>`（来自 `posthog-js/react`）中，以启用特定的 PostHog hooks。

## 内部逻辑

- 读取环境变量 (`NEXT_PUBLIC_POSTHOG_KEY`)。
- 仅在 **Production (生产环境)** 且未选择退出的情况下有条件地初始化 PostHog。
- `CSPostHogProvider`：客户端组件，在挂载时更新会话属性。

## Svelte 迁移指南

Svelte 不需要像这样的包装器组件 Provider 来实现集中式逻辑。你可以在共享工具类或根布局的 `onMount` 中初始化它。

### 推荐实现：`analytics.ts`

查看 `apps/readest-app/src/utils/telemetry.ts`（如果存在），或者创建一个集中式的分析模块。

```typescript
// src/services/analytics.ts
import posthog from 'posthog-js';
import { getAppVersion } from '@/utils/version';

const TELEMETRY_OPT_OUT_KEY = 'telemetry_opt_out';

export function initAnalytics() {
  if (typeof window === 'undefined') return;

  const isOptOut = localStorage.getItem(TELEMETRY_OPT_OUT_KEY) === 'true';
  const apiKey = import.meta.env.NEXT_PUBLIC_POSTHOG_KEY; // or SvelteKit $env

  if (!isOptOut && import.meta.env.PROD && apiKey) {
    posthog.init(apiKey, {
      api_host: import.meta.env.NEXT_PUBLIC_POSTHOG_HOST,
      person_profiles: 'always',
    });

    posthog.register_for_session({
      $app_version: getAppVersion(),
    });
  }
}

// Helper to use in components
export const analytics = posthog;
```

### 根布局中的使用

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { onMount } from 'svelte';
  import { initAnalytics } from '@/services/analytics';
  import { page } from '$app/stores';

  onMount(() => {
     initAnalytics();
  });

  // Page View Tracking (SvelteKit specific example)
  $: if ($page.url) {
     analytics.capture('$pageview');
  }
</script>
```

### 移除 Context

PostHog 的 JS 库是基于单例的。除非你大量使用 `usePostHog` hooks（它们也只是返回单例），否则通常不需要 Context provider。在 Svelte 中，直接导入单例即可。
