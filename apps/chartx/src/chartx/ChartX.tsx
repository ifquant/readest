import React, { useEffect, useMemo, useRef } from "react";
import { createChart, type ChartOptions, type ChartHandle, type LinePoint } from "./index";

export interface ChartXProps {
  data: LinePoint[];
  options?: ChartOptions;
  className?: string;
  style?: React.CSSProperties;
  height?: number | string; // default 300px
}

/**
 * ChartX: React 组件封装，负责创建/销毁图表并响应数据变化。
 */
export const ChartX: React.FC<ChartXProps> = ({
  data,
  options,
  className,
  style,
  height = 300,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ChartHandle | null>(null);

  // 初始化与销毁
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, options);
    chartRef.current = chart;
    chart.setData(data ?? []);
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, []);

  // 数据更新
  useEffect(() => {
    chartRef.current?.setData(data ?? []);
  }, [data]);

  // 容器样式
  const containerStyle = useMemo(() => {
    const resolvedHeight = typeof height === "number" ? `${height}px` : height;
    return {
      width: "100%",
      height: resolvedHeight,
      border: "1px solid #333",
      borderRadius: 8,
      ...style,
    } as React.CSSProperties;
  }, [height, style]);

  return <div ref={containerRef} className={className} style={containerStyle} />;
};