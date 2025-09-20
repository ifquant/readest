import React, { useState } from 'react';
import './TraderPage.css';

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

// 定义数据接口
interface Order {
  id: string;
  symbol: string;
  type: string;
  price: number;
  amount: number;
  status: string;
  timestamp: string;
}

// 定义持仓接口
interface Position {
  id: string;
  symbol: string;
  amount: number;
  avgPrice: number;
  currentPrice: number;
  profit: number;
  profitPercentage: number;
  type: 'long' | 'short';
}

interface MarketItem {
  id: number;
  symbol: string;
  price: number;
  change: number;
  volume: number;
}

interface TraderProps {
  marketData: MarketItem[];
  openOrders: Order[];
  orderHistory: Order[];
  currentPrice: number;
  positions?: Position[];
}

const Trader: React.FC<TraderProps> = ({ 
  marketData, 
  openOrders, 
  orderHistory, 
  currentPrice, 
  positions = []
}) => {
  // 状态管理
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USDT');
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'limit' | 'market' | 'stop'>('limit');
  const [orderPrice, setOrderPrice] = useState('');
  const [orderAmount, setOrderAmount] = useState('');
  const [showHistoryOrders, setShowHistoryOrders] = useState(false);
  const [activeTab, setActiveTab] = useState<'orders' | 'positions'>('orders');

  // 模拟持仓数据（如果没有从props传入）
  const mockPositions: Position[] = positions.length > 0 ? positions : [
    {
      id: 'pos1',
      symbol: 'BTC/USDT',
      amount: 0.5,
      avgPrice: 41000,
      currentPrice: currentPrice,
      profit: (currentPrice - 41000) * 0.5,
      profitPercentage: ((currentPrice - 41000) / 41000) * 100,
      type: 'long'
    },
    {
      id: 'pos2',
      symbol: 'ETH/USDT',
      amount: 5,
      avgPrice: 2300,
      currentPrice: 2250,
      profit: (2250 - 2300) * 5,
      profitPercentage: ((2250 - 2300) / 2300) * 100,
      type: 'long'
    }
  ];

  // 下单处理函数
  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderAmount || parseFloat(orderAmount) <= 0) {
      alert('请输入有效的数量');
      return;
    }
    
    if (orderType !== 'market' && (!orderPrice || parseFloat(orderPrice) <= 0)) {
      alert('请输入有效的价格');
      return;
    }
    
    // 这里可以添加实际的下单逻辑
    alert(`已下单: ${orderSide === 'buy' ? '买入' : '卖出'} ${orderAmount} ${selectedSymbol.split('/')[0]}`);
    
    // 重置表单
    setOrderAmount('');
    if (orderType === 'limit') {
      setOrderPrice('');
    }
  };

  // 获取当前选中的符号数据
  const currentSymbolData = marketData.find(item => item.symbol === selectedSymbol);
  const priceChange = currentSymbolData?.change || 0;
  const isPositiveChange = priceChange >= 0;

  return (
    <div className="trader-page">
      {/* 页面头部 */}
      <div className="page-header">
        <h2>交易执行</h2>
        <select 
          className="symbol-select"
          value={selectedSymbol}
          onChange={(e) => setSelectedSymbol(e.target.value)}
        >
          {marketData.map(item => (
            <option key={item.id} value={item.symbol}>{item.symbol}</option>
          ))}
        </select>
      </div>

      {/* 订单管理区域 */}
      <div className="orders-section">
        <div className="section-header">
          <h3>订单管理</h3>
          <div className="order-tabs">
            <button 
              className={`order-tab ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              当前委托
            </button>
            <button 
              className={`order-tab ${activeTab === 'positions' ? 'active' : ''}`}
              onClick={() => setActiveTab('positions')}
            >
              当前持仓
            </button>
          </div>
        </div>
        
        <div className="orders-container">
          {activeTab === 'orders' ? (
            // 当前委托表格
            <table className="orders-table">
              <thead>
                <tr>
                  <th>订单ID</th>
                  <th>交易对</th>
                  <th>类型</th>
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
                      <td>{order.id}</td>
                      <td>{order.symbol}</td>
                      <td>{order.type}</td>
                      <td>${order.price.toLocaleString()}</td>
                      <td>{order.amount}</td>
                      <td>
                        <span className={`status-${order.status.toLowerCase()}`}>
                          {order.status}
                        </span>
                      </td>
                      <td>{order.timestamp}</td>
                      <td>
                        {order.status === 'Open' && (
                          <button className="cancel-order-btn">取消</button>
                        )}
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
          ) : (
            // 当前持仓表格
            <table className="positions-table">
              <thead>
                <tr>
                  <th>交易对</th>
                  <th>持仓类型</th>
                  <th>持仓数量</th>
                  <th>平均价格</th>
                  <th>当前价格</th>
                  <th>盈亏金额</th>
                  <th>盈亏比例</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {mockPositions.length > 0 ? (
                  mockPositions.map(position => (
                    <tr key={position.id}>
                      <td>{position.symbol}</td>
                      <td>
                        <span className={`position-type-${position.type}`}>
                          {position.type === 'long' ? '多头' : '空头'}
                        </span>
                      </td>
                      <td>{position.amount}</td>
                      <td>${position.avgPrice.toLocaleString()}</td>
                      <td>${position.currentPrice.toLocaleString()}</td>
                      <td>
                        <span className={`profit-${position.profit >= 0 ? 'positive' : 'negative'}`}>
                          {position.profit >= 0 ? '+' : ''}${position.profit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td>
                        <span className={`profit-${position.profitPercentage >= 0 ? 'positive' : 'negative'}`}>
                          {position.profitPercentage >= 0 ? '+' : ''}{position.profitPercentage.toFixed(2)}%
                        </span>
                      </td>
                      <td>
                        <button className="close-position-btn">平仓</button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="no-data">暂无持仓</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 下单区域 */}
      <div className="order-section">
        <div className="section-header">
          <h3>交易执行</h3>
        </div>
        
        <div className="trade-container">
          <div className="price-info">
            <div className="current-price">
              ${currentPrice.toLocaleString()}
            </div>
            <div className={`price-change ${isPositiveChange ? 'positive' : 'negative'}`}>
              {isPositiveChange ? '+' : ''}{priceChange}%
            </div>
          </div>
          
          <div className="order-type-selector">
            <button 
              className={`order-side-btn ${orderSide === 'buy' ? 'active buy' : ''}`}
              onClick={() => setOrderSide('buy')}
            >
              买入
            </button>
            <button 
              className={`order-side-btn ${orderSide === 'sell' ? 'active sell' : ''}`}
              onClick={() => setOrderSide('sell')}
            >
              卖出
            </button>
          </div>
          
          <div className="order-type-tabs">
            <button 
              className={`order-type-tab ${orderType === 'limit' ? 'active' : ''}`}
              onClick={() => setOrderType('limit')}
            >
              限价单
            </button>
            <button 
              className={`order-type-tab ${orderType === 'market' ? 'active' : ''}`}
              onClick={() => setOrderType('market')}
            >
              市价单
            </button>
            <button 
              className={`order-type-tab ${orderType === 'stop' ? 'active' : ''}`}
              onClick={() => setOrderType('stop')}
            >
              止损单
            </button>
          </div>
          
          <form className="order-form" onSubmit={handlePlaceOrder}>
            <div className="form-group">
              <label>价格 (USD)</label>
              <input 
                type="number" 
                placeholder="输入价格"
                step="0.01"
                min="0"
                value={orderPrice}
                onChange={(e) => setOrderPrice(e.target.value)}
                disabled={orderType === 'market'}
              />
            </div>
            
            <div className="form-group">
              <label>数量 ({selectedSymbol.split('/')[0]})</label>
              <input 
                type="number" 
                placeholder="输入数量"
                step="0.000001"
                min="0"
                value={orderAmount}
                onChange={(e) => setOrderAmount(e.target.value)}
                required
              />
            </div>
            
            <div className="form-actions">
              <button 
                type="submit" 
                className={`place-order-btn ${orderSide === 'buy' ? 'buy' : 'sell'}`}
              >
                {orderSide === 'buy' ? '买入' : '卖出'} {selectedSymbol.split('/')[0]}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Trader;