import React from 'react';
//import Webview from '../components/Webview';
import WeiboLogin from '../components/WeiboLogin'; 

export default function Home() {
  return (
    <div>
      <h1>微博扫码登录</h1>
      <WeiboLogin />
    </div>
  );
}