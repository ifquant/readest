import React from 'react';

interface MenuProps {
  setShowLoginModal: () => void;
  setShowSettingsModal: () => void;
}

const Menu: React.FC<MenuProps> = ({
  setShowLoginModal,
  setShowSettingsModal
}) => {
  return (
    <div className="menu-bar">
      <div className="menu-left">
        <span className="menu-item">文件</span>
        <span className="menu-item">编辑</span>
        <span className="menu-item">视图</span>
        <span className="menu-item">交易</span>
        <span className="menu-item">工具</span>
        <span className="menu-item">帮助</span>
      </div>
      <div className="menu-right">
        <button 
          className="menu-btn"
          onClick={setShowLoginModal}
        >
          用户登录
        </button>
        <button 
          className="menu-btn"
          onClick={setShowSettingsModal}
        >
          设置
        </button>
        <span className="menu-info">版本: v1.0.0</span>
      </div>
    </div>
  );
};

export default Menu;