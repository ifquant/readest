import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams, Outlet } from 'react-router-dom';
import './App.css';
import Menu from './Menu';
import Toolbars from './Toolbars';
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

const App: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState<string>('bitcoin');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC/USDT');
  const [showTraderPage, setShowTraderPage] = useState<boolean>(false);
  const [showChartPage, setShowChartPage] = useState<boolean>(false);
  const [isDirectSymbolClick, setIsDirectSymbolClick] = useState<boolean>(false);
  const [timeframe, setTimeframe] = useState<string>('1D');
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [orderAmount, setOrderAmount] = useState<string>('');
  const [orderPrice, setOrderPrice] = useState<string>('');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('limit');
  const [marketData, setMarketData] = useState<MarketItem[]>([]);
  
  const navigate = useNavigate();
  
  // 模拟获取市场数据
  useEffect(() => {
    const fetchMarketData = () => {
      // 模拟API请求延迟
      setTimeout(() => {
        const mockData: MarketItem[] = [
          { id: 1, symbol: 'BTC/USDT', price: 42500.32, change: 2.45, volume: 1250.67 },
          { id: 2, symbol: 'ETH/USDT', price: 2250.67, change: -1.23, volume: 3200.45 },
          { id: 3, symbol: 'SOL/USDT', price: 120.45, change: 5.67, volume: 8500.23 },
          { id: 4, symbol: 'ADA/USDT', price: 0.56, change: -0.89, volume: 45000.78 },
          { id: 5, symbol: 'DOT/USDT', price: 7.89, change: 3.45, volume: 6200.34 },
        ];
        setMarketData(mockData);
      }, 500);
    };

    fetchMarketData();
    
    // 定期更新市场数据
    const interval = setInterval(fetchMarketData, 3000);

    return () => clearInterval(interval);
  }, [selectedSymbol, marketData]);

  // 下单处理函数
  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    // 这里可以添加下单逻辑
    alert(`已下单: ${orderSide === 'buy' ? '买入' : '卖出'} ${orderAmount} ${selectedSymbol.split('/')[0]}`);
    setOrderAmount('');
    if (orderType === 'limit') {
      setOrderPrice('');
    }
  };

  // 行情点击事件
  const handleSymbolClick = (symbol: string) => {
    setSelectedSymbol(symbol);
    setIsDirectSymbolClick(true); // 标记为直接点击合约
    
    // 导航到对应的交易页面
    const encodedSymbol = symbol.replace('/', '%2F');
    navigate(`/trade/${encodedSymbol}`);
  };

  // 跳转到交易页面
  const goToTraderPage = (symbol: string) => {
    setSelectedSymbol(symbol);
    setIsDirectSymbolClick(true); // 标记为直接点击合约
    navigate('/trade');
  };

  // 返回市场页面
  const handleBackToMarket = () => {
    setShowTraderPage(false);
    setShowChartPage(false);
    setIsDirectSymbolClick(false); // 重置标记
  };

  return (
    <div className="trading-app">
      {/* 顶部菜单栏 */}
      <Menu 
        setShowLoginModal={() => setShowLoginModal(true)}
        setShowSettingsModal={() => setShowSettingsModal(true)}
      />
      
      {/* 顶部工具栏 */}
      <Toolbars 
        showChartPage={showChartPage}
        timeframe={timeframe}
        setTimeframe={setTimeframe}
      />

      {/* 主内容区域 */}
      <div className="main-container">
        {/* 左侧竖向标签栏 */}
        <div className="vertical-tabs">
          <button 
            className={`tab-btn ${selectedTab === 'bitcoin' ? 'active' : ''}`}
            onClick={() => {
              setSelectedTab('bitcoin');
              setShowTraderPage(false);
              setShowChartPage(false);
              navigate('/market/bitcoin');
            }}
          >
            <span className="tab-icon">₿</span>
            <span className="tab-text">加密货币</span>
          </button>
          <button 
            className={`tab-btn ${selectedTab === 'stockFutures' ? 'active' : ''}`}
            onClick={() => {
              setSelectedTab('stockFutures');
              setShowTraderPage(false);
              setShowChartPage(false);
              navigate('/market/stockFutures');
            }}
          >
            <span className="tab-icon">📈</span>
            <span className="tab-text">股指期货</span>
          </button>
          <button 
            className={`tab-btn ${selectedTab === 'domesticFutures' ? 'active' : ''}`}
            onClick={() => {
              setSelectedTab('domesticFutures');
              setShowTraderPage(false);
              setShowChartPage(false);
              navigate('/market/domesticFutures');
            }}
          >
            <span className="tab-icon">🏛️</span>
            <span className="tab-text">国内期货</span>
          </button>
          <button 
            className={`tab-btn ${selectedTab === 'trade' ? 'active' : ''}`}
            onClick={() => {
              setSelectedTab('trade');
              setShowTraderPage(false);
              setShowChartPage(false);
              navigate('/trade');
            }}
          >
            <span className="tab-icon">💹</span>
            <span className="tab-text">交易执行</span>
          </button>
          <button 
            className={`tab-btn ${selectedTab === 'strategy' ? 'active' : ''}`}
            onClick={() => {
              setSelectedTab('strategy');
              setShowTraderPage(false);
              setShowChartPage(false);
            }}
          >
            <span className="tab-icon">🤖</span>
            <span className="tab-text">策略执行</span>
          </button>
        </div>

        {/* 右侧内容区域 - 使用Outlet来渲染路由子组件 */}
        <div className="content-area">
          <Outlet />
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="status-bar">
        <div className="status-left">
          <span className="status-item">服务器时间: {new Date().toLocaleTimeString()}</span>
          <span className="status-item">系统版本: v1.0.0</span>
          <div className="connection-status connected status-item">
            <span className="status-dot"></span>
            已连接
          </div>
        </div>
        <div className="status-right">
          <span className="status-item">内存使用率: 35%</span>
          <span className="status-item">延迟: 23ms</span>
        </div>
      </div>

      {/* 登录弹窗 */}
      {showLoginModal && (
        <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>用户登录</h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              setShowLoginModal(false);
            }}>
              <input type="text" placeholder="用户名" className="login-input" />
              <input type="password" placeholder="密码" className="login-input" />
              <button type="submit" className="login-btn">登录</button>
              <button type="button" className="cancel-btn" onClick={() => setShowLoginModal(false)}>取消</button>
            </form>
          </div>
        </div>
      )}

      {/* 设置弹窗 */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>系统设置</h2>
            <div className="settings-content">
              <div className="setting-item">
                <label>主题</label>
                <select defaultValue="light">
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                </select>
              </div>
              <div className="setting-item">
                <label>语言</label>
                <select defaultValue="zh">
                  <option value="zh">中文</option>
                  <option value="en">英文</option>
                </select>
              </div>
            </div>
            <button className="save-btn" onClick={() => setShowSettingsModal(false)}>保存</button>
            <button className="cancel-btn" onClick={() => setShowSettingsModal(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
