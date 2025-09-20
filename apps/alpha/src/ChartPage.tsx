import React, { useRef, useState, useEffect } from 'react';
import * as echarts from 'echarts';
import './ChartPage.css';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartPageProps {
  symbol: string;
  onBackClick: () => void;
  timeframe: string;
}

const ChartPage: React.FC<ChartPageProps> = ({ symbol, onBackClick, timeframe }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [loading, setLoading] = useState(true);
  const [candleData, setCandleData] = useState<CandleData[]>([]);

  // 生成更多的模拟K线数据
  const generateMockCandleData = (): CandleData[] => {
    const data: CandleData[] = [];
    const now = Date.now();
    let basePrice = 42000; // 默认基准价格
    let volatility = 0.02; // 波动率
    
    // 根据不同的交易对设置不同的基准价格和波动率
    if (symbol.includes('ETH')) {
      basePrice = 2200;
      volatility = 0.025;
    } else if (symbol.includes('SOL')) {
      basePrice = 120;
      volatility = 0.03;
    } else if (symbol.includes('ADA')) {
      basePrice = 0.56;
      volatility = 0.04;
    } else if (symbol.includes('DOT')) {
      basePrice = 7.89;
      volatility = 0.035;
    } else if (symbol.includes('ES')) {
      basePrice = 4750;
      volatility = 0.015;
    } else if (symbol.includes('NQ')) {
      basePrice = 16200;
      volatility = 0.018;
    } else if (symbol.includes('CU')) {
      basePrice = 65000;
      volatility = 0.02;
    } else if (symbol.includes('RB')) {
      basePrice = 3850;
      volatility = 0.022;
    }

    // 根据时间周期决定生成多少根K线
    const days = 30; // 生成30天的数据
    const hoursPerDay = 24;
    const intervalCount = days * hoursPerDay;
    
    let currentPrice = basePrice;
    
    // 生成连续的K线数据，使价格走势更自然
    for (let i = intervalCount - 1; i >= 0; i--) {
      const time = now - i * 60 * 60 * 1000;
      
      // 使用随机游走模型生成更真实的价格走势
      const change = currentPrice * volatility * (Math.random() - 0.5);
      const open = parseFloat(currentPrice.toFixed(2));
      currentPrice = parseFloat((currentPrice + change).toFixed(2));
      const close = currentPrice;
      const high = parseFloat((Math.max(open, close) + Math.abs(change) * 0.2 * Math.random()).toFixed(2));
      const low = parseFloat((Math.min(open, close) - Math.abs(change) * 0.2 * Math.random()).toFixed(2));
      const volume = parseFloat((Math.abs(change) * 100 + 500 + Math.random() * 1000).toFixed(2));
      
      data.push({ time, open, high, low, close, volume });
    }
    
    return data;
  };

  // 格式化时间为ECharts所需的格式
  const formatTimeForECharts = (timestamp: number): string => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    
    if (timeframe === '1d') {
      return `${year}-${month}-${day}`;
    }
    return `${year}-${month}-${day} ${hour}:${minute}`;
  };

  // 根据时间周期过滤和处理数据
  const processDataByTimeframe = (data: CandleData[]): { klineData: any[], volumeData: any[] } => {
    // 根据时间周期筛选数据
    let filteredData = data;
    
    // 根据不同的时间周期进行数据聚合
    switch (timeframe) {
      case '15m':
        // 这里可以实现15分钟数据的聚合逻辑
        break;
      case '1h':
        // 每小时数据
        filteredData = data.filter((_, i) => i % 1 === 0);
        break;
      case '4h':
        // 每4小时数据
        filteredData = data.filter((_, i) => i % 4 === 0);
        break;
      case '1d':
        // 每天数据
        filteredData = data.filter((_, i) => i % 24 === 0);
        break;
      default:
        break;
    }
    
    // 转换为ECharts需要的格式
    const klineData = filteredData.map(candle => [
      formatTimeForECharts(candle.time),
      candle.open,
      candle.close,
      candle.low,
      candle.high
    ]);
    
    const volumeData = filteredData.map(candle => [
      formatTimeForECharts(candle.time),
      candle.volume,
      candle.close >= candle.open ? 1 : 0 // 1表示上涨，0表示下跌
    ]);
    
    return { klineData, volumeData };
  };

  // 初始化图表
  const initChart = () => {
    if (!chartRef.current || chartInstance.current) {
      return;
    }
    
    chartInstance.current = echarts.init(chartRef.current);
    updateChart();
  };

  // 更新图表数据和配置
  const updateChart = () => {
    if (!chartInstance.current) {
      return;
    }
    
    const { klineData, volumeData } = processDataByTimeframe(candleData);
    
    const option: echarts.EChartsOption = {
      backgroundColor: '#1a1a2e',
      title: {
        text: `${symbol} K线图`,
        left: 'center',
        top: 20,
        textStyle: {
          color: '#ffffff',
          fontSize: 18
        }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(26, 26, 46, 0.9)',
        borderColor: '#0f3460',
        textStyle: {
          color: '#ffffff'
        },
        axisPointer: {
          type: 'cross'
        }
      },
      legend: {
        data: ['K线', '成交量', 'MA5', 'MA10', 'MA30'],
        top: 40,
        textStyle: {
          color: '#cccccc'
        }
      },
      grid: [
        {
          left: '10%',
          right: '10%',
          top: '15%',
          height: '50%'
        },
        {
          left: '10%',
          right: '10%',
          top: '70%',
          height: '15%'
        }
      ],
      xAxis: [
        {
          type: 'category',
          data: klineData.map(item => item[0]),
          scale: true,
          boundaryGap: false,
          axisLine: {
            lineStyle: {
              color: '#333344'
            }
          },
          axisLabel: {
            color: '#cccccc'
          },
          splitLine: {
            show: false
          }
        },
        {
          type: 'category',
          data: klineData.map(item => item[0]),
          gridIndex: 1,
          scale: true,
          boundaryGap: false,
          axisLine: {
            lineStyle: {
              color: '#333344'
            }
          },
          axisLabel: {
            color: '#cccccc'
          },
          splitLine: {
            show: false
          }
        }
      ],
      yAxis: [
        {
          scale: true,
          axisLine: {
            lineStyle: {
              color: '#333344'
            }
          },
          axisLabel: {
            color: '#cccccc',
            formatter: (value: number) => value.toFixed(2)
          },
          splitLine: {
            lineStyle: {
              color: '#333344',
              opacity: 0.3
            }
          }
        },
        {
          scale: true,
          gridIndex: 1,
          axisLabel: {
            show: false
          },
          axisLine: {
            show: false
          },
          splitLine: {
            show: false
          }
        }
      ],
      series: [
        {
          name: 'K线',
          type: 'candlestick',
          data: klineData.map(item => [item[1], item[2], item[3], item[4]]),
          itemStyle: {
            color: '#27ae60', // 上涨颜色
            color0: '#e74c3c', // 下跌颜色
            borderColor: '#27ae60',
            borderColor0: '#e74c3c'
          },
          emphasis: {
            itemStyle: {
              color: '#2ecc71',
              color0: '#c0392b',
              borderColor: '#2ecc71',
              borderColor0: '#c0392b'
            }
          }
        },
        {
          name: 'MA5',
          type: 'line',
          data: calculateMA(klineData, 5),
          smooth: true,
          showSymbol: false,
          lineStyle: {
            color: '#00b4ff',
            width: 1
          }
        },
        {
          name: 'MA10',
          type: 'line',
          data: calculateMA(klineData, 10),
          smooth: true,
          showSymbol: false,
          lineStyle: {
            color: '#ff9800',
            width: 1
          }
        },
        {
          name: 'MA30',
          type: 'line',
          data: calculateMA(klineData, 30),
          smooth: true,
          showSymbol: false,
          lineStyle: {
            color: '#9c27b0',
            width: 1
          }
        },
        {
          name: '成交量',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumeData,
          itemStyle: {
            color: (params: any) => params.data[2] === 1 ? '#27ae60' : '#e74c3c'
          }
        }
      ]
    };
    
    chartInstance.current.setOption(option);
  };

  // 计算移动平均线
  const calculateMA = (data: any[], dayCount: number): number[] => {
    const result: number[] = [];
    
    for (let i = 0, len = data.length; i < len; i++) {
      if (i < dayCount) {
        result.push(0);
        continue;
      }
      
      let sum = 0;
      for (let j = 0; j < dayCount; j++) {
        sum += data[i - j][2]; // 使用收盘价计算
      }
      result.push(parseFloat((sum / dayCount).toFixed(2)));
    }
    
    return result;
  };

  // 加载数据
  useEffect(() => {
    setLoading(true);
    
    // 模拟网络请求延迟
    const timer = setTimeout(() => {
      const data = generateMockCandleData();
      setCandleData(data);
      setLoading(false);
    }, 800);

    return () => clearTimeout(timer);
  }, [symbol]);

  // 初始化和更新图表
  useEffect(() => {
    initChart();
    
    // 更新图表数据
    if (!loading) {
      updateChart();
    }
    
    // 监听窗口大小变化
    const handleResize = () => {
      if (chartInstance.current) {
        chartInstance.current.resize();
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, [candleData, timeframe, loading]);

  // 获取最后一根K线的数据用于显示
  const getLastCandle = () => {
    if (candleData.length === 0) {
      return null;
    }
    return candleData[candleData.length - 1];
  };

  const lastCandle = getLastCandle();

  if (loading) {
    return (
      <div className="chart-page">
        <div className="page-header">
          <button className="back-btn" onClick={onBackClick}>← 返回</button>
          <h2>{symbol} - 加载中...</h2>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>正在加载K线数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chart-page">
        <div className="page-header">
          <button className="back-btn" onClick={onBackClick}>← 返回</button>
          <h2>{symbol} K线图</h2>
        </div>

        {/* K线图区域 */}
        <div className="chart-container">
          <div 
            ref={chartRef}
            className="echarts-container"
            style={{ width: '100%', height: '600px' }}
          />

          {/* 当前价格信息 */}
          {lastCandle && (
            <div className="current-price-info">
              <div className="price-item">
                <span className="label">开盘价:</span>
                <span className="value">${lastCandle.open.toFixed(2)}</span>
              </div>
              <div className="price-item">
                <span className="label">最高价:</span>
                <span className="value">${lastCandle.high.toFixed(2)}</span>
              </div>
              <div className="price-item">
                <span className="label">最低价:</span>
                <span className="value">${lastCandle.low.toFixed(2)}</span>
              </div>
              <div className="price-item">
                <span className="label">收盘价:</span>
                <span className={`value ${lastCandle.close >= lastCandle.open ? 'bullish' : 'bearish'}`}>
                  ${lastCandle.close.toFixed(2)}
                </span>
              </div>
              <div className="price-item">
                <span className="label">涨跌幅:</span>
                <span className={`value ${lastCandle.close >= lastCandle.open ? 'bullish' : 'bearish'}`}>
                  {((lastCandle.close - lastCandle.open) / lastCandle.open * 100).toFixed(2)}%
                </span>
              </div>
              <div className="price-item">
                <span className="label">成交量:</span>
                <span className="value">${lastCandle.volume.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
  );
};

export default ChartPage;