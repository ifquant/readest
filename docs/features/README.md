# Readest 功能特性分析索引

本文档汇总了 Readest v0.9.x 系列版本的所有核心功能与技术实现分析。

## 1. 核心架构 (Core Architecture)

- [阅读器引擎集成 (Foliate-js)](./foliate-integration.md) - 解析 `foliate-js` 在 React/Next.js 中的生命周期与事件桥接。
- [翻译架构升级](./translator-architecture-analysis.md) - 基于 Hook 的多服务商（Google/DeepL/ChatGPT）可插拔翻译设计。
- [Web 端架构支持](./web-support-analysis.md) - 浏览器环境下的文件系统模拟 (IndexedDB) 与 API 代理策略。

## 2. 阅读体验与交互 (Reader Experience)

- [翻页与阅读控制](./reading-control-analysis.md) - 点击/滚动翻页逻辑及防误触实现。
- [滚轮翻页机制](./scroll-wheel-analysis.md) - 鼠标滚轮事件到翻页动作的映射与防抖。
- [快捷键系统](./chapter-shortcuts-analysis.md) - 跨 iframe 的键盘事件分发与章节跳转快捷键 (Alt+Arrows)。
- [标注范围微调](./annotation-range-analysis.md) - 拖拽手柄 (`Handle`) 实现高亮选区的精确二次编辑。
- [弹出式注脚](./popover-footnote-analysis.md) - EPUB 注脚的提取与悬浮窗渲染。
- [竖排弹窗适配](./vertical-popup-direction-analysis.md) - 竖排模式下菜单与弹窗的坐标计算逻辑。
- [页眉页脚切换](./header-footer-toggle-analysis.md) - 沉浸式阅读模式的 UI 显隐控制。

## 3. UI 与个性化 (UI & Customization)

- [网格布局系统](./grid-layout-analysis.md) - 多窗口/分屏模式下的动态网格计算 (Grid Template)。
- [自定义 CSS](./custom-css-analysis.md) - 用户样式表的注入与优先级管理。
- [自定义高亮颜色](./highlight-colors-analysis.md) - 语义化的高亮色槽位与 HEX 色值映射。
- [加载额外字体](./load-extra-fonts-analysis.md) - 在线字体 (Google Fonts) 与本地字体文件的动态加载。

## 4. 同步与数据 (Sync & Data)

- [多端同步机制](./sync.md) - 基于 Supabase 的数据同步概览。
- [阅读进度同步](./progress-sync-analysis.md) - CFI 进度的实时去抖动同步策略。
- [标注同步](./annotations-analysis.md) - 笔记与高亮数据的增量同步。
- [后台传输队列](./transfer-queue-analysis.md) - 大文件上传/下载的任务调度与断点重试。
- [云备份状态可见性](./cloud-status-analysis.md) - 书籍封面的云端状态图标 (Cloud/Local/Syncing)。
- [自动更新机制](./auto-update-analysis.md) - Tauri 更新检查与 OTA 流程。
- [内置演示书库](./demo-library-analysis.md) - 首次启动时的 Demo 书籍加载逻辑。

## 5. 系统集成 (System Integration)

- [OPDS 协议支持](./opds-analysis.md) - 电子书目录的代理访问 (CORS) 与认证 (Basic/Digest)。
- [IAP 应用内购买](./iap-analysis.md) - 跨平台支付桥接与权益（云存储/翻译额度）管理。
- [锁屏封面同步](./lock-screen-cover-analysis.md) - 安卓 E-ink 设备壁纸的自动文件覆盖机制。
- [文件关联关联](./file-association-analysis.md) - 操作系统层面的文件打开 (Open With) 响应处理。

## 6. 国际化与辅助功能 (I18n & Accessibility)

- [TTS 体验优化](./tts-optimization-analysis.md) - 通过 SSML 预处理优化朗读停顿与节奏。
- [TTS 目标语言朗读](./tts-target-lang-analysis.md) - 翻译模式下的“仅读译文”或“双语朗读”支持。
- [简繁体转换](./chinese-conversion-analysis.md) - 正文、目录与标点的实时简繁/港台变体转换。
- [校对与替换](./proofread-replace-analysis.md) - 基于正则的文本纠错与 CJK 分词边界处理。
