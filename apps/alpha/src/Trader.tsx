import React, { useState } from 'react';
import './Trader.css';

// 内联样式以解决表格文字颜色问题
const style = document.createElement('style');
style.textContent = `
  /* 订单管理表格样式 */
  .orders-table, .positions-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
    color: #000000 !important;
  }
  
  .orders-table th, .positions-table th {
    background-color: #f2f2f2;
    padding: 10px;
    text-align: left;
    font-weight: bold;
    color: #000000 !important;
  }
  
  .orders-table td, .positions-table td {
    padding: 10px;
    border-bottom: 1px solid #e0e0e0;
    color: #000000 !important;
  }
  
  .orders-table tr:hover, .positions-table tr:hover {
    background-color: #f5f5f5;
  }
  
  .no-data {
    text-align: center;
    color: #666666 !important;
    padding: 20px !important;
  }
  
  /* 状态标签样式 */
  .status-open {
    color: #2196F3 !important;
  }
  
  .status-filled {
    color: #4CAF50 !important;
  }
  
  .status-canceled {
    color: #f44336 !important;
  }
  
  .status-partial {
    color: #FFC107 !important;
  }
  
  /* 持仓类型样式 */
  .position-type-long {
    color: #4CAF50 !important;
  }
  
  .position-type-short {
    color: #f44336 !important;
  }
  
  /* 盈亏样式 */
  .profit-positive {
    color: #4CAF50 !important;
  }
  
  .profit-negative {
    color: #f44336 !important;
  }
  
  /* 按钮样式 */
  .cancel-order-btn, .close-position-btn {
    background-color: #f44336;
    color: white !important;
    border: none;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .cancel-order-btn:hover, .close-position-btn:hover {
    background-color: #d32f2f;
  }
`;

document.head.appendChild(style);

interface Order {
  id: string;
  symbol: string;
  type: string;
  price: number;
  amount: number;
  status: string;
  timestamp: string;
}

interface Position {
  id: string;
  symbol: string;
  side: string;
  price: number;
  amount: number;
  profit: number;
  status: string;
}

interface MarketDataItem {
  id: number;
  symbol: string;
  price: number;
  change: number;
  volume: number;
}

interface TraderProps {
  marketData: MarketDataItem[];
  openOrders: Order[];
  orderHistory: Order[];
  currentPrice: number;
}

const Trader: React.FC<TraderProps> = ({ marketData, openOrders, orderHistory, currentPrice }) => {
  // 状态管理
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USDT');
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [orderPrice, setOrderPrice] = useState('');
  const [orderAmount, setOrderAmount] = useState('');
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [showPositionDetails, setShowPositionDetails] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [strategyName, setStrategyName] = useState('');
  const [strategyType, setStrategyType] = useState<string>('');
  const [strategyParams, setStrategyParams] = useState({});
  const [activeTradingView, setActiveTradingView] = useState<'orders' | 'positions' | 'strategy'>('orders');

  // 处理下单
  const handlePlaceOrder = () => {
    // 实现下单逻辑
    console.log('Placing order:', {
      symbol: selectedSymbol,
      type: orderType,
      side: orderSide,
      price: orderPrice,
      amount: orderAmount
    });
    
    // 重置表单
    setOrderPrice('');
    setOrderAmount('');
  };

  // 处理取消订单
  const handleCancelOrder = (orderId: string) => {
    // 实现取消订单逻辑
    console.log('Canceling order:', orderId);
  };

  // 处理策略创建
  const handleCreateStrategy = () => {
    // 实现策略创建逻辑
    console.log('Creating strategy:', {
      name: strategyName,
      type: strategyType,
      params: strategyParams
    });
    
    // 重置表单
    setStrategyName('');
    setStrategyType('');
    setStrategyParams({});
  };

  // 格式化时间戳
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="trader-page">
      {/* 顶部状态栏 */}
      <div className="trader-header">
        <div className="trader-title">交易执行</div>
        <div className="trader-info">
          <span className="current-price">当前价格: ${currentPrice.toLocaleString()}</span>
          <span className="connection-status">已连接</span>
        </div>
      </div>
      
      {/* 交易对选择器 */}
      <div className="symbol-selector">
        <select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)}>
          {marketData.length > 0 ? (
            marketData.map(item => (
              <option key={item.id} value={item.symbol}>{item.symbol}</option>
            ))
          ) : (
            <option value="BTC/USDT">BTC/USDT</option>
          )}
        </select>
        <button className="chart-toggle-btn" onClick={() => setShowChart(!showChart)}>
          {showChart ? '隐藏图表' : '显示图表'}
        </button>
      </div>
      
      {/* 图表区域 */}
      {showChart && (
        <div className="chart-container">
          <div className="chart-placeholder">
            图表区域 - 可集成TradingView等图表库
          </div>
        </div>
      )}
      
      {/* 交易操作区域 */}
      <div className="trading-area">
        {/* 左侧：下单表单 */}
        <div className="order-form">
          <h3>下单</h3>
          
          {/* 订单类型选择 */}
          <div className="order-type-selector">
            <button 
              className={`order-type-btn ${orderType === 'limit' ? 'active' : ''}`}
              onClick={() => setOrderType('limit')}
            >
              限价
            </button>
            <button 
              className={`order-type-btn ${orderType === 'market' ? 'active' : ''}`}
              onClick={() => setOrderType('market')}
            >
              市价
            </button>
          </div>
          
          {/* 买卖方向选择 */}
          <div className="order-side-selector">
            <button 
              className={`order-side-btn buy ${orderSide === 'buy' ? 'active' : ''}`}
              onClick={() => setOrderSide('buy')}
            >
              买入
            </button>
            <button 
              className={`order-side-btn sell ${orderSide === 'sell' ? 'active' : ''}`}
              onClick={() => setOrderSide('sell')}
            >
              卖出
            </button>
          </div>
          
          {/* 订单参数输入 */}
          {orderType === 'limit' && (
            <div className="order-inputs">
              <div className="input-group">
                <label>价格</label>
                <input 
                  type="number" 
                  value={orderPrice}
                  onChange={(e) => setOrderPrice(e.target.value)}
                  placeholder="输入价格"
                  step="0.01"
                />
              </div>
            </div>
          )}
          
          <div className="order-inputs">
            <div className="input-group">
              <label>数量</label>
              <input 
                type="number" 
                value={orderAmount}
                onChange={(e) => setOrderAmount(e.target.value)}
                placeholder="输入数量"
                step="0.001"
              />
            </div>
          </div>
          
          {/* 下单按钮 */}
          <button 
            className={`place-order-btn ${orderSide === 'buy' ? 'buy' : 'sell'}`}
            onClick={handlePlaceOrder}
            disabled={!orderAmount || (orderType === 'limit' && !orderPrice)}
          >
            {orderSide === 'buy' ? '买入' : '卖出'} {selectedSymbol}
          </button>
        </div>
        
        {/* 右侧：交易视图切换 */}
        <div className="trading-views">
          {/* 视图切换选项卡 */}
          <div className="view-tabs">
            <button 
              className={`view-tab ${activeTradingView === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTradingView('orders')}
            >
              订单管理
            </button>
            <button 
              className={`view-tab ${activeTradingView === 'positions' ? 'active' : ''}`}
              onClick={() => setActiveTradingView('positions')}
            >
              持仓管理
            </button>
            <button 
              className={`view-tab ${activeTradingView === 'strategy' ? 'active' : ''}`}
              onClick={() => setActiveTradingView('strategy')}
            >
              策略管理
            </button>
          </div>
          
          {/* 订单管理视图 */}
          {activeTradingView === 'orders' && (
            <div className="orders-view">
              {/* 未成交订单 */}
              <div className="open-orders-section">
                <div className="section-header">
                  <h4>未成交订单</h4>
                  <button onClick={() => setShowOrderDetails(!showOrderDetails)}>
                    {showOrderDetails ? '收起详情' : '展开详情'}
                  </button>
                </div>
                <table className="orders-table">
                  <thead>
                    <tr>
                      <th>交易对</th>
                      <th>类型</th>
                      <th>方向</th>
                      <th>价格</th>
                      <th>数量</th>
                      <th>状态</th>
                      <th>时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openOrders.length > 0 ? (
                      openOrders.map(order => (
                        <tr key={order.id}>
                          <td>{order.symbol}</td>
                          <td>{order.type}</td>
                          <td>{order.type === 'limit' ? '限价' : '市价'}</td>
                          <td>${order.price.toLocaleString()}</td>
                          <td>{order.amount}</td>
                          <td className={`status-${order.status}`}>{order.status}</td>
                          <td>{formatTimestamp(order.timestamp)}</td>
                          <td>
                            <button className="cancel-order-btn" onClick={() => handleCancelOrder(order.id)}>
                              取消
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="no-data">暂无未成交订单</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* 历史订单 */}
              <div className="order-history-section">
                <div className="section-header">
                  <h4>历史订单</h4>
                </div>
                <table className="orders-table">
                  <thead>
                    <tr>
                      <th>交易对</th>
                      <th>类型</th>
                      <th>方向</th>
                      <th>价格</th>
                      <th>数量</th>
                      <th>状态</th>
                      <th>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderHistory.length > 0 ? (
                      orderHistory.map(order => (
                        <tr key={order.id}>
                          <td>{order.symbol}</td>
                          <td>{order.type}</td>
                          <td>{order.type === 'limit' ? '限价' : '市价'}</td>
                          <td>${order.price.toLocaleString()}</td>
                          <td>{order.amount}</td>
                          <td className={`status-${order.status}`}>{order.status}</td>
                          <td>{formatTimestamp(order.timestamp)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="no-data">暂无历史订单</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {/* 持仓管理视图 */}
          {activeTradingView === 'positions' && (
            <div className="positions-view">
              <div className="section-header">
                <h4>当前持仓</h4>
                <button onClick={() => setShowPositionDetails(!showPositionDetails)}>
                  {showPositionDetails ? '收起详情' : '展开详情'}
                </button>
              </div>
              <table className="positions-table">
                <thead>
                  <tr>
                    <th>交易对</th>
                    <th>方向</th>
                    <th>开仓价格</th>
                    <th>持仓数量</th>
                    <th>浮动盈亏</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.length > 0 ? (
                    positions.map(position => (
                      <tr key={position.id}>
                        <td>{position.symbol}</td>
                        <td>{position.side}</td>
                        <td>${position.price.toLocaleString()}</td>
                        <td>{position.amount}</td>
                        <td className={position.profit >= 0 ? 'profit-positive' : 'profit-negative'}>
                          {position.profit >= 0 ? '+' : ''}{position.profit.toLocaleString()}
                        </td>
                        <td className={`status-${position.status}`}>{position.status}</td>
                        <td>
                          <button className="close-position-btn">平仓</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="no-data">暂无持仓</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          
          {/* 策略管理视图 */}
          {activeTradingView === 'strategy' && (
            <div className="strategy-view">
              <div className="section-header">
                <h4>策略管理</h4>
              </div>
              <div className="strategy-form">
                <div className="input-group">
                  <label>策略名称</label>
                  <input 
                    type="text" 
                    value={strategyName}
                    onChange={(e) => setStrategyName(e.target.value)}
                    placeholder="输入策略名称"
                  />
                </div>
                <div className="input-group">
                  <label>策略类型</label>
                  <select 
                    value={strategyType}
                    onChange={(e) => setStrategyType(e.target.value)}
                  >
                    <option value="">请选择策略类型</option>
                    <option value="movingAverage">均线策略</option>
                    <option value="rsi">RSI策略</option>
                    <option value="macd">MACD策略</option>
                    <option value="bollinger">布林带策略</option>
                  </select>
                </div>
                {/* 策略参数设置（根据策略类型动态显示） */}
                {strategyType && (
                  <div className="strategy-params">
                    <h5>策略参数</h5>
                    {/* 这里可以根据策略类型动态生成参数输入框 */}
                  </div>
                )}
                <button 
                  className="create-strategy-btn"
                  onClick={handleCreateStrategy}
                  disabled={!strategyName || !strategyType}
                >
                  创建策略
                </button>
              </div>
              
              {/* 已创建策略列表 */}
              <div className="strategy-list">
                <h4>已创建策略</h4>
                <div className="strategy-items">
                  <div className="strategy-item">
                    <div className="strategy-info">
                      <div className="strategy-name">示例均线策略</div>
                      <div className="strategy-status active">运行中</div>
                    </div>
                    <div className="strategy-actions">
                      <button className="strategy-action-btn">暂停</button>
                      <button className="strategy-action-btn">编辑</button>
                      <button className="strategy-action-btn">删除</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Trader;