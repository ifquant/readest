use std::collections::HashMap;
use serde_json::{Map as JsonMap, Value as JsonValue};

// 通用账户接口，作为“基础类”提供默认实现
pub trait IAccount: Sized {
    // 具体类型需要实现的三个钩子
    fn props(&self) -> &JsonMap<String, JsonValue>;
    fn new_from_props(props: JsonMap<String, JsonValue>) -> Self;
    fn required_keys() -> &'static [&'static str];

    // 通用默认实现：属性访问
    fn get_attr(&self, key: &str) -> Option<JsonValue> {
        self.props().get(key).cloned()
    }

    fn attrs(&self) -> HashMap<String, JsonValue> {
        self.props()
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }

    // 通用默认实现：校验与构造
    fn missing_required_keys(&self) -> Vec<String> {
        Self::required_keys()
            .iter()
            .filter(|k| !self.props().contains_key(**k))
            .map(|s| s.to_string())
            .collect()
    }

    fn validate_props(&self) -> Result<(), String> {
        let missing = self.missing_required_keys();
        if missing.is_empty() {
            Ok(())
        } else {
            Err(format!("missing required keys: {:?}", missing))
        }
    }

    fn is_valid(&self) -> bool {
        self.missing_required_keys().is_empty()
    }

    fn from_json(props: JsonValue) -> Option<Self> {
        let map = match props {
            JsonValue::Object(m) => m,
            _ => return None,
        };
        let inst = Self::new_from_props(map);
        if inst.is_valid() {
            Some(inst)
        } else {
            None
        }
    }

    fn from_file(path: &std::path::Path) -> Option<Self> {
        let content = std::fs::read_to_string(path).ok()?;
        let json: JsonValue = serde_json::from_str(&content).ok()?;
        Self::from_json(json)
    }
}

// 行情网关抽象接口：为实现者提供统一的构造入口
pub trait QuoteGateway {
    // 使用实现了 IAccount 的账户配置进行构造
    fn new<A: IAccount>(account: A) -> Self
    where
        Self: Sized;
}

// 交易网关抽象接口：为实现者提供统一的构造入口
pub trait TradeGateway {
    // 使用实现了 IAccount 的账户配置进行构造
    fn new<A: IAccount>(account: A) -> Self
    where
        Self: Sized;
}