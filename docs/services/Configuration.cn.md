# 全局配置详解 (Configuration & Constants)

`src/services/constants.ts` 是 Readest 的静态数据中心。它不仅包含简单的常量，还定义了复杂的领域模型默认值。

## 1. 核心常量分类

### 1.1 默认设置 (Defaults)

这些对象定义了用户首次启动应用时的状态，也是 "重置设置" 功能的基准。

- `DEFAULT_READSETTINGS`: 阅读器核心配置（侧边栏宽度、高亮样式）。
- `DEFAULT_BOOK_LAYOUT`: 排版引擎配置（页边距、行高、渲染模式）。
  - _关键_: `isEink` 标志会触发特殊的无动画渲染模式。
- `DEFAULT_BOOK_FONT`: 定义了兜底字体栈 (`Bitter`, `Roboto`)。

### 1.2 字体白名单 (Font Whitelists)

为了在不同 OS 上提供一致且美观的排版，Readest 维护了庞大的字体列表：

- `WINDOWS_FONTS`, `MACOS_FONTS`, `LINUX_FONTS`: 桌面端系统字体。
- `IOS_FONTS`, `ANDROID_FONTS`: 移动端系统字体。
- `CJK_*_FONTS`: 特别针对中日韩字符优化的字体列表（如 `LXGW WenKai` 霞鹜文楷）。

### 1.3 业务规则

- `SUPPORTED_BOOK_EXTS`: 支持的电子书格式列表。
- `DEFAULT_STORAGE_QUOTA`: 用户等级对应的存储空间限制。
- `CUSTOM_THEME_TEMPLATES`: 预置的主题配色方案（Light/Dark/Green）。

## 2. Svelte 迁移指南

### 模块化拆分

为了减少 Bundle 体积并提高可维护性，建议将 `constants.ts` 拆分为多个文件：

- `src/lib/config/defaults.ts`: 纯配置对象。
- `src/lib/config/fonts.ts`: 字体列表（体积较大，可按需加载）。
- `src/lib/config/theme.ts`: 颜色与主题模板。

### 类型与值共存

目前的 `DEFAULT_*` 常量与 `src/types/*.ts` 中的类型定义是分离的。
迁移时，建议使用 **Zod** 或 **Valibot** 定义 Schema，既能生成 TS 类型，又能作为运行时校验（例如校验导入的 JSON 配置是否合法）。

```typescript
// src/lib/schemas/settings.ts
import { z } from 'zod';

export const ReadSettingsSchema = z.object({
  sideBarWidth: z.string().default('15%'),
  // ...
});

export type ReadSettings = z.infer<typeof ReadSettingsSchema>;
export const DEFAULT_READSETTINGS = ReadSettingsSchema.parse({});
```
