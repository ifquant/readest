# OPDS 协议支持与代理架构分析

OPDS (Open Publication Distribution System) 是电子书分发的标准协议。Readest 实现了完整的 OPDS 客户端功能，允许用户直接浏览 Calibre-Web、Kavita 或 Standard Ebooks 等书库并下载书籍。

## 1. 跨域与代理机制

由于 Web 浏览器的安全策略 (CORS)，运行在浏览器端的 Readest 无法直接访问大多数未配置 CORS Header 的 OPDS 服务器。因此，系统引入了服务端代理架构。

### 1.1 代理流程

1.  **前端 (`opdsReq.ts`)**: 检测到是在 Web 平台 (`isWebAppPlatform()`) 且是 HTTP 请求时，将目标 URL 重新封装。
    - 原始: `http://my-calibre.com/opds`
    - 代理: `/api/opds/proxy?url=http%3A%2F%2Fmy-calibre.com%2Fopds`
2.  **后端 (`route.ts`)**: Next.js API Route 接收请求。
    - 解析 `url` 参数。
    - 转发 `Authorization` 头 (支持 Basic/Digest)。
    - 代表用户向目标服务器发起请求。
    - 将响应透传回前端，并附加宽松的 CORS 头 (`Access-Control-Allow-Origin: *`)。

### 1.2 流式传输

对于大文件（如下载书籍），代理层支持流式转发 (`stream=true`)。响应体直接通过 `NextResponse(response.body)` 透传，而不是先缓冲到内存中，避免了服务器内存溢出。

## 2. 认证体系

Readest 支持两种主流的 HTTP 认证方式，这在私有书库（如群晖搭建的 Calibre）中非常常见。

- **Basic Auth**: 标准的 Base64 编码用户名密码。
- **Digest Auth**: 更安全的摘要认证。由 `opdsReq.ts` 中的 `createDigestAuth` 实现。
  - **流程**: 首次请求返回 401及 `WWW-Authenticate` 头 -> 客户端解析 `nonce`/`realm` -> 生成 MD5 哈希响应 -> 再次发起带 `Authorization` 头的请求。

## 3. UI 交互 (`OPDSDialog`)

OPDS 浏览界面是一个模态窗口 (`CatalogDialog`)。它复用了核心的 `foliate-js` OPDS 解析逻辑（判断 Feed 类型、解析 Entry），并以列表或网格形式展示书籍封面和元数据。

## 4. 平台差异

- **Web**: 强制走 `/api/opds/proxy`。
- **Tauri (Desktop/App)**: 由于原生应用不受 CORS 限制，通常使用 `tauriFetch` 直接连接 OPDS 服务器，性能更好且无需中转。
