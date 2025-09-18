import React, { useEffect, useState, useRef } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Window } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';

const WeiboLogin: React.FC = () => {
  const [status, setStatus] = useState('准备初始化...');
  const [webview, setWebview] = useState<WebviewWindow | null>(null);
  const rightAreaRef = useRef<HTMLDivElement>(null); // 右侧空白区域的ref
  const timerRef = useRef<NodeJS.Timeout | null>(null); // 定时器引用


  useEffect(() => {
    // 确保在客户端且Tauri环境中运行
    if (typeof window === 'undefined' || !window.__TAURI__) {
      setStatus('非Tauri环境，功能受限');
      //return;
    }

    const subscriptions: (() => void)[] = [];

    // 初始化WebView的函数
    const initWebView = async () => {
      try {
        // 检查右侧区域是否存在
        if (!rightAreaRef.current) {
          throw new Error('右侧空白区域未找到');
        }

        // 获取右侧区域的位置和尺寸（相对于主窗口）
        const rightAreaRect = rightAreaRef.current.getBoundingClientRect();
        if (rightAreaRect.width <= 0 || rightAreaRect.height <= 0) {
          throw new Error('右侧区域尺寸无效（可能未加载完成）');
        }

        // 获取主窗口位置（用于计算绝对坐标）
        const mainWindow = await Window.getByLabel('main');
        if (!mainWindow) {
          return;
        }
        //const mainPos = await mainWindow.innerPosition();
        const appwindow = getCurrentWindow();
        const factor = await appwindow.scaleFactor()
        const mainPos = (await mainWindow.innerPosition()).toLogical(factor);




        // 创建WebView窗口，覆盖在右侧区域上方
        const newWebview = new WebviewWindow('overlay-webview', {
          title: '嵌入式WebView',
          //url: 'https://weibo.cn/pub/' // 指定加载的网页
          // 计算绝对坐标（主窗口位置 + 右侧区域相对位置）
          
          x: mainPos.x + Math.round(rightAreaRect.left),
          y: mainPos.y + Math.round(rightAreaRect.top),
          width: Math.round(rightAreaRect.width),
          height: Math.round(rightAreaRect.height),
          decorations: false, // 无边框，完全融入布局
          transparent: false,
          url: 'https://weibo.cn/pub/', // 指定加载的网页
          visible: true
        });
        //await newWebview.show();

  // 监听窗口的初始化错误

  newWebview.once("tauri://error", (error) => {
    console.error("窗口初始化错误:", error);
  });

        newWebview.once('tauri://created', function () {
          console.log('WebView已创建');
        setStatus('created' + "webview = " + newWebview);
        setWebview(newWebview);

        });
          newWebview.once("tauri://error", (error) => {
        console.error("窗口初始化错误:", error);
 setStatus('bbbbb');

        });


        //setWebview(newWebview);
        //setStatus('WebView已创建，正在加载网页...');

        // 监听WebView加载事件
        const loadStartSub = await listen('tauri://webview/load-start', (e: any) => {
          if (e.windowLabel === 'overlay-webview') {
            setStatus(`开始加载: ${e.payload.url}`);
          }
        });
        subscriptions.push(loadStartSub);

        const loadFinishSub = await listen('tauri://webview/load-finished', (e: any) => {
          if (e.windowLabel === 'overlay-webview') {
            setStatus(`加载完成: ${e.payload.url}`);
          }
        });
        subscriptions.push(loadFinishSub);

        const errorSub = await listen('tauri://webview/load-error', (e: any) => {
          if (e.windowLabel === 'overlay-webview') {
            setStatus(`加载失败: ${e.payload.error}`);
            console.error('WebView加载错误:', e.payload);
          }
        });
        subscriptions.push(errorSub);

      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        setStatus(`初始化失败: ${errMsg}`);
        console.error('WebView初始化错误:', error);
      }
    };

    // 窗口大小变化时，调整WebView尺寸和位置
    const handleResize = async () => {
      const currentWindow = await getCurrentWindow();
      if (currentWindow.label == "main") {
        //setStatus(`hahahah`);
      } else {

        setStatus(`resize resize2`);
        return;
      }

      if (!webview || !rightAreaRef.current) { 
  //setStatus(`bsize , bsize` + "webview=" + webview + "rightAreaRef.current=" + rightAreaRef.current );

        //return;
      }

      try {
        const rightAreaRect = rightAreaRef.current.getBoundingClientRect();
        const mainWindow = await Window.getByLabel('main');
        if (!mainWindow) {
        setStatus(`can not find webview1`);

          return;
        }
        const appwindow = getCurrentWindow();
        const factor = await appwindow.scaleFactor()
        const mainPos = (await mainWindow.innerPosition()).toLogical(factor);



        const subWindow = await Window.getByLabel('overlay-webview');
        if (!subWindow) {
        setStatus(`can not find webview2`);
          return;
        }

        /*
        const webviewPos = new LogicalPosition(
          mainPos.x + Math.round(rightAreaRect.left),
          mainPos.y + Math.round(rightAreaRect.top)
        );

        // 定义WebView的尺寸（逻辑尺寸）
        const webviewSize = new LogicalSize(
          Math.round(rightAreaRect.width),
          Math.round(rightAreaRect.height)
        ); */

        const webviewPos = new LogicalPosition(
          mainPos.x+100,
          mainPos.y
        );

        // 定义WebView的尺寸（逻辑尺寸）
        const asize = await mainWindow.innerSize()
        const webviewSize = new LogicalSize(
          asize.width/2,
          asize.height/2
        ); 




        // 更新位置
        //webview.setPosition(webviewPos);
        subWindow.setPosition(webviewPos);

        // 更新尺寸
        //webview.setSize(webviewSize);
        subWindow.setSize(webviewSize);

      } catch (error) {
        console.error('调整WebView失败:', error);
      }
    };

    // 关键：使用定时器延迟初始化WebView（确保布局加载完成）
    setStatus('等待布局加载...');

    timerRef.current = setTimeout(() => {
      setStatus('开始初始化WebView...');
      initWebView();
    }, 1600); // 800ms延迟，可根据实际情况调整

    // 监听窗口大小变化
    window.addEventListener('resize', handleResize);

    // 组件卸载时清理
    return () => {
      // 清除定时器
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      // 移除事件监听
      window.removeEventListener('resize', handleResize);
      subscriptions.forEach(unsub => unsub());
      // 关闭WebView
      webview?.close().catch(err => console.error('关闭WebView失败:', err));
    };
  }, []);

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      margin: 0,
      padding: 0,
      overflow: 'hidden'
    }}>
      {/* 左侧文字区域（占30%宽度） */}
      <div style={{
        width: '30%',
        padding: '1.5rem',
        backgroundColor: '#f5f5f7',
        borderRight: '1px solid #e0e0e0',
        overflow: 'auto'
      }}>
        <h2>左侧文字区域</h2>
        <p style={{ marginTop: '1rem', color: '#666' }}>
          这是左侧的文字内容区域，右侧为空白区域，上方会覆盖一个WebView窗口加载指定网页。
        </p>
        <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#fff', borderRadius: '6px' }}>
          <h3>状态信息</h3>
          <p style={{ color: '#333' }}>{status}</p>
        </div>
      </div>

      {/* 右侧空白区域（占70%宽度） */}
      <div
        ref={rightAreaRef}
        style={{
          width: '70%',
          backgroundColor: '#fafafa', // 浅灰色背景，方便观察WebView是否覆盖
          position: 'relative'
        }}
      >
        {/* 空白区域的占位提示（会被WebView覆盖） */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#999',
          pointerEvents: 'none' // 不影响点击穿透到WebView
        }}>
          右侧空白区域（WebView将覆盖此处）
        </div>
      </div>
    </div>
  );
};

export default WeiboLogin;
