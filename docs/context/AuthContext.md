# AuthContext 分析

## 目的

`AuthContext` 管理应用程序的全局身份验证状态。它封装了 Supabase Auth 客户端，并提供：

1.  **身份状态**：当前的 `user` 对象和 `token`。
2.  **持久化**：自动将认证状态同步到 `localStorage` ('token', 'user', 'refresh_token')，以支持离线访问和更快的启动。
3.  **会话管理**：处理令牌刷新，并自动同步来自 Supabase (`onAuthStateChange`) 的会话变更。
4.  **分析身份**：将已认证的用户 ID 绑定到 PostHog 分析。

## 状态接口

```typescript
interface AuthContextType {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  refresh: () => void;
}
```

## 内部逻辑

- **初始化**：立即从 `localStorage` 恢复状态，以防止闪烁。
- **Effect**：
  - 订阅 `supabase.auth.onAuthStateChange`。
  - 登录时：更新 `localStorage`，设置 React 状态，在 PostHog 中识别用户。
  - 注销时：清除 `localStorage` 和 React 状态。
  - 挂载时：尝试 `refreshSession()`。

## Svelte 迁移指南

在 Svelte 中，我们可以使用 **全局 Store** 模式来替换此 Context。Svelte store 非常适合身份验证，因为它们是响应式的，并且可以在任何地方（组件或纯 JS 文件）访问。

### 推荐实现：`authStore.ts`

不要使用 Context Provider 包裹应用，而是使用从模块导出的 writable store。

```typescript
// src/stores/authStore.ts (Svelte)
import { writable, get } from 'svelte/store';
import { supabase } from '@/utils/supabase';
import type { User } from '@supabase/supabase-js';
import posthog from 'posthog-js';

interface AuthState {
  token: string | null;
  user: User | null;
}

// 1. Initialize from localStorage
const storedToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
const storedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;

const initialState: AuthState = {
  token: storedToken,
  user: storedUser ? JSON.parse(storedUser) : null,
};

export const authState = writable<AuthState>(initialState);

// 2. Define Actions
export const authActions = {
  async init() {
    // Setup listener
    supabase.auth.onAuthStateChange((_, session) => {
      if (session) {
        this.syncSession(session);
      } else {
        this.logout();
      }
    });
    // Initial Refresh
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      this.syncSession(data.session);
    }
  },

  syncSession(session: any) {
    const { access_token, refresh_token, user } = session;
    // Side effects
    localStorage.setItem('token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    localStorage.setItem('user', JSON.stringify(user));
    posthog.identify(user.id);

    // Update Store
    authState.set({ token: access_token, user });
  },

  async logout() {
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    authState.set({ token: null, user: null });
    posthog.reset();
  },
};
```

### 组件中的使用

```svelte
<!-- Consumer.svelte -->
<script>
  import { authState, authActions } from '@/stores/authStore';

  // Auto-subscription
  $: user = $authState.user;
</script>

{#if user}
  <h1>Welcome, {user.email}</h1>
  <button on:click={authActions.logout}>Logout</button>
{:else}
  <button>Login</button>
{/if}
```

### 主要区别

1.  **无 Provider 地狱**：不需要将应用包裹在 `<AuthProvider>` 中。只需导入 store。
2.  **响应式自动订阅**：使用 `$` 语法自动订阅/取消订阅。
3.  **分离**：逻辑移至纯 TS 文件 (`authStore.ts`)，使其更易于独立于 UI 进行测试。
