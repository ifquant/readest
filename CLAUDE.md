# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
```bash
# Install dependencies (run after cloning)
pnpm install
pnpm --filter @readest/readest-app setup-pdfjs

# Start development
pnpm tauri dev              # Desktop app development
pnpm dev-web               # Web app only (faster iteration)

# Build for production
pnpm tauri build           # Desktop app
pnpm build-web             # Web app

# Mobile development
pnpm tauri android init    # Initialize Android (run once)
pnpm tauri android dev     # Android development
pnpm tauri ios init        # Initialize iOS (run once)  
pnpm tauri ios dev         # iOS development
```

### Testing and Quality
```bash
pnpm test                  # Run tests (uses Vitest)
pnpm lint                  # Run ESLint
pnpm build-check          # Full build + quality checks
```

### Specialized Commands
```bash
pnpm i18n:extract         # Extract translation strings
pnpm tauri info           # Verify Tauri dependencies
```

## Architecture Overview

### Monorepo Structure
- **apps/readest-app/** - Main Next.js application with Tauri desktop/mobile integration
- **packages/foliate-js/** - Core ebook rendering engine (external dependency)
- **packages/tauri/** - Custom Tauri framework (forked for specific needs)
- **packages/tauri-plugins/** - Custom Tauri plugins

### Tech Stack
- **Frontend**: Next.js 15, React 19, TypeScript, TailwindCSS, DaisyUI
- **Desktop**: Tauri v2 (Rust backend, web frontend)
- **Mobile**: Tauri mobile (iOS/Android)
- **Web**: OpenNext for Cloudflare deployment
- **State**: Zustand stores
- **Testing**: Vitest with jsdom
- **Internationalization**: i18next

### Core Application Areas
- **Reader Engine**: `/src/app/reader/` - Book reading interface, annotations, TTS
- **Library Management**: `/src/app/library/` - Book organization and metadata
- **Sync Services**: `/src/services/sync/` - Cross-platform synchronization
- **Translation Services**: `/src/services/translators/` - DeepL, Yandex integration
- **TTS System**: `/src/services/tts/` - Text-to-speech with multiple backends

### Key Services
- **Metadata**: Book information from Google Books, Open Library
- **Storage**: S3/R2 for file synchronization
- **Translation**: Multi-provider translation pipeline
- **Authentication**: Supabase integration
- **TTS**: Native + Edge TTS + Web Speech API

### Development Patterns
- Uses workspace-specific dependencies via `workspace:*` references
- Environment-specific configs (`.env.tauri`, `.env.web`, `.env.test.local`)
- Zustand stores in `/src/store/` for state management
- Custom hooks in `/src/hooks/` following React patterns
- Type-safe APIs with Zod validation

### Platform Differences
- **Desktop**: Full Tauri integration with native plugins
- **Web**: Reduced functionality, browser-based features only  
- **Mobile**: Native mobile plugins via Tauri mobile

### Testing
- **Test Location**: `/src/__tests__/`
- **Setup**: Uses jsdom environment with React Testing Library
- **Config**: `vitest.config.mts` with tsconfigPaths plugin

## Important Notes

- Always run `pnpm --filter @readest/readest-app setup-pdfjs` after dependency updates
- Use `pnpm tauri info` to verify platform setup before development
- Web and desktop builds use different environment files
- The codebase includes custom Tauri forks - avoid upgrading Tauri packages without careful consideration

#  前端架构 (readest-app/src)

  - Next.js 15 + React 19: App Router 架构
  - 状态管理: Zustand 多 store 模式
  - UI 组件: TailwindCSS + DaisyUI
  - 国际化: i18next
  - 核心页面: Library、Reader、Auth、User
  - 服务层: 文件操作、同步、翻译、TTS

# 后端架构 (readest-app/src-tauri)

  - Tauri 2: Rust + WebView
  - 文件系统: 跨平台文件操作
  - 原生插件: 认证、TTS、桥接
  - 多平台支持: Desktop/Mobile



  #核心功能模块

  1. Library 管理: 书籍导入、元数据、同步
  2. Reader 引擎: Foliate-js 渲染、阅读设置
  3. 同步服务: 云端存储、跨设备同步
  4. 翻译系统: 多提供商翻译管道
  5. TTS 系统: 原生/Edge/Web Speech

# 重写建议

  1. 先实现基础 AppService 文件操作
  2. 构建核心 Library 和 Reader 组件
  3. 逐步添加同步和高级功能
  4. 保持平台抽象层设计