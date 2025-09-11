// PWA 和打包分析器插件导入
import withPWAInit from '@ducanh2912/next-pwa'; // PWA 支持插件
import withBundleAnalyzer from '@next/bundle-analyzer'; // 打包分析插件

// 环境变量检测
const isDev = process.env['NODE_ENV'] === 'development'; // 开发环境检测
const appPlatform = process.env['NEXT_PUBLIC_APP_PLATFORM']; // 应用平台（web/tauri）

// 开发环境下初始化 Cloudflare OpenNext
if (isDev) {
  const { initOpenNextCloudflareForDev } = await import('@opennextjs/cloudflare');
  initOpenNextCloudflareForDev(); // 设置开发环境代理
}

// 导出配置：非Web平台且非开发环境时启用静态导出
const exportOutput = appPlatform !== 'web' && !isDev;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 输出模式：Tauri桌面应用使用静态导出（SSG），Web应用使用默认模式
  output: exportOutput ? 'export' : undefined, // 静态导出用于Tauri打包
  // 页面扩展名：静态导出时只使用JSX/TSX，避免API路由被导出
  pageExtensions: exportOutput ? ['jsx', 'tsx'] : ['js', 'jsx', 'ts', 'tsx'],
  // 图片优化：静态导出时禁用Next.js图片优化（使用原生img标签）
  // See https://nextjs.org/docs/messages/export-image-api for different workarounds.
  images: {
    unoptimized: true, // 禁用图片优化，使用原始图片
  },
  devIndicators: false, // 禁用开发指示器
  // 资源路径前缀：设置为空字符串
  assetPrefix: '', // 无CDN前缀
  reactStrictMode: true, // 启用React严格模式
  serverExternalPackages: ['isows'], // 服务端外部包（WebSocket相关）
  // 转译包：非开发环境时需要转译的第三方包
  transpilePackages: !isDev // 非开发环境时转译指定包
    ? [
        'i18next-browser-languagedetector', // 国际化语言检测
        'react-i18next', // React国际化
        'i18next', // 国际化核心
        '@ducanh2912/next-pwa', // PWA插件
        '@tauri-apps', // Tauri API
        'highlight.js', // 代码高亮
        'foliate-js', // 电子书渲染引擎
        'marked', // Markdown解析
      ]
    : [], // 开发环境不转译
  // 自定义HTTP头：为Apple应用站点关联文件设置正确的Content-Type
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association', // Apple应用关联文件
        headers: [
          {
            key: 'Content-Type',
            value: 'application/json', // 设置为JSON类型
          },
        ],
      },
    ];
  },
};

// PWA配置：只在Web平台且非开发环境启用
const withPWA = withPWAInit({
  dest: 'public', // PWA文件输出目录
  disable: isDev || appPlatform !== 'web', // 开发环境或非Web平台禁用PWA
  cacheOnFrontEndNav: true, // 前端导航缓存
  aggressiveFrontEndNavCaching: true, // 激进的前端导航缓存
  reloadOnOnline: true, // 网络恢复时重新加载
  swcMinify: true, // 使用SWC压缩
  fallbacks: {
    document: '/offline', // 离线回退页面
  },
  workboxOptions: {
    disableDevLogs: true, // 禁用开发日志
  },
});

// 打包分析器配置：通过环境变量控制是否启用
const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true', // ANALYZE=true时启用分析
});

// 导出配置：依次应用分析器、PWA和基础配置
export default withPWA(withAnalyzer(nextConfig));
