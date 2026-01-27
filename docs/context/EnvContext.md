# EnvContext 分析

## 目的

`EnvContext` 充当应用程序的 **服务定位器 (Service Locator)** 和 **环境配置** 提供者。它是 UI 与底层平台实现（Web vs Native）之间的桥梁。

1.  **环境配置**：持有 `EnvConfigType`（可能是平台标志，如 `isTauri`, `isMobile`）。
2.  **应用服务**：提供异步的 `AppService` 实例。这是处理文件系统 (VFS)、设置和数据持久化的核心服务。

## 状态接口

```typescript
interface EnvContextType {
  envConfig: EnvConfigType;
  appService: AppService | null; // Null initially while loading
}
```

## 内部逻辑

- **初始化**：
  - 同步加载 `env`（平台标志）。
  - 异步调用 `envConfig.getAppService()` 实例化正确的服务实现（例如 `NativeAppService` 或 `WebAppService`）。
- **全局错误处理**：添加窗口错误监听器，以抑制合法但恼人的 `ResizeObserver loop limit exceeded` 错误。

## Svelte 迁移指南

在 React 中，这是一个 Context，因为 `AppService` 是异步的，我们希望在它准备好之前阻止渲染（或显示加载器）。在 Svelte 中，我们可以使用带有异步初始化的 **Readable Store**，或者如果我们要优雅地处理加载状态，只需使用模块级单例。

### 推荐实现：`envStore.ts`

```typescript
// src/stores/envStore.ts
import { writable, type Writable } from 'svelte/store';
import env, { type EnvConfigType } from '@/services/environment';
import type { AppService } from '@/types/system';

// Sync part (Environment Flags)
export const envConfig = env; // It's static, no need for a store unless it changes dynamically

// Async part (Service)
export const appService: Writable<AppService | null> = writable(null);

export async function initServices() {
  const service = await env.getAppService();
  appService.set(service);

  // Global Error Handlers (moved from useEffect)
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => {
      if (e.message === 'ResizeObserver loop limit exceeded') {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    });
  }
}
```

### 根布局中的使用 (`+layout.svelte`)

需要在应用根目录触发一次初始化。

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { onMount } from 'svelte';
  import { initServices, appService } from '@/stores/envStore';

  onMount(() => {
    initServices();
  });
</script>

{#if $appService}
  <slot />
{:else}
  <LoadingSpinner />
{/if}
```

### 组件中的使用

```typescript
import { appService } from '@/stores/envStore';
import { get } from 'svelte/store';

// In a function
function saveFile() {
   const service = get(appService);
   if (service) service.save(...);
}
```

### Svelte Context vs Store

虽然 Svelte 有 Context API (`setContext`/`getContext`)，但它严格绑定到组件树。由于 `AppService` 是各处都需要的单例，**Store** 是更好的架构选择（服务定位器模式）。
