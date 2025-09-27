import React, { useState, useEffect } from 'react';
import { createBrowserRouter, useNavigate, useParams } from 'react-router-dom';
import App from './App';
import MarketPage from './MarketPage';
import TradePages from './TradePages';
import ChartPage from './ChartPage';
import Trader from './Trader';
import { useTabContext } from './context/TabContext';
import { KeepAlive } from 'react-activation';

// 定义数据接口
interface MarketItem {
  id: number;
  symbol: string;
  price: number;
  change: number;
  volume: number;
}

interface Order {
  id: string;
  symbol: string;
  type: string;
  price: number;
  amount: number;
  status: string;
  timestamp: string;
}

// Tab数据类型定义
interface TabItem {
  symbol: string;
}

// 交易页面的布局组件
const TradeLayout: React.FC = () => {
  // 使用全局TabContext管理tabs状态
  const { tabs, activeTab, selectedSymbol, addTab, handleTabClick, handleTabClose } = useTabContext();
  
  // 获取URL参数
  const params = useParams<{ symbol?: string }>();
  const navigate = useNavigate();

  // 模拟数据
  const marketData: MarketItem[] = [
    { id: 1, symbol: 'BTC/USDT', price: 42500.32, change: 2.45, volume: 1250.67 },
    { id: 2, symbol: 'ETH/USDT', price: 2250.67, change: -1.23, volume: 3200.45 },
    { id: 3, symbol: 'SOL/USDT', price: 120.45, change: 5.67, volume: 8500.23 },
    { id: 4, symbol: 'ADA/USDT', price: 0.56, change: -0.89, volume: 45000.78 },
    { id: 5, symbol: 'DOT/USDT', price: 7.89, change: 3.45, volume: 6200.34 },
  ];

  // 使用单一的状态同步effect，避免循环
  useEffect(() => {
    // 只在初始化或从外部导航来时处理URL参数
    if (params.symbol) {
      const decodedSymbol = decodeURIComponent(params.symbol);
      
      // 检查是否需要更新状态
      const shouldUpdateState = tabs.length === 0 || 
                               !tabs.some(tab => tab.symbol === decodedSymbol) ||
                               decodedSymbol !== activeTab;
      
      if (shouldUpdateState) {
        // 避免在用户主动点击标签页时触发循环
        if (!tabs.some(tab => tab.symbol === decodedSymbol)) {
          // 这是一个新的symbol，添加tab
          addTab(decodedSymbol);
        } else if (decodedSymbol !== activeTab) {
          // symbol已存在但不是当前激活的，直接切换
          handleTabClick(decodedSymbol);
        }
      }
    } else if (tabs.length > 0 && activeTab) {
      // 如果URL没有参数但有activeTab，在初始化时更新URL一次
      const encodedSymbol = activeTab.replace('/', '%2F');
      navigate(`/trade/${encodedSymbol}`, { replace: true });
    } else if (tabs.length === 0) {
      // 如果没有任何标签页，添加默认标签页
      addTab('BTC/USDT');
    }
    
    // 重要：移除activeTab和isNavigating作为依赖，避免循环触发
  }, [params.symbol, tabs.length, tabs, addTab]); // 只依赖必要的参数

  // 这个effect只用于初始化，不参与循环
  useEffect(() => {
    // 确保在没有URL参数但有activeTab时，URL保持同步
    if (activeTab && params.symbol) {
      const decodedSymbol = decodeURIComponent(params.symbol);
      if (decodedSymbol !== activeTab) {
        // 但不在这里执行导航，而是在用户交互时处理
        console.log('URL和activeTab不同步，但避免自动导航以防止循环');
      }
    }
  }, [activeTab, params.symbol]);

  // 覆盖默认的handleTabClick，添加防循环逻辑
  const safeHandleTabClick = (symbol: string) => {
    // 直接调用原始函数切换标签页
    handleTabClick(symbol);
    
    // 手动更新URL，但不依赖useEffect触发
    const encodedSymbol = symbol.replace('/', '%2F');
    navigate(`/trade/${encodedSymbol}`, { replace: true });
  };

  return (
    <TradePages 
      key={activeTab} // 添加key属性，确保activeTab变化时重新渲染
      tabs={tabs}
      activeTab={activeTab}
      onTabClick={safeHandleTabClick} // 使用安全的点击处理函数
      onTabClose={handleTabClose}
      onAddTab={addTab}
    />
  );
};

// 创建MarketPage的包装组件，提供导航功能
const MarketPageWithNavigation: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ type?: string }>();
  
  // 获取市场类型，默认为bitcoin
  const marketType = (params.type as 'bitcoin' | 'stockFutures' | 'domesticFutures') || 'bitcoin';
  
  // 处理合约选择
  const handleSymbolSelect = (symbol: string) => {
    // 导航到交易页面，并将选择的合约作为URL参数
    // 对包含斜杠的合约符号进行编码
    const encodedSymbol = symbol.replace('/', '%2F');
    console.log("navigate 111", encodedSymbol)
    navigate(`/trade/${encodedSymbol}`);
  };
  
  // 处理交易按钮点击
  const handleTradeClick = () => {
    navigate('/trade');
  };
  
  return (
    <MarketPage 
      onSymbolSelect={handleSymbolSelect}
      onTradeClick={handleTradeClick}
      selectedSymbol="BTC/USDT"
      marketType={marketType}
    />
  );
};

// 图表页面包装组件
const ChartPageWithParams: React.FC = () => {
  const params = useParams<{ symbol?: string }>();
  const navigate = useNavigate();
  
  // 解码URL参数中的符号
  const symbol = params.symbol ? decodeURIComponent(params.symbol) : "BTC/USDT";
  
  return (
    <ChartPage 
      symbol={symbol}
      onBackClick={() => navigate(-1)}
      timeframe="15m"
    />
  );
};

// 创建路由配置
// 使用路径参数的正则表达式匹配，允许包含斜杠的符号
const tradeRouteWithSymbol = {
  path: '/trade/:symbol',
  element: <TradeLayout />,
  // 定义参数匹配的正则表达式，允许包含斜杠
  id: 'tradeWithSymbol'
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        path: '/',
        element: <MarketPageWithNavigation />,
      },
      {
        path: '/market/:type',
        element: <MarketPageWithNavigation />,
      },
      {
        path: '/trade',
        element: <TradeLayout />,
      },
      tradeRouteWithSymbol,
      {
        path: '/chart/:symbol',
        element: <ChartPageWithParams />,
        id: 'chartWithSymbol'
      },
      {
        path: '/trader',
        element: (
          <Trader 
            marketData={[
              { id: 1, symbol: 'BTC/USDT', price: 42500.32, change: 2.45, volume: 1250.67 },
              { id: 2, symbol: 'ETH/USDT', price: 2250.67, change: -1.23, volume: 3200.45 },
              { id: 3, symbol: 'SOL/USDT', price: 120.45, change: 5.67, volume: 8500.23 },
            ]}
            openOrders={[
              { id: '1', symbol: 'BTC/USDT', type: 'limit', price: 42000, amount: 0.02, status: 'open', timestamp: '2024-01-15T10:30:00Z' },
              { id: '2', symbol: 'ETH/USDT', type: 'limit', price: 2200, amount: 1, status: 'open', timestamp: '2024-01-15T09:15:00Z' },
            ]}
            orderHistory={[
              { id: '3', symbol: 'SOL/USDT', type: 'market', price: 120, amount: 5, status: 'filled', timestamp: '2024-01-15T08:45:00Z' },
              { id: '4', symbol: 'BTC/USDT', type: 'limit', price: 41800, amount: 0.03, status: 'canceled', timestamp: '2024-01-15T07:30:00Z' },
            ]}
            currentPrice={42500}
          />
        ),
      },
    ],
    // 添加错误处理
    errorElement: (
      <div className="error-page">
        <h1>页面未找到</h1>
        <p>您访问的页面不存在或已被移动</p>
        <button onClick={() => window.location.href = '/'}>返回首页</button>
      </div>
    )
  },
]);

// 导出路由组件类型以供其他组件使用
export type RouteParams = {
  symbol?: string;
  type?: string;
};