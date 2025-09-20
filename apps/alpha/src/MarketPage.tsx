import React, { useState } from 'react';

interface MarketDataItem {
  id: number;
  symbol: string;
  price: number;
  change: number;
  volume: number;
}

interface MarketPageProps {
  onSymbolSelect: (symbol: string) => void;
  onTradeClick: () => void;
  selectedSymbol: string;
  marketType: 'bitcoin' | 'stockFutures' | 'domesticFutures';
}

// 市场类型
type MarketType = 'bitcoin' | 'stockFutures' | 'domesticFutures';

const MarketPage: React.FC<MarketPageProps> = ({ onSymbolSelect, onTradeClick, selectedSymbol, marketType }) => {
  // 状态管理
  const [searchQuery, setSearchQuery] = useState('');

  // 模拟比特币市场数据
  const bitcoinMarketData: MarketDataItem[] = [
    { id: 1, symbol: 'BTC/USDT', price: 42500.32, change: 2.45, volume: 1250.67 },
    { id: 2, symbol: 'ETH/USDT', price: 2250.67, change: -1.23, volume: 3200.45 },
    { id: 3, symbol: 'SOL/USDT', price: 120.45, change: 5.67, volume: 8500.23 },
    { id: 4, symbol: 'ADA/USDT', price: 0.56, change: -0.89, volume: 45000.78 },
    { id: 5, symbol: 'DOT/USDT', price: 7.89, change: 3.45, volume: 6200.34 },
  ];

  // 模拟股指期货市场数据
  const stockFuturesMarketData: MarketDataItem[] = [
    { id: 6, symbol: 'ES/USD', price: 4750.25, change: 0.85, volume: 4250.32 },
    { id: 7, symbol: 'NQ/USD', price: 16200.45, change: -0.32, volume: 2800.67 },
    { id: 8, symbol: 'YM/USD', price: 37500.75, change: 0.56, volume: 1950.43 },
    { id: 9, symbol: 'RTY/USD', price: 1950.65, change: -0.21, volume: 3100.89 },
    { id: 10, symbol: 'VX/USD', price: 18.75, change: 1.23, volume: 5200.45 },
  ];

  // 模拟国内期货市场数据
  const domesticFuturesMarketData: MarketDataItem[] = [
    { id: 11, symbol: 'CU/CNY', price: 65000.00, change: 1.56, volume: 3800.67 },
    { id: 12, symbol: 'RB/CNY', price: 3850.00, change: -0.45, volume: 12500.32 },
    { id: 13, symbol: 'A/CNY', price: 3200.00, change: 0.89, volume: 8600.45 },
    { id: 14, symbol: 'M/CNY', price: 3650.00, change: -0.67, volume: 7200.89 },
    { id: 15, symbol: 'RU/CNY', price: 13200.00, change: 1.12, volume: 4500.34 },
  ];

  // 根据当前市场类型获取数据
  const getCurrentMarketData = () => {
    switch (marketType) {
      case 'stockFutures':
        return stockFuturesMarketData;
      case 'domesticFutures':
        return domesticFuturesMarketData;
      case 'bitcoin':
      default:
        return bitcoinMarketData;
    }
  };

  // 过滤搜索结果
  const filteredMarketData = getCurrentMarketData().filter(item => 
    item.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 获取市场类型对应的标题
  const getMarketTitle = () => {
    switch (marketType) {
      case 'stockFutures':
        return '股指期货行情';
      case 'domesticFutures':
        return '国内期货行情';
      case 'bitcoin':
      default:
        return '比特币行情';
    }
  };

  return (
    <div className="market-page">
      <div className="page-header">
        <div className="search-box">
          <input 
            type="text" 
            placeholder="搜索交易对..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
          />
          <button className="search-btn">🔍</button>
        </div>
      </div>
      
      <div className="current-market-title">
        <h3>{getMarketTitle()}</h3>
      </div>
      
      <div className="market-data">
        <div className="market-header-row">
          <span className="col-symbol">交易对</span>
          <span className="col-price">最新价格</span>
          <span className="col-change">24h涨跌</span>
          <span className="col-high">最高价</span>
          <span className="col-low">最低价</span>
          <span className="col-volume">成交量</span>
          <span className="col-actions">操作</span>
        </div>
        
        {filteredMarketData.map(item => (
          <div 
            key={item.id} 
            className={`market-row ${selectedSymbol === item.symbol ? 'selected' : ''}`}
            onClick={() => onSymbolSelect(item.symbol)}
          >
            <span className="col-symbol">{item.symbol}</span>
            <span className="col-price">${item.price.toFixed(2)}</span>
            <span className={item.change >= 0 ? 'col-change positive' : 'col-change negative'}>
              {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
            </span>
            <span className="col-high">${(item.price * (1 + Math.abs(item.change) / 100)).toFixed(2)}</span>
            <span className="col-low">${(item.price * (1 - Math.abs(item.change) / 100)).toFixed(2)}</span>
            <span className="col-volume">${item.volume.toFixed(2)}</span>
            <span className="col-actions">
              <button 
                className="quick-trade-btn" 
                onClick={(e) => {
                  e.stopPropagation();
                  onTradeClick();
                }}
              >
                交易
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MarketPage;