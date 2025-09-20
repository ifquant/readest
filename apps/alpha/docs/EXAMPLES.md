# TradeBlazer 脚本引擎示例文档

## 1. 概述

本文档提供了一系列TradeBlazer脚本引擎的示例策略，从简单到复杂，涵盖了不同的交易理念和市场环境。这些示例旨在帮助用户快速理解TradeBlazer脚本的编写方法，并为实际的量化交易策略开发提供参考。

## 2. 基础策略示例

### 2.1 简单移动平均线交叉策略

**策略说明**：这是最经典的双移动平均线交叉策略，当短期移动平均线上穿长期移动平均线时买入，下穿时卖出。

```javascript
// 双移动平均线交叉策略
// 参数设置
var nFastPeriod = 10; // 短期均线周期
var nSlowPeriod = 30; // 长期均线周期
var nLots = 1;         // 交易手数

// 序列变量声明
series fastMA;
series slowMA;

function OnInit() {
    // 初始化函数，策略加载时执行一次
    print("双移动平均线交叉策略初始化成功");
}

function OnBar() {
    // 计算移动平均线
    fastMA = ma(close, nFastPeriod);
    slowMA = ma(close, nSlowPeriod);
    
    // 金叉买入信号：短期均线上穿长期均线
    if (fastMA > slowMA && fastMA[1] <= slowMA[1]) {
        buy(nLots);
        print("金叉买入：" + date() + " " + time());
    }
    // 死叉卖出信号：短期均线下穿长期均线
    else if (fastMA < slowMA && fastMA[1] >= slowMA[1]) {
        sell(nLots);
        print("死叉卖出：" + date() + " " + time());
    }
}
```

### 2.2 RSI超买超卖策略

**策略说明**：基于相对强弱指标(RSI)的超买超卖策略，当RSI低于超卖线时买入，高于超买线时卖出。

```javascript
// RSI超买超卖策略
// 参数设置
var nRSIPeriod = 14;    // RSI计算周期
var nOverbought = 70;   // 超买阈值
var nOversold = 30;     // 超卖阈值
var nLots = 1;          // 交易手数

// 序列变量声明
series rsiValue;

function OnInit() {
    print("RSI超买超卖策略初始化成功");
}

function OnBar() {
    // 计算RSI指标
    rsiValue = rsi(close, nRSIPeriod);
    
    // RSI上穿超卖线买入
    if (rsiValue > nOversold && rsiValue[1] <= nOversold) {
        buy(nLots);
        print("RSI超卖买入：" + date() + " " + time() + ", RSI值：" + rsiValue);
    }
    // RSI下穿超买线卖出
    else if (rsiValue < nOverbought && rsiValue[1] >= nOverbought) {
        sell(nLots);
        print("RSI超买卖出：" + date() + " " + time() + ", RSI值：" + rsiValue);
    }
}
```

### 2.3 MACD策略

**策略说明**：基于MACD指标的交易策略，当MACD线金叉信号线时买入，死叉时卖出。

```javascript
// MACD策略
// 参数设置
var nFastPeriod = 12;   // 快线周期
var nSlowPeriod = 26;   // 慢线周期
var nSignalPeriod = 9;  // 信号线周期
var nLots = 1;          // 交易手数

// 序列变量声明
series macdLine;
series signalLine;
series histogram;

function OnInit() {
    print("MACD策略初始化成功");
}

function OnBar() {
    // 计算MACD指标
    var macdResult = macd(close, nFastPeriod, nSlowPeriod, nSignalPeriod);
    macdLine = macdResult[0];
    signalLine = macdResult[1];
    histogram = macdResult[2];
    
    // MACD线金叉信号线买入
    if (macdLine > signalLine && macdLine[1] <= signalLine[1]) {
        buy(nLots);
        print("MACD金叉买入：" + date() + " " + time());
    }
    // MACD线死叉信号线卖出
    else if (macdLine < signalLine && macdLine[1] >= signalLine[1]) {
        sell(nLots);
        print("MACD死叉卖出：" + date() + " " + time());
    }
}
```

## 3. 中级策略示例

### 3.1 布林带策略

**策略说明**：基于布林带指标的交易策略，当价格触及下轨时买入，触及上轨时卖出。

```javascript
// 布林带策略
// 参数设置
var nPeriod = 20;       // 计算周期
var nStdDev = 2;        // 标准差倍数
var nLots = 1;          // 交易手数

// 序列变量声明
series upperBand;
series middleBand;
series lowerBand;

function OnInit() {
    print("布林带策略初始化成功");
}

function OnBar() {
    // 计算布林带指标
    var bollingerResult = bollinger(close, nPeriod, nStdDev);
    upperBand = bollingerResult[0];
    middleBand = bollingerResult[1];
    lowerBand = bollingerResult[2];
    
    // 价格触及下轨买入
    if (close <= lowerBand && close[1] > lowerBand[1]) {
        buy(nLots);
        print("价格触及下轨买入：" + date() + " " + time());
    }
    // 价格触及上轨卖出
    else if (close >= upperBand && close[1] < upperBand[1]) {
        sell(nLots);
        print("价格触及上轨卖出：" + date() + " " + time());
    }
}
```

### 3.2 KDJ策略

**策略说明**：基于KDJ指标的交易策略，当K线上穿D线时买入，下穿时卖出。

```javascript
// KDJ策略
// 参数设置
var nPeriod = 9;        // KDJ计算周期
var nSmooth1 = 3;       // K值平滑周期
var nSmooth2 = 3;       // D值平滑周期
var nLots = 1;          // 交易手数

// 序列变量声明
series kValue;
series dValue;
series jValue;

function OnInit() {
    print("KDJ策略初始化成功");
}

function OnBar() {
    // 计算KDJ指标
    var kdjResult = kdj(close, high, low, nPeriod, nSmooth1, nSmooth2);
    kValue = kdjResult[0];
    dValue = kdjResult[1];
    jValue = kdjResult[2];
    
    // K线上穿D线买入
    if (kValue > dValue && kValue[1] <= dValue[1]) {
        buy(nLots);
        print("KDJ金叉买入：" + date() + " " + time());
    }
    // K线下穿D线卖出
    else if (kValue < dValue && kValue[1] >= dValue[1]) {
        sell(nLots);
        print("KDJ死叉卖出：" + date() + " " + time());
    }
}
```

### 3.3 量价关系策略

**策略说明**：基于成交量和价格关系的交易策略，当价格上涨且成交量放大时买入，价格下跌且成交量放大时卖出。

```javascript
// 量价关系策略
// 参数设置
var nVolumePeriod = 20; // 成交量均线周期
var nLots = 1;          // 交易手数

// 序列变量声明
series maVolume;

function OnInit() {
    print("量价关系策略初始化成功");
}

function OnBar() {
    // 计算成交量移动平均线
    maVolume = ma(volume, nVolumePeriod);
    
    // 价格上涨且成交量放大买入
    if (close > open && volume > 1.5 * maVolume) {
        buy(nLots);
        print("量价齐升买入：" + date() + " " + time());
    }
    // 价格下跌且成交量放大卖出
    else if (close < open && volume > 1.5 * maVolume) {
        sell(nLots);
        print("量价齐跌卖出：" + date() + " " + time());
    }
}
```

## 4. 高级策略示例

### 4.1 多因子策略

**策略说明**：结合多个技术指标的综合策略，通过加权评分来决定交易信号。

```javascript
// 多因子策略
// 参数设置
var nLots = 1;          // 交易手数
var nBuyThreshold = 0.6;    // 买入阈值
var nSellThreshold = 0.4;   // 卖出阈值

// 序列变量声明
series ma5;
series ma20;
series rsiValue;
series macdLine;
series signalLine;

function OnInit() {
    print("多因子策略初始化成功");
}

function calculateScore() {
    // 计算各因子得分
    var maScore = 0;
    if (ma5 > ma20) {
        maScore = 1;
    } else {
        maScore = 0;
    }
    
    var rsiScore = 0;
    if (rsiValue > 50) {
        rsiScore = 1;
    } else {
        rsiScore = 0;
    }
    
    var macdScore = 0;
    if (macdLine > signalLine) {
        macdScore = 1;
    } else {
        macdScore = 0;
    }
    
    // 加权平均计算总得分
    var totalScore = (maScore * 0.4 + rsiScore * 0.3 + macdScore * 0.3);
    return totalScore;
}

function OnBar() {
    // 计算各技术指标
    ma5 = ma(close, 5);
    ma20 = ma(close, 20);
    rsiValue = rsi(close, 14);
    
    var macdResult = macd(close, 12, 26, 9);
    macdLine = macdResult[0];
    signalLine = macdResult[1];
    
    // 计算综合得分
    var score = calculateScore();
    
    // 根据得分生成交易信号
    if (score >= nBuyThreshold) {
        buy(nLots);
        print("多因子买入信号：得分=" + score + "，时间=" + date() + " " + time());
    } else if (score <= nSellThreshold) {
        sell(nLots);
        print("多因子卖出信号：得分=" + score + "，时间=" + date() + " " + time());
    }
}
```

### 4.2 自适应移动平均线策略

**策略说明**：根据市场波动率自动调整移动平均线参数的策略，在趋势明显时使用较慢的均线，在波动剧烈时使用较快的均线。

```javascript
// 自适应移动平均线策略
// 参数设置
var nFastPeriod = 5;    // 快速均线周期
var nSlowPeriod = 30;   // 慢速均线周期
var nVolatilityPeriod = 20; // 波动率计算周期
var nLots = 1;          // 交易手数

// 序列变量声明
series adaptiveMA;
series volatility;

function OnInit() {
    print("自适应移动平均线策略初始化成功");
}

function calculateVolatility() {
    // 计算波动率（使用收盘价的标准差）
    var stdDev = stddev(close, nVolatilityPeriod);
    var avgClose = avg(close, nVolatilityPeriod);
    var volatilityRatio = stdDev / avgClose;
    return volatilityRatio;
}

function OnBar() {
    // 计算市场波动率
    volatility = calculateVolatility();
    
    // 根据波动率调整均线周期
    var currentPeriod = nSlowPeriod - (nSlowPeriod - nFastPeriod) * volatility;
    currentPeriod = Math.max(nFastPeriod, Math.min(nSlowPeriod, currentPeriod));
    
    // 计算自适应移动平均线
    adaptiveMA = ma(close, Math.round(currentPeriod));
    
    // 价格上穿自适应均线买入
    if (close > adaptiveMA && close[1] <= adaptiveMA[1]) {
        buy(nLots);
        print("自适应均线买入：周期=" + Math.round(currentPeriod) + "，时间=" + date() + " " + time());
    }
    // 价格下穿自适应均线卖出
    else if (close < adaptiveMA && close[1] >= adaptiveMA[1]) {
        sell(nLots);
        print("自适应均线卖出：周期=" + Math.round(currentPeriod) + "，时间=" + date() + " " + time());
    }
}
```

### 4.3 海龟交易策略

**策略说明**：经典的海龟交易策略实现，基于突破和资金管理规则。

```javascript
// 海龟交易策略
// 参数设置
var nEntryPeriod = 20;  // 入场突破周期
var nExitPeriod = 10;   // 出场突破周期
var nStopLossRatio = 0.02; // 止损比例
var nRiskPerTrade = 0.01;  // 每笔交易风险资金比例

// 序列变量声明
series highestHigh;
series lowestLow;
var positionPrice = 0;  // 持仓价格
var positionSize = 0;   // 持仓数量

function OnInit() {
    print("海龟交易策略初始化成功");
}

function calculatePositionSize() {
    // 根据账户资金和风险比例计算持仓数量
    var accountBalance = getAccountBalance();
    var atrValue = atr(high, low, close, 20);
    var riskAmount = accountBalance * nRiskPerTrade;
    var size = riskAmount / (atrValue * 10); // 假设每点价值10元
    return Math.max(1, Math.floor(size)); // 至少交易1手
}

function OnBar() {
    // 计算最高价和最低价
    highestHigh = highest(high, nEntryPeriod);
    lowestLow = lowest(low, nEntryPeriod);
    
    // 入场信号：价格突破20日高点买入
    if (close > highestHigh[1] && positionSize == 0) {
        positionSize = calculatePositionSize();
        positionPrice = close;
        buy(positionSize);
        print("海龟策略突破买入：数量=" + positionSize + "，价格=" + positionPrice + "，时间=" + date() + " " + time());
    }
    // 入场信号：价格跌破20日低点做空
    else if (close < lowestLow[1] && positionSize == 0) {
        positionSize = calculatePositionSize();
        positionPrice = close;
        sellshort(positionSize);
        print("海龟策略突破做空：数量=" + positionSize + "，价格=" + positionPrice + "，时间=" + date() + " " + time());
    }
    
    // 止损逻辑
    if (positionSize > 0) {
        // 多头止损：价格跌破入场价的2%
        if (close < positionPrice * (1 - nStopLossRatio)) {
            sell(positionSize);
            print("多头止损出场：数量=" + positionSize + "，价格=" + close + "，时间=" + date() + " " + time());
            positionSize = 0;
            positionPrice = 0;
        }
    } else if (positionSize < 0) {
        // 空头止损：价格涨破入场价的2%
        if (close > positionPrice * (1 + nStopLossRatio)) {
            buy(positionSize);
            print("空头止损出场：数量=" + Math.abs(positionSize) + "，价格=" + close + "，时间=" + date() + " " + time());
            positionSize = 0;
            positionPrice = 0;
        }
    }
    
    // 出场信号：多头跌破10日低点出场
    if (positionSize > 0) {
        var exitLow = lowest(low, nExitPeriod);
        if (close < exitLow[1]) {
            sell(positionSize);
            print("多头出场：数量=" + positionSize + "，价格=" + close + "，时间=" + date() + " " + time());
            positionSize = 0;
            positionPrice = 0;
        }
    }
    // 出场信号：空头突破10日高点出场
    else if (positionSize < 0) {
        var exitHigh = highest(high, nExitPeriod);
        if (close > exitHigh[1]) {
            buy(positionSize);
            print("空头出场：数量=" + Math.abs(positionSize) + "，价格=" + close + "，时间=" + date() + " " + time());
            positionSize = 0;
            positionPrice = 0;
        }
    }
}
```

## 5. 最佳实践

### 5.1 策略开发流程

1. **确定交易理念**：明确你的交易逻辑和策略核心思想
2. **编写基础代码**：实现策略的基本框架和核心逻辑
3. **回测与优化**：在历史数据上测试策略，并优化参数
4. **模拟交易**：在模拟环境中验证策略实盘表现
5. **实盘部署**：将策略部署到实盘环境，监控运行情况

### 5.2 风险控制

1. **设置止损**：每笔交易都应设置合理的止损位
2. **资金管理**：控制每笔交易的风险资金比例，一般不超过总资金的1-2%
3. **分散投资**：不要将所有资金集中在单一品种或单一策略上
4. **定期评估**：定期评估策略表现，及时调整或停止表现不佳的策略

### 5.3 性能优化

1. **减少计算量**：避免不必要的重复计算
2. **优化数据结构**：选择合适的数据结构存储和访问数据
3. **使用序列操作**：充分利用序列变量的特性，简化代码
4. **避免过度优化**：不要过度拟合历史数据，保持策略的稳健性

### 5.4 调试技巧

1. **使用print函数**：输出关键变量和交易信号，便于分析
2. **分段测试**：将策略分成多个部分，逐步测试和验证
3. **日志分析**：分析交易日志，找出策略问题所在
4. **参数敏感性分析**：测试参数变化对策略表现的影响

## 6. 常见问题解决

### 6.1 策略回测效果好但实盘表现差

- **问题原因**：过度拟合历史数据、市场环境变化、滑点和交易成本考虑不足
- **解决方法**：使用更长时间的历史数据回测、增加样本外测试、优化参数设置、考虑实际交易成本

### 6.2 策略交易频率过高

- **问题原因**：参数设置过于敏感、市场波动剧烈
- **解决方法**：调整参数周期、增加过滤条件、使用更稳健的指标组合

### 6.3 策略长时间不产生交易信号

- **问题原因**：参数设置过于保守、市场处于盘整阶段
- **解决方法**：调整参数设置、增加其他交易逻辑、耐心等待合适的市场环境

### 6.4 策略出现连续亏损

- **问题原因**：市场环境变化、策略失效、参数需要调整
- **解决方法**：暂停实盘交易、重新评估策略、调整参数设置、考虑增加新的策略逻辑

---
**版本**: v1.0
**更新日期**: 2023-xx-xx