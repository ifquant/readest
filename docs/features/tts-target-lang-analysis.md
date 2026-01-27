# TTS 朗读目标语言功能分析

Readest v0.9.90 增强了 TTS (文本转语音) 在配合“整页翻译”或“段落翻译”时的灵活性，允许用户选择朗读原文还是译文。这对于语言学习者尤为有用。

## 1. 核心配置 (`ttsReadAloudText`)

在 `TranslatorConfig` 中新增了枚举选项：

- `source`: 仅朗读原文。
- `target`: 仅朗读译文。
- `both`: 朗读原文后紧接着朗读译文（双语对照模式）。

## 2. 业务逻辑

该功能主要生效于**翻译模式**开启时。

### 2.1 文本构建

在 `TTSController` 或相关播放逻辑中，当系统准备朗读当前段落（Sentence/Paragraph）时：

1.  **检查翻译状态**: 如果当前段落有对应的翻译结果 (`translationResult`)。
2.  **组合文本**:
    - 如果是 `both`: 构造 "Original text. [Pause]. Translated text."
    - 如果是 `target`: 直接使用 Translated text。
    - 如果是 `source`: 使用 Original text。

### 2.2 语音合成引擎匹配

- **自动切音**: 如果选择 `both`，且原文和译文语言不同（例如 英文 -> 中文），理想的 TTS 引擎应当能自动识别语言变化。
- **多语言 Voice**: 如果底层引擎（如 Edge TTS 或 Native TTS）不支持单次请求混合语言，系统可能需要将请求拆分为两段，分别指定 `en-US` 和 `zh-CN` 语音进行合成，然后串行播放。

## 3. 场景价值

- **沉浸式听书**: 用户可以将外文书翻译成母语后，选择 `target` 模式，直接“听”中文版。
- **外语学习**: 选择 `both` 模式，先听原文磨耳朵，再听译文确认理解，形成高效的听力训练流。
