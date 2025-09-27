use thiserror::Error;

#[derive(Error, Debug)]
pub enum CtpError {
    #[error("connection failed: {0}")]
    ConnectionFailed(String),
}

pub struct CtpClient {
    endpoint: String,
}

impl CtpClient {
    pub fn new(endpoint: impl Into<String>) -> Self {
        Self { endpoint: endpoint.into() }
    }

    pub fn connect(&self) -> Result<(), CtpError> {
        // TODO: 接入真实的 CTP 连接逻辑
        if self.endpoint.is_empty() {
            Err(CtpError::ConnectionFailed("empty endpoint".into()))
        } else {
            Ok(())
        }
    }
}