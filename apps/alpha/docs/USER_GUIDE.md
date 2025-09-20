# TradeBlazer 脚本引擎用户指南

## 1. 概述

本指南将帮助您快速上手TradeBlazer脚本引擎，学习如何编写、测试和执行量化交易策略。无论您是量化交易新手还是有经验的开发者，本指南都将为您提供全面的指导。

## 2. TradeBlazer 脚本基础

### 2.1 脚本结构

TradeBlazer脚本采用类似C语言的语法结构，主要包含以下几个部分：

1. **变量声明与定义**：使用`var`关键字声明变量
2. **序列变量声明**：使用`series`关键字声明序列变量
3. **函数定义**：使用`function`关键字定义函数
4. **事件处理函数**：包括`OnInit`、`OnTick`和`OnBar`等
5. **交易指令**：包括`buy`、`sell`、`buycover`、`sellcover`等

一个典型的TradeBlazer脚本结构如下：

```javascript
// 变量声明
var nLength = 20;
var nLots = 1;

// 序列变量声明
series maClose;
series maVolume;

// 初始化函数
function OnInit() {
    // 初始化代码
}

// Tick事件处理函数
function OnTick() {
    // 处理Tick数据
}

// Bar事件处理函数
function OnBar() {
    // 计算指标
    maClose = ma(close, nLength);
    maVolume = ma(volume, nLength);
    
    // 交易逻辑
    if (close > maClose && volume > maVolume) {
        buy(nLots);
    }
    else if (close < maClose && volume < maVolume) {
        sell(nLots);
    }
}
```

### 2.2 数据类型

TradeBlazer脚本支持以下数据类型：

1. **数值型 (Number)**：包括整数和浮点数，如`10`、`3.14`
2. **字符串型 (String)**：用双引号括起来的文本，如`"Hello World"`
3. **布尔型 (Boolean)**：包括`true`和`false`
4. **序列型 (Series)**：时间序列数据，使用`series`关键字声明

### 2.3 变量声明与赋值

#### 2.3.1 普通变量

使用`var`关键字声明普通变量：

```javascript
var nCount = 10;
var dPrice = 3.14;
var sName = "Strategy1";
var bFlag = true;
```

#### 2.3.2 序列变量

使用`series`关键字声明序列变量：

```javascript
series closePrice;
series highPrice;
series lowPrice;
series volumeData;
```

序列变量可以存储历史数据，并支持索引访问：

```javascript
series closePrice;

function OnBar() {
    closePrice = close;
    
    // 访问前一根K线的收盘价
    var prevClose = closePrice[1];
    
    // 访问前N根K线的收盘价
    var nLength = 5;
    var prevNClose = closePrice[nLength];
}
```

### 2.4 运算符

TradeBlazer脚本支持以下运算符：

#### 2.4.1 算术运算符

- `+`：加法
- `-`：减法
- `*`：乘法
- `/`：除法
- `%`：取模

#### 2.4.2 比较运算符

- `<`：小于
- `>`：大于
- `<=`：小于等于
- `>=`：大于等于
- `==`：等于
- `!=`：不等于

#### 2.4.3 赋值运算符

- `=`：赋值
- `+=`：加赋值
- `-=`：减赋值
- `*=`：乘赋值
- `/=`：除赋值
- `%=`：模赋值

### 2.5 控制流语句

#### 2.5.1 条件语句

使用`if-else`语句进行条件判断：

```javascript
if (close > open) {
    // 阳线逻辑
} else if (close < open) {
    // 阴线逻辑
} else {
    // 十字星逻辑
}
```

#### 2.5.2 循环语句

使用`for`语句进行循环操作：

```javascript
for (var i = 0; i < 10; i++) {
    // 循环体
}
```

## 3. 函数定义与调用

### 3.1 自定义函数

使用`function`关键字定义自定义函数：

```javascript
function calculateMA(data, length) {
    var sum = 0;
    for (var i = 0; i < length; i++) {
        sum += data[i];
    }
    return sum / length;
}
```

调用自定义函数：

```javascript
var maValue = calculateMA(close, 20);
```

### 3.2 事件处理函数

TradeBlazer脚本提供了三个重要的事件处理函数：

#### 3.2.1 OnInit函数

初始化函数，在脚本加载时执行一次：

```javascript
function OnInit() {
    // 初始化参数设置
    // 加载历史数据
    // 其他初始化操作
}
```

#### 3.2.2 OnTick函数

Tick事件处理函数，每收到一个Tick数据就执行一次：

```javascript
function OnTick() {
    // 处理实时Tick数据
    // 执行高频交易策略
}
```

#### 3.2.3 OnBar函数

Bar事件处理函数，每形成一根新的K线就执行一次：

```javascript
function OnBar() {
    // 计算技术指标
    // 生成交易信号
    // 执行交易策略
}
```

## 4. 交易指令

TradeBlazer脚本支持以下交易指令：

### 4.1 买入开仓

```javascript
buy(lots);
```

**功能**：买入开仓指定数量的合约。

**参数**：
- `lots`: 买入数量。

### 4.2 卖出平仓

```javascript
sell(lots);
```

**功能**：卖出平仓指定数量的合约。

**参数**：
- `lots`: 卖出数量。

### 4.3 买入平仓

```javascript
buycover(lots);
```

**功能**：买入平仓指定数量的合约（用于空头平仓）。

**参数**：
- `lots`: 买入数量。

### 4.4 卖出开仓

```javascript
sellcover(lots);
```

**功能**：卖出开仓指定数量的合约（用于开空仓）。

**参数**：
- `lots`: 卖出数量。

## 5. 内置函数库

TradeBlazer脚本引擎提供了丰富的内置函数库，包括数学函数、统计函数、技术指标函数等。

### 5.1 市场数据函数

- **open**: 获取当前K线的开盘价
- **high**: 获取当前K线的最高价
- **low**: 获取当前K线的最低价
- **close**: 获取当前K线的收盘价
- **volume**: 获取当前K线的成交量
- **openint**: 获取当前K线的持仓量

### 5.2 数学函数

- **abs(x)**: 计算绝对值
- **sqrt(x)**: 计算平方根
- **pow(x, y)**: 计算x的y次方
- **log(x)**: 计算自然对数
- **log10(x)**: 计算常用对数
- **sin(x)**: 计算正弦值
- **cos(x)**: 计算余弦值
- **tan(x)**: 计算正切值
- **max(x, y)**: 返回较大值
- **min(x, y)**: 返回较小值

### 5.3 统计函数

- **avg(x)**: 计算平均值
- **sum(x)**: 计算总和
- **stddev(x)**: 计算标准差
- **var(x)**: 计算方差
- **median(x)**: 计算中位数
- **rank(x)**: 计算排名

### 5.4 技术指标函数

- **ma(x, n)**: 计算移动平均线
- **ema(x, n)**: 计算指数移动平均线
- **macd(x, fast, slow, signal)**: 计算MACD指标
- **rsi(x, n)**: 计算RSI指标
- **kdj(x, n, m1, m2)**: 计算KDJ指标
- **bollinger(x, n, k)**: 计算布林带
- **cci(x, n)**: 计算CCI指标
- **dmi(x, h, l, n)**: 计算DMI指标

### 5.5 时间函数

- **time()**: 获取当前时间
- **date()**: 获取当前日期
- **dayofweek()**: 获取当前星期几
- **dayofmonth()**: 获取当前月份中的日期
- **month()**: 获取当前月份
- **year()**: 获取当前年份

## 6. 策略开发实战

### 6.1 移动平均线策略

下面是一个简单的双移动平均线交叉策略示例：

```javascript
// 参数设置
var nFastLength = 10;
var nSlowLength = 30;
var nLots = 1;

// 序列变量声明
series fastMA;
series slowMA;

function OnInit() {
    // 初始化代码
}

function OnBar() {
    // 计算快慢移动平均线
    fastMA = ma(close, nFastLength);
    slowMA = ma(close, nSlowLength);
    
    // 金叉买入信号
    if (fastMA > slowMA && fastMA[1] <= slowMA[1]) {
        buy(nLots);
    }
    // 死叉卖出信号
    else if (fastMA < slowMA && fastMA[1] >= slowMA[1]) {
        sell(nLots);
    }
}
```

### 6.2 MACD策略

下面是一个基于MACD指标的交易策略示例：

```javascript
// 参数设置
var nFastPeriod = 12;
var nSlowPeriod = 26;
var nSignalPeriod = 9;
var nLots = 1;

// 序列变量声明
series macdLine;
series signalLine;
series histogram;

function OnInit() {
    // 初始化代码
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
    }
    // MACD线死叉信号线卖出
    else if (macdLine < signalLine && macdLine[1] >= signalLine[1]) {
        sell(nLots);
    }
}
```

### 6.3 RSI策略

下面是一个基于RSI指标的超买超卖策略示例：

```javascript
// 参数设置
var nRSIPeriod = 14;
var nOverbought = 70;
var nOversold = 30;
var nLots = 1;

// 序列变量声明
series rsiValue;

function OnInit() {
    // 初始化代码
}

function OnBar() {
    // 计算RSI指标
    rsiValue = rsi(close, nRSIPeriod);
    
    // RSI下穿超买线卖出
    if (rsiValue < nOverbought && rsiValue[1] >= nOverbought) {
        sell(nLots);
    }
    // RSI上穿超卖线买入
    else if (rsiValue > nOversold && rsiValue[1] <= nOversold) {
        buy(nLots);
    }
}
```

## 7. 策略测试与优化

### 7.1 回测设置

在执行策略回测之前，需要设置以下参数：

1. **回测时间范围**：选择回测的开始和结束时间
2. **初始资金**：设置策略的初始资金
3. **交易成本**：设置佣金、滑点等交易成本
4. **数据周期**：选择K线周期（如1分钟、5分钟、日线等）

### 7.2 回测结果分析

回测完成后，可以从以下几个方面分析策略性能：

1. **收益率**：策略的总收益率和年化收益率
2. **最大回撤**：策略在回测期间的最大亏损幅度
3. **夏普比率**：衡量风险调整后的收益
4. **胜率**：盈利交易次数占总交易次数的比例
5. **盈亏比**：平均盈利与平均亏损的比例

### 7.3 参数优化

策略参数优化是提高策略性能的重要手段，可以通过以下方法进行：

1. **网格搜索**：对参数空间进行网格化搜索，寻找最优参数组合
2. **遗传算法**：使用遗传算法进化寻找最优参数
3. **随机搜索**：在参数空间内随机采样，评估参数组合性能

## 8. 常见问题解答

### 8.1 如何处理序列变量的索引访问？

序列变量支持使用`[]`运算符访问历史数据，索引从0开始，0表示当前最新数据，1表示前一个数据，以此类推。

```javascript
series closePrice;

function OnBar() {
    closePrice = close;
    
    // 访问前一根K线的收盘价
    var prevClose = closePrice[1];
    
    // 访问前5根K线的收盘价
    var prev5Close = closePrice[5];
}
```

### 8.2 如何处理不同周期的数据？

TradeBlazer脚本引擎支持多周期数据处理，可以在脚本中引用不同周期的K线数据。

### 8.3 如何进行资金管理？

可以在策略中实现资金管理逻辑，例如根据账户资金规模动态调整下单手数：

```javascript
function calculateLots() {
    var accountBalance = getAccountBalance();
    var riskPerTrade = 0.02; // 每笔交易风险2%
    var stopLossPoints = 20; // 止损点数
    var pointValue = 10; // 每点价值
    
    var riskAmount = accountBalance * riskPerTrade;
    var lots = riskAmount / (stopLossPoints * pointValue);
    
    return Math.max(1, Math.floor(lots)); // 至少交易1手
}
```

### 8.4 如何处理错误和异常情况？

可以使用条件语句和错误处理机制来处理可能出现的错误和异常情况：

```javascript
function safeDivide(a, b) {
    if (b == 0) {
        return 0; // 避免除零错误
    }
    return a / b;
}
```

## 9. 高级功能

### 9.1 自定义指标开发

除了使用内置指标外，还可以开发自定义技术指标：

```javascript
function calculateCustomIndicator(data, length) {
    series result;
    
    for (var i = length - 1; i < getBarCount(); i++) {
        var sum = 0;
        for (var j = 0; j < length; j++) {
            sum += data[i - j];
        }
        result[i] = sum / length;
    }
    
    return result;
}
```

### 9.2 多策略组合

可以在一个脚本中实现多个策略，并根据不同条件选择执行：

```javascript
function strategy1() {
    // 策略1逻辑
}

function strategy2() {
    // 策略2逻辑
}

function OnBar() {
    var marketCondition = getMarketCondition();
    
    if (marketCondition == "trending") {
        strategy1();
    } else if (marketCondition == "ranging") {
        strategy2();
    }
}
```

### 9.3 策略自动化部署

TradeBlazer脚本引擎支持将回测通过的策略自动部署到实盘或模拟盘环境，实现交易自动化。

---
**版本**: v1.0
**更新日期**: 2023-xx-xx