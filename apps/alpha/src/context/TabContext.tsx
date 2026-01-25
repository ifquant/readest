import React, { createContext, useState, useContext, ReactNode } from 'react';

// Tab数据类型定义
interface TabItem {
  symbol: string;
}

// Context类型定义
interface TabContextType {
  tabs: TabItem[];
  activeTab: string;
  selectedSymbol: string;
  addTab: (symbol: string) => void;
  handleTabClick: (symbol: string) => void;
  handleTabClose: (symbol: string) => void;
  setTabs: React.Dispatch<React.SetStateAction<TabItem[]>>;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  setSelectedSymbol: React.Dispatch<React.SetStateAction<string>>;
}

// 创建Context
const TabContext = createContext<TabContextType | undefined>(undefined);

// 创建Provider组件
export const TabProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // 状态管理
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USDT');
  // 存储所有打开的tabs - 持久化管理
  const [tabs, setTabs] = useState<TabItem[]>([]);
  // 当前激活的tab
  const [activeTab, setActiveTab] = useState<string>('');

  // 添加新的tab
  const addTab = (symbol: string) => {
    setTabs(prevTabs => {
      if (!prevTabs.some(tab => tab.symbol === symbol)) {
        return [...prevTabs, { symbol }];
      }
      return prevTabs;
    });
    setActiveTab(symbol);
    setSelectedSymbol(symbol);
  };

  // 切换tab
  const handleTabClick = (symbol: string) => {
    setActiveTab(symbol);
    setSelectedSymbol(symbol); // 确保selectedSymbol与activeTab同步
    console.log('handleTabClick', symbol);
  };

  // 关闭tab
  const handleTabClose = (symbolToClose: string) => {
    setTabs(prevTabs => {
      if (prevTabs.length <= 1) return prevTabs; // 至少保留一个tab
      
      const newTabs = prevTabs.filter(tab => tab.symbol !== symbolToClose);
      // 如果关闭的是当前激活的tab，则激活第一个tab
      if (activeTab === symbolToClose && newTabs.length > 0) {
        setActiveTab(newTabs[0].symbol);
        setSelectedSymbol(newTabs[0].symbol);
      }
      return newTabs;
    });
  };

  // Context值
  const contextValue: TabContextType = {
    tabs,
    activeTab,
    selectedSymbol,
    addTab,
    handleTabClick,
    handleTabClose,
    setTabs,
    setActiveTab,
    setSelectedSymbol
  };

  return (
    <TabContext.Provider value={contextValue}>
      {children}
    </TabContext.Provider>
  );
};

// 自定义Hook，方便使用Context
export const useTabContext = () => {
  const context = useContext(TabContext);
  if (context === undefined) {
    throw new Error('useTabContext must be used within a TabProvider');
  }
  return context;
};