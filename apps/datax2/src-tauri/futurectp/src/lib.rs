use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub mod interface;
pub mod ctp;

pub use ctp::CtpAccountConfig;
pub use ctp::{CtpQuoteGateway, CtpTradeGateway};
pub use interface::IAccount;

#[tauri::command]
async fn ping() -> Result<String, String> {
    Ok("pong from futurectp".to_string())
}

#[tauri::command]
async fn connect_md(md_addr: &str) -> Result<String, String> {
    Ok("pong from futurectp".to_string())
}

async fn connect_td(td_addr: &str, user_id: &str, password: &str) -> Result<String, String> {
    Ok("pong from futurectp".to_string())
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("futurectp")
        .invoke_handler(tauri::generate_handler![ping])
        .build()
}