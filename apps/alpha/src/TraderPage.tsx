import React, { useState, useEffect } from 'react';
import ChartPage from './ChartPage';
import QuotePage from './QuotePage';
import './TraderPage.css';

interface TraderPageProps {
  symbol: string;
  onBack: () => void;
  showBackButton?: boolean;
}

const TraderPage: React.FC<TraderPageProps> = ({ symbol, onBack, showBackButton = true }) => {
  const [isLoading, setIsLoading] = useState(true);

  // 模拟加载数据
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [symbol]);

  if (isLoading) {
    return (
      <div className="trader-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>正在加载交易页面数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="trader-page">
      {/* 交易页面主内容区 */}
      <div className="trader-content">
        {/* 左侧图表区域 */}
        <div className="chart-section">
          <ChartPage symbol={symbol} onBackClick={onBack} />
        </div>

        {/* 右侧盘口信息区域 */}
        <div className="quote-section">
          <QuotePage symbol={symbol} />
        </div>
      </div>
    </div>
  );
};

export default TraderPage;