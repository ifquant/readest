// @ts-nocheck
import React from 'react';
import './TraderPages.css';

interface TabItem {
  symbol: string;
}

interface TradePagesProps {
  tabs: TabItem[];
  activeTab: string;
  onTabClick: (symbol: string) => void;
  onTabClose: (symbol: string) => void;
  onAddTab: (symbol: string) => void;
}

// 每个tab的内容组件
const TabContent: React.FC<{ symbol: string }> = ({ symbol }) => {
  // 生成随机涨跌值
  const priceChangeValue = Math.random() * 10 - 5;
  const isPositive = priceChangeValue >= 0;
  
  return (
    <div className="contract-content">
      <h2>{symbol || '选择合约'}</h2>
      <div className="contract-detail">
        <div className="price-info">
          <p className="current-price">当前价格: ${(Math.random() * 10000).toFixed(2)}</p>
          <p className={`price-change ${isPositive ? 'positive' : 'negative'}`}>
            涨跌: {isPositive ? '+' : ''}{priceChangeValue.toFixed(2)}%
          </p>
        </div>
        <div className="order-form">
          <h3>下单2222</h3>
          <div className="order-type">
            <button className="active">限价</button>
            <button>市价</button>
            <button>止盈止损</button>
          </div>
          <div className="order-amount">
            <label>数量:</label>
            <input type="number" placeholder="请输入数量" />
          </div>
          <div className="order-price">
            <label>价格:</label>
            <input type="number" placeholder="请输入价格" />
          </div>
          <div className="order-buttons">
            <button className="buy-btn">买入</button>
            <button className="sell-btn">卖出</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const TradePages: React.FC<TradePagesProps> = ({ 
  tabs, 
  activeTab, 
  onTabClick, 
  onTabClose, 
  onAddTab 
}) => {
  return (
    <div className="trader-page">
      {/* Tab栏 */}
      <div className="tabs-container">
        {tabs.map(tab => (
          <div
            key={tab.symbol}
            className={`tab-item ${activeTab === tab.symbol ? 'active' : ''}`}
            onClick={() => onTabClick(tab.symbol)}
          >
            <span>{tab.symbol}</span>
            <button 
              className="close-btn"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.symbol);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button className="add-tab-btn" onClick={() => onAddTab('BTC/USDT')}>
          +
        </button>
      </div>

      {/* 直接渲染每个tab的内容 */}
      {tabs.map(tab => (
        <div
          key={tab.symbol}
          style={{
            display: activeTab === tab.symbol ? 'block' : 'none',
            width: '100%'
          }}
        >
          <TabContent symbol={tab.symbol} />
        </div>
      ))}
    </div>
  );
};

export default TradePages;