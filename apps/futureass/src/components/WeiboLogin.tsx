import React, { useState, useEffect } from "react";
import { invoke } from '@tauri-apps/api/core';

const WeiboLogin: React.FC = () => {
  return (
<div className="webview-container" style={{ 
  display: 'flex', 
  flexDirection: 'column', 
  height: '100vh',
  margin: 0,  // 移除容器默认外边距
  padding: 0, // 移除容器默认内边距
  boxSizing: 'border-box' // 确保边框和内边距包含在高度计算中
}}>
  {/* Cookie显示区域 - 固定高度 */}
  <div className="cookies" style={{ 
    height: '200px', 
    padding: '1rem', 
    borderBottom: '1px solid #ccc', // 改为下边框，更符合视觉逻辑
    overflow: 'auto',
    backgroundColor: '#fff', // 确保有背景色，避免被iframe覆盖
    zIndex: 10 // 确保层级在iframe之上
  }}>
    <h3 style={{ margin: '0 0 1rem 0' }}>Cookies:</h3>
    <pre>
      aaa
    </pre>
  </div>

  {/* iframe区域 - 占满剩余空间 */}
  <div style={{ 
    flex: 1, 
    overflow: 'hidden',
    boxSizing: 'border-box'
  }}>
    <iframe
      src="https://weibo.cn/pub/"
      style={{
        width: '100%',
        height: '100%',
        border: 'none'
      }}
      //sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
      title="微博页面"
    />
  </div>
</div>
  );
};

export default WeiboLogin;