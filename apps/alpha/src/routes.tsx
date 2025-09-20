import React, { useState, useEffect } from 'react';
import { createBrowserRouter, useNavigate, useParams } from 'react-router-dom';
import App from './App';
import MarketPage from './MarketPage';
import TradePages from './TradePages';
import ChartPage from './ChartPage';
import Trader from './Trader';

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
  // 状态管理
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USDT');
  // 存储所有打开的tabs
  const [tabs, setTabs] = useState<TabItem[]>([]);
  // 当前激活的tab
  const [activeTab, setActiveTab] = useState<string>('');
  
  // 获取URL参数
  const params = useParams<{ symbol?: string }>();

  // 模拟数据
  const marketData: MarketItem[] = [
    { id: 1, symbol: 'BTC/USDT', price: 42500.32, change: 2.45, volume: 1250.67 },
    { id: 2, symbol: 'ETH/USDT', price: 2250.67, change: -1.23, volume: 3200.45 },
    { id: 3, symbol: 'SOL/USDT', price: 120.45, change: 5.67, volume: 8500.23 },
    { id: 4, symbol: 'ADA/USDT', price: 0.56, change: -0.89, volume: 45000.78 },
    { id: 5, symbol: 'DOT/USDT', price: 7.89, change: 3.45, volume: 6200.34 },
  ];

  // 初始化时添加默认tab
  useEffect(() => {
    let defaultSymbol = selectedSymbol;
    
    // 如果URL中有symbol参数，使用该参数并进行解码
    if (params.symbol && params.symbol !== selectedSymbol) {
      defaultSymbol = decodeURIComponent(params.symbol);
    }

    if (tabs.length === 0) {
      setTabs([{ symbol: defaultSymbol }]);
      setActiveTab(defaultSymbol);
    }
  }, [params.symbol, selectedSymbol, tabs.length]);

  // 添加新的tab
  const addTab = (symbol: string) => {
    if (!tabs.some(tab => tab.symbol === symbol)) {
      // 如果当前合约不存在，则添加新tab
      setTabs(prevTabs => [...prevTabs, { symbol }]);
    }
    setActiveTab(symbol);
    setSelectedSymbol(symbol);
  };

  // 切换tab
  const handleTabClick = (symbol: string) => {
    setActiveTab(symbol);
    setSelectedSymbol(symbol);
  };

  // 关闭tab
  const handleTabClose = (symbolToClose: string) => {
    if (tabs.length <= 1) return; // 至少保留一个tab
    
    const newTabs = tabs.filter(tab => tab.symbol !== symbolToClose);
    setTabs(newTabs);
    
    // 如果关闭的是当前激活的tab，则激活第一个tab
    if (activeTab === symbolToClose) {
      setActiveTab(newTabs[0].symbol);
      setSelectedSymbol(newTabs[0].symbol);
    }
  };

  return (
    <TradePages 
      tabs={tabs}
      activeTab={activeTab}
      onTabClick={handleTabClick}
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