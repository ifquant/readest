// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;
use tauri_plugin_store::{ StoreBuilder};
use std::path::PathBuf;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}


#[tauri::command]
async fn get_cookies(app: tauri::AppHandle) -> Result<String, String> {
    // 获取存储路径
    let store_path = match app.path().app_data_dir() {
        Ok(dir) => dir.join("cookies.json"), // 将数据存储在 app 的数据目录中
        Err(err) => return Err(format!("无法获取应用数据目录: {:?}", err)),
    };

    // 使用 StoreBuilder 创建存储实例
    let store = StoreBuilder::new(&app, store_path)
        .build()
        .map_err(|err| format!("无法创建存储实例: {:?}", err))?;

    // 获取存储的 Cookie 数据
    match store.get("cookies") {
        Some(cookies) => Ok(cookies.to_string()),
        None => Err("未找到 Cookie 数据".to_string()),
    }
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![greet,get_cookies])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
