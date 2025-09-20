import React from 'react';
import './App.css';

interface ToolbarsProps {
  showChartPage: boolean;
  timeframe: string;
  setTimeframe: (timeframe: string) => void;
}

const Toolbars: React.FC<ToolbarsProps> = ({
  showChartPage,
  timeframe,
  setTimeframe
}) => {
  return (
    <div className="toolbar">
      <h1 className="app-title">博弈大师交易系统</h1>
      
      <button className="toolbar-btn">行情</button>
      <button className="toolbar-btn">分析</button>
      <button className="toolbar-btn">工具</button>
      <button className="toolbar-btn">帮助</button>
      
      <select 
        className="timeframe-dropdown"
        value={timeframe}
        onChange={(e) => setTimeframe(e.target.value)}
      >
        <option value="15m">15分钟</option>
        <option value="1h">1小时</option>
        <option value="4h">4小时</option>
        <option value="1d">1天</option>
      </select>
      
    </div>
  );
};

export default Toolbars;