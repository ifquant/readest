import React, { useState, useEffect } from 'react';
import './QuotePage.css';

interface QuotePageProps {
  symbol: string;
}

interface OrderBookItem {
  price: number;
  amount: number;
  total: number;
}

interface TickData {
  price: number;
  amount: number;
  direction: 'up' | 'down' | 'flat';
  time: string;
}

const QuotePage: React.FC<QuotePageProps> = ({ symbol }) => {
  const [asks, setAsks] = useState<OrderBookItem[]>([]);
  const [bids, setBids] = useState<OrderBookItem[]>([]);
  const [ticks, setTicks] = useState<TickData[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [highPrice, setHighPrice] = useState(0);
  const [lowPrice, setLowPrice] = useState(0);
  const [openPrice, setOpenPrice] = useState(0);
  const [prevClosePrice, setPrevClosePrice] = useState(0);
  const [volume, setVolume] = useState(0);
  const [amount, setAmount] = useState(0);
  const [limitUp, setLimitUp] = useState(0);
  const [limitDown, setLimitDown] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // 生成模拟盘口数据
  const generateOrderBookData = (basePrice: number, count: number = 10) => {
    const items: OrderBookItem[] = [];
    let total = 0;
    
    for (let i = 0; i < count; i++) {
      const price = parseFloat((basePrice + (Math.random() - 0.5) * 10).toFixed(2));
      const itemAmount = parseFloat((10 + Math.random() * 90).toFixed(2));
      total += itemAmount;
      
      items.push({
        price,
        amount: itemAmount,
        total: parseFloat(total.toFixed(2))
      });
    }
    
    return items;
  };

  // 生成模拟成交数据
  const generateTickData = (basePrice: number, count: number = 20) => {
    const items: TickData[] = [];
    
    for (let i = 0; i < count; i++) {
      const price = parseFloat((basePrice + (Math.random() - 0.5) * 5).toFixed(2));
      const itemAmount = parseFloat((0.1 + Math.random() * 9.9).toFixed(2));
      const direction = Math.random() > 0.5 ? 'up' : Math.random() > 0.5 ? 'down' : 'flat';
      const time = new Date(Date.now() - i * 30000).toLocaleTimeString();
      
      items.push({
        price,
        amount: itemAmount,
        direction,
        time
      });
    }
    
    return items;
  };

  // 加载盘口数据
  useEffect(() => {
    setIsLoading(true);
    
    // 根据交易对设置不同的基准价格
    let basePrice = 42500;
    if (symbol.includes('ETH')) basePrice = 2250;
    else if (symbol.includes('SOL')) basePrice = 120;
    else if (symbol.includes('ADA')) basePrice = 0.56;
    else if (symbol.includes('DOT')) basePrice = 7.89;
    else if (symbol.includes('ES')) basePrice = 4750;
    else if (symbol.includes('NQ')) basePrice = 16200;
    else if (symbol.includes('CU')) basePrice = 65000;
    else if (symbol.includes('RB')) basePrice = 3850;
    
    // 设置价格相关数据
    setCurrentPrice(basePrice);
    setOpenPrice(parseFloat((basePrice * (1 + (Math.random() - 0.5) * 0.02)).toFixed(2)));
    setPrevClosePrice(parseFloat((basePrice * (1 + (Math.random() - 0.5) * 0.01)).toFixed(2)));
    setHighPrice(parseFloat((basePrice * (1 + 0.03 + Math.random() * 0.02)).toFixed(2)));
    setLowPrice(parseFloat((basePrice * (1 - 0.03 - Math.random() * 0.02)).toFixed(2)));
    setVolume(parseFloat((1000 + Math.random() * 9000).toFixed(2)));
    setAmount(parseFloat((volume * basePrice).toFixed(2)));
    
    // 设置涨跌停价格 (假设10%的涨跌停限制)
    setLimitUp(parseFloat((prevClosePrice * 1.1).toFixed(2)));
    setLimitDown(parseFloat((prevClosePrice * 0.9).toFixed(2)));
    
    // 生成买卖盘数据
    const askItems = generateOrderBookData(basePrice * 1.005);
    const bidItems = generateOrderBookData(basePrice * 0.995);
    
    // 按价格排序
    askItems.sort((a, b) => a.price - b.price);
    bidItems.sort((a, b) => b.price - a.price);
    
    setAsks(askItems);
    setBids(bidItems);
    
    // 生成成交数据
    setTicks(generateTickData(basePrice));
    
    setIsLoading(false);
    
    // 模拟实时数据更新
    const interval = setInterval(() => {
      updateOrderBook(basePrice);
      addNewTick(basePrice);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [symbol]);

  // 更新盘口数据
  const updateOrderBook = (basePrice: number) => {
    setAsks(prev => {
      const newAsks = [...prev];
      // 随机更新一个卖盘价格
      const index = Math.floor(Math.random() * newAsks.length);
      newAsks[index].price = parseFloat((basePrice * (1.005 + (Math.random() - 0.5) * 0.002)).toFixed(2));
      // 重新排序
      newAsks.sort((a, b) => a.price - b.price);
      return newAsks;
    });
    
    setBids(prev => {
      const newBids = [...prev];
      // 随机更新一个买盘价格
      const index = Math.floor(Math.random() * newBids.length);
      newBids[index].price = parseFloat((basePrice * (0.995 + (Math.random() - 0.5) * 0.002)).toFixed(2));
      // 重新排序
      newBids.sort((a, b) => b.price - a.price);
      return newBids;
    });
  };

  // 添加新的成交数据
  const addNewTick = (basePrice: number) => {
    setTicks(prev => {
      const newPrice = parseFloat((basePrice + (Math.random() - 0.5) * 5).toFixed(2));
      const newAmount = parseFloat((0.1 + Math.random() * 9.9).toFixed(2));
      const direction = Math.random() > 0.5 ? 'up' : Math.random() > 0.5 ? 'down' : 'flat';
      
      const newTicks = [{ 
        price: newPrice, 
        amount: newAmount, 
        direction, 
        time: new Date().toLocaleTimeString() 
      }, ...prev.slice(0, 19)]; // 只保留最近20条
      
      return newTicks;
    });
  };

  // 计算价格涨跌幅
  const priceChangePercent = prevClosePrice > 0 
    ? parseFloat((((currentPrice - prevClosePrice) / prevClosePrice) * 100).toFixed(2))
    : 0;
  
  const isPriceUp = currentPrice > prevClosePrice;
  const isPriceDown = currentPrice < prevClosePrice;

  if (isLoading) {
    return (
      <div className="quote-page">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="quote-page">
      {/* 当前价格信息 */}
      <div className="price-info-section">
        <h3>{symbol}</h3>
        <div className="current-price">
          <span className={`price ${isPriceUp ? 'up' : isPriceDown ? 'down' : ''}`}>
            {currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className={`change ${isPriceUp ? 'up' : isPriceDown ? 'down' : ''}`}>
            {isPriceUp ? '+' : ''}{priceChangePercent}%
          </span>
        </div>
        <div className="price-details">
          <div className="price-item">
            <span className="label">今开:</span>
            <span className="value">{openPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="price-item">
            <span className="label">最高:</span>
            <span className="value up">{highPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="price-item">
            <span className="label">最低:</span>
            <span className="value down">{lowPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="price-item">
            <span className="label">昨收:</span>
            <span className="value">{prevClosePrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
        <div className="limit-info">
          <div className="limit-item">
            <span className="label">涨停:</span>
            <span className="value up">{limitUp.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="limit-item">
            <span className="label">跌停:</span>
            <span className="value down">{limitDown.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* 成交量信息 */}
      <div className="volume-info">
        <div className="volume-item">
          <span className="label">成交量:</span>
          <span className="value">{volume.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="volume-item">
          <span className="label">成交额:</span>
          <span className="value">${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* 买卖盘 */}
      <div className="order-book">
        {/* 卖盘 */}
        <div className="asks-section">
          <h4>卖盘</h4>
          <div className="order-book-header">
            <span className="col-price">价格</span>
            <span className="col-amount">数量</span>
            <span className="col-total">累计</span>
          </div>
          {asks.map((ask, index) => (
            <div key={`ask-${index}`} className="order-book-row">
              <span className="col-price ask">{ask.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              <span className="col-amount">{ask.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              <span className="col-total">{ask.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          ))}
        </div>

        {/* 买盘 */}
        <div className="bids-section">
          <h4>买盘</h4>
          <div className="order-book-header">
            <span className="col-price">价格</span>
            <span className="col-amount">数量</span>
            <span className="col-total">累计</span>
          </div>
          {bids.map((bid, index) => (
            <div key={`bid-${index}`} className="order-book-row">
              <span className="col-price bid">{bid.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              <span className="col-amount">{bid.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              <span className="col-total">{bid.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 实时成交 */}
      <div className="ticks-section">
        <h4>实时成交</h4>
        <div className="ticks-container">
          {ticks.map((tick, index) => (
            <div key={`tick-${index}`} className="tick-row">
              <span className="tick-time">{tick.time}</span>
              <span className={`tick-price ${tick.direction}`}>
                {tick.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className="tick-amount">{tick.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QuotePage;