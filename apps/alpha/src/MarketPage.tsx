import React, { useState, useEffect, useRef } from 'react';

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
  const [showSearchPopup, setShowSearchPopup] = useState(false);
  const [searchResults, setSearchResults] = useState<MarketDataItem[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

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

  // 处理搜索输入变化
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    if (value.trim() !== '') {
      setShowSearchPopup(true);
      const results = getCurrentMarketData().filter(item => 
        item.symbol.toLowerCase().includes(value.toLowerCase())
      );
      setSearchResults(results);
    } else {
      setShowSearchPopup(false);
    }
  };

  // 处理搜索结果选择
  const handleResultSelect = (symbol: string) => {
    setSearchQuery(symbol);
    setShowSearchPopup(false);
    onSymbolSelect(symbol);
  };

  // 处理点击外部关闭弹窗
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setShowSearchPopup(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 添加全局键盘事件监听，实现输入时自动弹出搜索框
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 检查页面是否处于活动状态，且没有其他输入框被聚焦
      const isPageActive = document.activeElement === document.body || 
                          (pageRef.current && pageRef.current.contains(document.activeElement));
      
      // 只处理字母、数字、点号和斜杠（交易对中常用的字符）
      const isSearchableKey = /^[a-zA-Z0-9./]$/.test(event.key);
      
      if (isPageActive && isSearchableKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        
        // 如果弹窗未显示，初始化搜索
        if (!showSearchPopup) {
          setShowSearchPopup(true);
          // 延迟设置焦点和值，确保弹窗已经渲染
          setTimeout(() => {
            if (searchInputRef.current) {
              searchInputRef.current.focus();
              setSearchQuery(event.key);
              
              // 过滤结果
              const results = getCurrentMarketData().filter(item => 
                item.symbol.toLowerCase().includes(event.key.toLowerCase())
              );
              setSearchResults(results);
            }
          }, 10);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showSearchPopup, marketType]);

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
    <div className="market-page" ref={pageRef}>
      {/* 搜索弹窗 */}
      {showSearchPopup && (
        <div className="search-popup" ref={popupRef}>
          <div className="search-popup-input-wrapper">
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="搜索交易对..." 
              value={searchQuery} 
              onChange={handleSearchChange}
              autoFocus
            />
            <button 
              className="search-popup-close-btn" 
              onClick={() => setShowSearchPopup(false)}
            >
              ✕
            </button>
          </div>
          <div className="search-popup-results">
            {searchResults.length > 0 ? (
              searchResults.map(item => (
                <div 
                  key={item.id} 
                  className={`search-popup-item ${selectedSymbol === item.symbol ? 'selected' : ''}`}
                  onClick={() => handleResultSelect(item.symbol)}
                >
                  <div className="search-popup-symbol">{item.symbol}</div>
                  <div className="search-popup-price">${item.price.toFixed(2)}</div>
                  <div className={item.change >= 0 ? 'search-popup-change positive' : 'search-popup-change negative'}>
                    {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
                  </div>
                </div>
              ))
            ) : (
              <div className="search-popup-no-results">没有找到匹配的交易对</div>
            )}
          </div>
        </div>
      )}
      
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