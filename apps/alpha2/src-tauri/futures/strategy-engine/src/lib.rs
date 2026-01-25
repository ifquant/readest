use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum StrategyError {
    #[error("strategy {0} not found")]
    StrategyNotFound(String),
    #[error("invalid parameter: {0}")]
    InvalidParameter(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyConfig {
    pub name: String,
    pub parameters: HashMap<String, String>,
}

pub struct StrategyEngine {
    strategies: HashMap<String, StrategyConfig>,
}

impl StrategyEngine {
    pub fn new() -> Self {
        Self {
            strategies: HashMap::new(),
        }
    }

    pub fn add_strategy(&mut self, config: StrategyConfig) {
        self.strategies.insert(config.name.clone(), config);
    }

    pub fn run_strategy(&self, name: &str) -> Result<(), StrategyError> {
        let _strategy = self.strategies.get(name)
            .ok_or_else(|| StrategyError::StrategyNotFound(name.to_string()))?;
        
        // TODO: 实现策略执行逻辑
        Ok(())
    }
}

impl Default for StrategyEngine {
    fn default() -> Self {
        Self::new()
    }
}