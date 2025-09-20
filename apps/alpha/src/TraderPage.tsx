import React, { useEffect } from 'react';
import './TraderPage.css';

interface TabItem {
  symbol: string;
}

interface TraderPageProps {
  symbol: string;
  showBackButton: boolean;
  onBack: () => void;
  onAddTab: (symbol: string) => void;
  tabs: TabItem[];
  activeTab: string;
  onTabClick: (symbol: string) => void;
  onTabClose: (symbol: string) => void;
}

const TraderPage: React.FC<TraderPageProps> = ({ 
  symbol, 
  showBackButton, 
  onBack, 
  onAddTab,
  tabs,
  activeTab,
  onTabClick,
  onTabClose
}) => {
  // 确保首次进入时添加初始tab
  useEffect(() => {
    if (symbol && tabs.length === 0) {
      onAddTab(symbol);
    }
  }, [symbol, onAddTab, tabs.length]);

  return (
    <div className="trader-page">
      {/* 返回按钮 - 修复类名 */}
      {showBackButton && (
        <button className="back-btn" onClick={onBack}>
          ← 返回市场
        </button>
      )}
      
      {/* Tab栏 - 使用正确的类名 */}
      <div className="tabs-container">
        {tabs.map(tab => (
          <div
            key={tab.symbol}
            className={`tab-item ${activeTab === tab.symbol ? 'active' : ''}`}
            onClick={() => onTabClick(tab.symbol)}
          >
            <span>{tab.symbol}</span>
            <button 
              className="tab-close-btn" 
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.symbol);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      
      {/* 简化的内容区域 - 只显示当前交易对 */}
      <div className="trader-content">
        <div className="symbol-display">
          <h2>{symbol}</h2>
          <p>交易界面已简化，仅显示交易对信息</p>
        </div>
      </div>
    </div>
  );
};

export default TraderPage;