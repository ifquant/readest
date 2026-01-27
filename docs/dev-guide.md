# 开发者指南

## 先决条件

- **Node.js**: LTS 版本 (如果有 `.nvmrc` 请检查，通常为 v18+)。
- **pnpm**: 包管理器。
- **Rust**: Stable 工具链 (通过 [rustup](https://rustup.rs/) 安装)。
- **Tauri 依赖**: 特定于操作系统的构建工具（macOS 为 Xcode，Windows 为 Visual Studio C++ 等，参考 [Tauri 文档](https://tauri.app/v1/guides/getting-started/prerequisites)）。

## 设置

1.  **克隆仓库。**
2.  **安装依赖:**
    ```bash
    pnpm install
    ```
    这将安装根工作区以及所有应用程序/包的依赖项。

## 开发

### 桌面应用 (Tauri)

要在桌面模式下运行应用程序 (Next.js 前端 + Tauri 后端):

```bash
pnpm tauri dev
```

此命令将服务 Next.js 应用程序并启动 Tauri 窗口。

### Web 应用 (仅 Next.js)

要作为标准网站运行应用程序:

```bash
pnpm dev-web
```

注意：原生功能（FS, Shell 等）将不可用或被 mock。

## 构建

### 生产构建

要构建分发制品 (dmg, msi, appimage):

```bash
pnpm tauri build
```

制品将输出到 `apps/readest-app/src-tauri/target/release/bundle/`。

## 项目脚本

在 `apps/readest-app/package.json` 中定义的常用脚本：

- `i18n:extract`: 扫描源代码中的可翻译字符串。
- `lint`: 运行 ESLint。
- `test`: 运行 Vitest 单元测试。
