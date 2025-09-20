import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
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

const TradePages: React.FC<TradePagesProps> = ({ 
  tabs,
  activeTab,
  onTabClick,
  onTabClose,
  onAddTab
}) => {
  const params = useParams<{ symbol?: string }>();

  // 确保首次进入时添加初始tab
  useEffect(() => {
    if (params.symbol && !tabs.some(tab => tab.symbol === params.symbol)) {
      onAddTab(params.symbol);
    }
  }, [params.symbol, onAddTab, tabs]);

  // 当URL中的symbol参数变化时，更新当前选中的tab
  useEffect(() => {
    if (params.symbol && params.symbol !== activeTab) {
      onTabClick(params.symbol);
    }
  }, [params.symbol, activeTab, onTabClick]);

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

      {/* 合约内容区域 */}
      <div className="contract-content">
        <h2>{activeTab || '选择合约'}</h2>
        <div className="contract-detail">
          <div className="price-info">
            <p className="current-price">当前价格: $0.00</p>
            <p className="price-change">涨跌: 0.00%</p>
          </div>
          <div className="order-form">
            <h3>下单</h3>
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
    </div>
  );
};

export default TradePages;