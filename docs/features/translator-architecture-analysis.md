# 翻译架构升级分析 (Translator Architecture)

Readest v0.9.43 将翻译功能从硬编码的单一实现升级为可插拔的 Provider 架构，支持多源切换并内置了缓存与优化机制。

## 1. 核心钩子 (`useTranslator`)

`useTranslator` 是上层组件（如划词翻译弹窗、整页翻译）与底层翻译服务交互的唯一入口。

### 1.1 职责

- **Provider 管理**: 根据用户设置或配额状态，动态切换底层 `TranslationProvider` (e.g., DeepL -> Azure)。
- **请求调度**:
  - **缓存优先**: 在发起网络请求前，先查询本地缓存 (`getFromCache`)。
  - **批量处理**: 将未命中的文本合并，一次性发送给 API，减少 HTTP 请求开销。
  - **结果合并**: 将缓存结果与网络返回结果按原始索引拼装，返回完整的翻译数组。
- **预处理/后处理**:
  - `preprocess`: 去除多余换行、修整标点，提高机器翻译准确度。
  - `polish`: (可选) 即使翻译成功，也可以通过规则进一步润色（如统一中英文标点）。

## 2. 接口抽象 (`TranslationProvider`)

所有翻译服务必须实现统一的接口：

```typescript
interface TranslationProvider {
  name: string;
  translate(texts: string[], src: string, tgt: string, token: string): Promise<string[]>;
  authRequired: boolean;
  quotaExceeded?: boolean;
}
```

### 2.1 支持的 Provider

- **DeepL**: 质量最优，但免费额度有限。
- **Google**: 覆盖语种最全，速度快。
- **Azure / Yandex**: 作为备选方案。
- **GPT/AI (Future)**: 架构上已预留位置，通过相同的接口只需替换 `translate` 方法即可接入 LLM 翻译。

## 3. 配额与降级

代码中实现了自动降级逻辑：

- 如果主 Provider (如 AI 翻译) 抛出 `DAILY_QUOTA_EXCEEDED` 错误。
- 系统会触发 Toast 提示用户。
- 自动将当前 Provider 切换为免费/备用的 `azure` 或其他服务，确保用户体验不中断。

## 4. 缓存机制

- **粒度**: 以“段落”或“句子”为单位。
- **Key**: `md5(text + provider + sourceLang + targetLang)`。
- **存储**: 使用 IndexedDB 或简单的 LocalStorage 存储翻译对，大幅加速重复段落（如目录、常见短语）的显示速度。
