import React, { useState, useEffect } from 'react';
import MarketPage from './MarketPage';
import TraderPage from './TraderPage';
import ChartPage from './ChartPage';
import Toolbars from './Toolbars';
import Menu from './Menu';
import Trader from './Trader';
import './App.css';

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

interface Asset {
  id: string;
  symbol: string;
  balance: number;
  available: number;
  frozen: number;
}

function App() {
  // 状态管理
  const [selectedTab, setSelectedTab] = useState<'bitcoin' | 'stockFutures' | 'domesticFutures' | 'trade' | 'orders' | 'strategy'>('bitcoin');
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USDT');
  const [currentPrice, setCurrentPrice] = useState(42500.32);
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'limit' | 'market' | 'stop'>('limit');
  const [orderPrice, setOrderPrice] = useState('');
  const [orderAmount, setOrderAmount] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showChartPage, setShowChartPage] = useState(false);
  const [showTraderPage, setShowTraderPage] = useState(false);
  const [timeframe, setTimeframe] = useState<string>('15m');
  const [showHistoryOrders, setShowHistoryOrders] = useState(false);

  // 模拟数据
  const marketData: MarketItem[] = [
    { id: 1, symbol: 'BTC/USDT', price: 42500.32, change: 2.45, volume: 1250.67 },
    { id: 2, symbol: 'ETH/USDT', price: 2250.67, change: -1.23, volume: 3200.45 },
    { id: 3, symbol: 'SOL/USDT', price: 120.45, change: 5.67, volume: 8500.23 },
    { id: 4, symbol: 'ADA/USDT', price: 0.56, change: -0.89, volume: 45000.78 },
    { id: 5, symbol: 'DOT/USDT', price: 7.89, change: 3.45, volume: 6200.34 },
  ];

  const openOrders: Order[] = [
    { id: '1', symbol: 'BTC/USDT', type: 'Limit', price: 42000, amount: 0.02, status: 'Open', timestamp: '12:34:56' },
    { id: '2', symbol: 'ETH/USDT', type: 'Market', price: 0, amount: 1.5, status: 'Processing', timestamp: '12:33:45' },
  ];

  const orderHistory: Order[] = [
    { id: '3', symbol: 'SOL/USDT', type: 'Limit', price: 118.5, amount: 10, status: 'Filled', timestamp: '12:30:23' },
    { id: '4', symbol: 'BTC/USDT', type: 'Limit', price: 43000, amount: 0.01, status: 'Canceled', timestamp: '12:25:12' },
  ];

  const assetsData: Asset[] = [
    { id: '1', symbol: 'BTC', balance: 0.5, available: 0.5, frozen: 0 },
    { id: '6', symbol: 'ETH', balance: 5, available: 4.5, frozen: 0.5 },
    { id: '7', symbol: 'USDT', balance: 10000, available: 9500, frozen: 500 },
  ];

  // 价格实时变动模拟
  useEffect(() => {
    const interval = setInterval(() => {
      const currentSymbolData = marketData.find(item => item.symbol === selectedSymbol);
      if (currentSymbolData) {
        const change = (Math.random() - 0.5) * 10;
        setCurrentPrice(prev => parseFloat((prev + change).toFixed(2)));
      }
    }, 3000);

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
  };

  // 跳转到交易页面
  const goToTraderPage = (symbol: string) => {
    setSelectedSymbol(symbol);
    setShowTraderPage(true);
  };

  // 返回市场页面
  const handleBackToMarket = () => {
    setShowTraderPage(false);
    setShowChartPage(false);
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
            onClick={() => setSelectedTab('bitcoin')}
          >
            <span className="tab-icon">₿</span>
            <span className="tab-text">加密货币</span>
          </button>
          <button 
            className={`tab-btn ${selectedTab === 'stockFutures' ? 'active' : ''}`}
            onClick={() => setSelectedTab('stockFutures')}
          >
            <span className="tab-icon">📈</span>
            <span className="tab-text">股指期货</span>
          </button>
          <button 
            className={`tab-btn ${selectedTab === 'domesticFutures' ? 'active' : ''}`}
            onClick={() => setSelectedTab('domesticFutures')}
          >
            <span className="tab-icon">🏛️</span>
            <span className="tab-text">国内期货</span>
          </button>
          <button 
            className={`tab-btn ${selectedTab === 'trade' ? 'active' : ''}`}
            onClick={() => setSelectedTab('trade')}
          >
            <span className="tab-icon">💹</span>
            <span className="tab-text">交易执行</span>
          </button>
          <button 
            className={`tab-btn ${selectedTab === 'strategy' ? 'active' : ''}`}
            onClick={() => setSelectedTab('strategy')}
          >
            <span className="tab-icon">🤖</span>
            <span className="tab-text">策略执行</span>
          </button>
        </div>

        {/* 右侧内容区域 */}
        <div className="content-area">
          {showChartPage ? (
            <ChartPage 
              symbol={selectedSymbol} 
              onBackClick={handleBackToMarket} 
              timeframe={timeframe}
            />
          ) : showTraderPage ? (
            <TraderPage 
              symbol={selectedSymbol} 
              onBack={handleBackToMarket} 
            />
          ) : (
            <>
              {/* 比特币行情页面 */}
              {selectedTab === 'bitcoin' && (
                <MarketPage 
                  onSymbolSelect={goToTraderPage} 
                  onTradeClick={() => setSelectedTab('trade')} 
                  selectedSymbol={selectedSymbol} 
                  marketType="bitcoin"
                />
              )}
              
              {/* 股指期货行情页面 */}
              {selectedTab === 'stockFutures' && (
                <MarketPage 
                  onSymbolSelect={goToTraderPage} 
                  onTradeClick={() => setSelectedTab('trade')} 
                  selectedSymbol={selectedSymbol} 
                  marketType="stockFutures"
                />
              )}
              
              {/* 国内期货行情页面 */}
              {selectedTab === 'domesticFutures' && (
                <MarketPage 
                  onSymbolSelect={goToTraderPage} 
                  onTradeClick={() => setSelectedTab('trade')} 
                  selectedSymbol={selectedSymbol} 
                  marketType="domesticFutures"
                />
              )}
              
              {/* 交易执行页面 */}
              {selectedTab === 'trade' && (
                <Trader 
                  marketData={marketData} 
                  openOrders={openOrders} 
                  orderHistory={orderHistory} 
                  currentPrice={currentPrice} 
                />
              )}
              
              {/* 策略执行页面 - 合并订单和策略功能 */}
              {selectedTab === 'strategy' && (
                <div className="strategy-page">
                  <div className="page-header">
                    <h2>策略执行</h2>
                  </div>
                  
                  <div className="strategy-tabs">
                    <button className="strategy-tab active">策略管理</button>
                    <button className="strategy-tab">订单管理</button>
                  </div>
                  
                  <div className="strategy-content">
                    <div className="strategy-placeholder">
                      <p>策略管理功能正在开发中...</p>
                      <p>即将支持：</p>
                      <ul>
                        <li>策略创建与编辑</li>
                        <li>策略回测</li>
                        <li>策略部署</li>
                        <li>策略监控</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
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
          <span className="status-item">网络延迟: 25ms</span>
          <span className="status-item">内存使用率: 45%</span>
        </div>
      </div>

      {/* 登录模态框 */}
      {showLoginModal && (
        <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>用户登录</h2>
              <button 
                className="close-btn" 
                onClick={() => setShowLoginModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={(e) => e.preventDefault()}>
                <div className="form-group">
                  <label htmlFor="username">用户名</label>
                  <input 
                    type="text" 
                    id="username" 
                    placeholder="请输入用户名"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="password">密码</label>
                  <input 
                    type="password" 
                    id="password" 
                    placeholder="请输入密码"
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn-primary">登录</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 设置模态框 */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>系统设置</h2>
              <button 
                className="close-btn" 
                onClick={() => setShowSettingsModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>设置功能正在开发中...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
