import React, { useEffect, useState } from 'react';
// When using the Tauri API npm package:
import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';

// Invoke the command
export default function Webview() {
    const onNavigation = useCallback((event) => {
    const url = event.url;
    // 可以在这里处理导航事件
    if (url.startsWith('https://weibo.cn/login')) {
      // 允许登录相关导航
      return true;
    }
    // 对其他导航进行过滤或处理
    return true;
  }, []);
  const [cookies, setCookies] = useState<string[]>([]);

  useEffect(() => {
    // 定期获取 Cookie
    const interval = setInterval(async () => {
      try {
        const cookieString = await invoke('get_cookies'); // 调用 Rust 后端获取 Cookie
        setCookies(cookieString);
      } catch (error) {
        console.error('Error fetching cookies:', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="webview-container">
      <iframe
        src="https://passport.weibo.com/sso/signin?entry=wapsso&source=wapssowb&url=https%3A%2F%2Fweibo.cn"
        className="webview"
        allow="top-navigation"
        onNavigation={onNavigation}
        style={{ width: '100%', height: '100%' }}
      ></iframe>
      <div className="cookies">
        <h3>Cookies:</h3>
        <pre>{JSON.stringify(cookies, null, 2)}</pre>
      </div>
    </div>
  );
}