# 环境配置与常量 (Environment & Constants)

该模块负责应用的运行时环境检测、全局常量定义以及默认配置管理。

## 1. 平台检测机制 (`environment.ts`)

应用通过环境变量 `NEXT_PUBLIC_APP_PLATFORM` 在构建时区分目标平台，并在运行时通过 `window.__READEST_CLI_ACCESS` 等标志进一步细分环境。

- **isTauriAppPlatform()**: 检查是否为 Tauri 环境。
- **isWebAppPlatform()**: 检查是否为纯 Web 环境。
- **isPWA()**: 检查 `matchMedia('(display-mode: standalone)')`。
- **Base URL**: 区分 Web API (`/api`) 和 Node API (用于边缘运行时不支持的场景)。

## 2. 全局常量 (`constants.ts`)

此文件是应用的"配置中心"，包含大量硬编码的业务规则和默认值。

### 关键配置项

- **文件系统路径**: `DATA_SUBDIR` ('Readest'), `LOCAL_BOOKS_SUBDIR` 等。
- **支持格式**: `SUPPORTED_BOOK_EXTS` (epub, pdf, mobi...)。
- **默认设置**:
  - `DEFAULT_READSETTINGS`: 阅读器默认样式（字体、行高、颜色）。
  - `DEFAULT_SYSTEM_SETTINGS`: 系统行为（自动更新、屏幕常亮）。
  - `DEFAULT_BOOK_FONT`: 预设字体栈 (Bitter, Roboto...)。
- **字体列表**: 维护了庞大的 OS 特定字体白名单 (Windows, macOS, Linux, iOS, Android, CJK)。

## 3. Svelte 迁移指南

### 环境变量迁移

SvelteKit 使用 `$env` 模块替代 `process.env`。

| Next.js                                | SvelteKit                                                  |
| :------------------------------------- | :--------------------------------------------------------- |
| `process.env.NEXT_PUBLIC_API_BASE_URL` | `import { PUBLIC_API_BASE_URL } from '$env/static/public'` |
| `process.env.NODE_ENV`                 | `import { dev } from '$app/environment'`                   |

### 常量拆分建议

`constants.ts` 目前体积过大 (700+ 行)。迁移时建议按领域拆分：

- `src/lib/config/defaults.ts`: 默认设置对象。
- `src/lib/config/fonts.ts`:字体列表。
- `src/lib/config/formats.ts`: 文件格式支持。

### Isomorphic Environment

SvelteKit 的 `$app/environment` 提供了更标准的 `browser` 变量，可替换 `typeof window !== 'undefined'` 检查。

```typescript
import { browser } from '$app/environment';

export const isPWA = () => browser && window.matchMedia('(display-mode: standalone)').matches;
```
