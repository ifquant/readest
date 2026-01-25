通过使用单页路由结合组件缓存/状态管理，可以避免图表的销毁和重绘

方案 1：使用组件缓存（推荐）
思路
在路由切换时，利用缓存技术（如 react-keep-alive 或类似的手动缓存方案）保留每个股票页面的状态和 DOM 实例，避免组件被 React 卸载。

实现步骤
1.安装 react-keep-alive：
使用 react-keep-alive，可以缓存路由对应的组件。

npm install react-keep-alive

2.设置路由缓存：
配置路由时，将每个股票页面的组件用 KeepAlive 包裹。

jsx

import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import KeepAliveProvider, { KeepAlive } from "react-keep-alive";
import StockPage from "./StockPage";

function App() {
  return (
    <BrowserRouter>
      <KeepAliveProvider>
        <Routes>
          <Route
            path="/stock/:symbol"
            element={
              <KeepAlive>
                <StockPage />
              </KeepAlive>
            }
          />
        </Routes>
      </KeepAliveProvider>
    </BrowserRouter>
  );
}

export default App;


3.动态股票页面组件：
在 StockPage 中，渲染图表，并确保图表实例的 DOM 被缓存。

jsx

import React, { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import * as echarts from "echarts";

function StockPage() {
  const { symbol } = useParams(); // 从路由中获取股票代码
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!chartInstance.current) {
      // 初始化图表
      chartInstance.current = echarts.init(chartRef.current);
    }

    // 更新图表数据
    chartInstance.current.setOption({
      title: { text: `Stock: ${symbol}` },
      xAxis: { data: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
      yAxis: {},
      series: [
        {
          type: "line",
          data: [120, 200, 150, 80, 70],
        },
      ],
    });

    // 清理逻辑（可选）
    return () => {
      // 如果需要销毁图表，可以在这里执行销毁逻辑
      // chartInstance.current.dispose();
    };
  }, [symbol]);

  return <div ref={chartRef} style={{ width: "100%", height: "400px" }} />;
}

export default StockPage;


方案 2：状态管理 + 持久化
如果不使用 react-keep-alive，可以手动管理每个股票页面的状态，将图表实例和数据持久化。

思路
使用全局状态管理工具（如 Redux 或 Zustand）存储每个股票页面的图表状态。
在组件加载时，从状态中恢复对应的图表实例和数据。

实现步骤
1.设置状态管理工具：
使用 Zustand（轻量级状态管理工具）存储股票页面的数据状态。

bash

npm install zustand
2. 创建一个状态存储：

javascript

import create from "zustand";

const useStockStore = create((set) => ({
  stocks: {}, // 存储每个股票的状态
  setStockState: (symbol, state) =>
    set((prev) => ({
      stocks: { ...prev.stocks, [symbol]: state },
    })),
  getStockState: (symbol) => (state) => state.stocks[symbol] || null,
}));

export default useStockStore;

3. 动态股票页面组件：
在切换页面时，保存和恢复图表状态。

jsx

import React, { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import * as echarts from "echarts";
import useStockStore from "./store";

function StockPage() {
  const { symbol } = useParams();
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const { setStockState, getStockState } = useStockStore();
  const prevState = getStockState(symbol);

  useEffect(() => {
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    // 恢复图表状态
    if (prevState) {
      chartInstance.current.setOption(prevState);
    } else {
      // 初始化图表
      chartInstance.current.setOption({
        title: { text: `Stock: ${symbol}` },
        xAxis: { data: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
        yAxis: {},
        series: [{ type: "line", data: [120, 200, 150, 80, 70] }],
      });
    }

    // 保存图表状态
    return () => {
      const state = chartInstance.current.getOption();
      setStockState(symbol, state);
    };
  }, [symbol]);

  return <div ref={chartRef} style={{ width: "100%", height: "400px" }} />;
}

export default StockPage;


方案 3：单实例图表 + 动态数据
如果图表本身支持动态更新数据（如 Echarts、TradingView），可以复用一个图表实例，动态更新数据和标题。

思路：
使用单个图表组件，所有股票页面共享。
根据路由参数动态更新数据。