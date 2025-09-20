import React, { useState, useEffect } from 'react';
import ChartPage from './ChartPage';
import QuotePage from './QuotePage';
import './TraderPage.css';

// Tab数据类型定义
interface TabItem {
  symbol: string;
  // 可以添加其他需要的信息，如加载状态等
}

interface TraderPageProps {
  symbol: string;
  onBack: () => void;
  showBackButton?: boolean;
  tabs: TabItem[];
  activeTab: string;
  onTabClick: (symbol: string) => void;
  onTabClose: (symbol: string) => void;
  onAddTab: (symbol: string) => void;
}

const TraderPage: React.FC<TraderPageProps> = ({ 
  symbol, 
  onBack, 
  showBackButton = false, 
  tabs, 
  activeTab, 
  onTabClick, 
  onTabClose, 
  onAddTab 
}) => {
  // 使用useEffect来确保当首次进入TraderPage时至少有一个tab
  useEffect(() => {
    if (tabs.length === 0 && symbol) {
      onAddTab(symbol);
    }
  }, [symbol, tabs.length, onAddTab]);

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
            <span className="tab-label">{tab.symbol}</span>
            {tabs.length > 1 && (
              <button 
                className="tab-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.symbol);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 交易页面主内容区 */}
      <div className="trader-content">
        {activeTab && (
          <>
            {/* 左侧图表区域 */}
            <div className="chart-section">
              <ChartPage symbol={activeTab} onBackClick={onBack} />
            </div>

            {/* 右侧盘口信息区域 */}
            <div className="quote-section">
              <QuotePage symbol={activeTab} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TraderPage;