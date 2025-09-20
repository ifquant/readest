import React, { useState, useEffect } from 'react';
import ChartPage from './ChartPage';
import QuotePage from './QuotePage';
import './TraderPage.css';

interface TraderPageProps {
  symbol: string;
  onBack: () => void;
}

const TraderPage: React.FC<TraderPageProps> = ({ symbol, onBack }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // 模拟加载数据
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [symbol]);

  // 实时更新时间
  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timeInterval);
  }, []);

  if (isLoading) {
    return (
      <div className="trader-page">
        <div className="page-header">
          <button className="back-btn" onClick={onBack}>← 返回</button>
          <h2>{symbol} - 加载中...</h2>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>正在加载交易页面数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="trader-page">
      {/* 页面头部 */}
      <div className="page-header">
        <button className="back-btn" onClick={onBack}>← 返回</button>
        <h2>{symbol} 交易页面</h2>
        <div className="current-time">
          {currentTime.toLocaleTimeString()}
        </div>
      </div>

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