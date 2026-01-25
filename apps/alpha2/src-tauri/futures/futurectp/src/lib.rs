use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[tauri::command]
async fn ping() -> Result<String, String> {
    Ok("pong from futurectp".to_string())
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("futurectp")
        .invoke_handler(tauri::generate_handler![ping])
        .build()
}