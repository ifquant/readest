use serde_json::{Map as JsonMap, Value as JsonValue};
use std::sync::Arc;

use crate::interface::{IAccount, QuoteGateway, TradeGateway};

#[derive(Debug, Clone)]
pub struct CtpAccountConfig {
    // 仅保留通用属性存储
    pub props: JsonMap<String, JsonValue>,
}

// 具体逻辑由 IAccount 的默认实现提供；此处无需额外方法

impl IAccount for CtpAccountConfig {
    fn props(&self) -> &JsonMap<String, JsonValue> {
        &self.props
    }

    fn new_from_props(props: JsonMap<String, JsonValue>) -> Self {
        CtpAccountConfig { props }
    }

    fn required_keys() -> &'static [&'static str] {
        &[
            "md_user_id",
            "md_front_address",
            "md_dynlib_path",
            "td_user_id",
            "td_password",
            "td_app_id",
            "td_auth_code",
            "td_front_address",
            "td_dynlib_path",
        ]
    }
}

// CTP 行情网关具体实现：持有实现了 IAccount 的成员指针
pub struct CtpQuoteGateway {
    pub account: Arc<CtpAccountConfig>,
}

impl QuoteGateway for CtpQuoteGateway {
    fn new<A: IAccount>(account: A) -> Self {
        // 从任意 IAccount 复制属性，构造 CtpAccountConfig 并以 Arc 持有
        let props: JsonMap<String, JsonValue> = account.attrs().into_iter().collect();
        let cfg = CtpAccountConfig { props };
        CtpQuoteGateway {
            account: Arc::new(cfg),
        }
    }
}

// CTP 交易网关具体实现：持有实现了 IAccount 的成员指针
pub struct CtpTradeGateway {
    pub account: Arc<CtpAccountConfig>,
}

impl TradeGateway for CtpTradeGateway {
    fn new<A: IAccount>(account: A) -> Self {
        // 从任意 IAccount 复制属性，构造 CtpAccountConfig 并以 Arc 持有
        let props: JsonMap<String, JsonValue> = account.attrs().into_iter().collect();
        let cfg = CtpAccountConfig { props };
        CtpTradeGateway {
            account: Arc::new(cfg),
        }
    }
}