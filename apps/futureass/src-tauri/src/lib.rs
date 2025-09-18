// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_store::{ StoreBuilder};
use std::path::PathBuf;
use tauri::{
  plugin::TauriPlugin, AppHandle, Runtime, Webview, WebviewUrl, command, Manager
};
//use tauri_plugin_http::HttpPlugin;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// 1. 定义一个 Tauri 命令：根据域名获取 Webview 的 Cookies
#[command]
async fn get_webview_cookies<R: Runtime>(
  app: AppHandle<R>,
  domain: String, // 传入要获取 Cookies 的域名（如 "weibo.cn"）
) -> Result<String, String> {
  // 获取当前 Webview 实例（Tauri 1.x 中通过 app 管理 Webview）
  //let webview = app.webview_window("main").ok_or("未找到 Webview 窗口")?;
  //let webview = app.get_window("main").ok_or("未找到 Webview 窗口")?;
  let webview = app.get_webview_window("main").ok_or("未找到 Webview 窗口")?;

  
  // 通过 Webview 的 `eval` 或 `cookies` API 获取 Cookies（不同 Tauri 版本写法略有差异）
  // 方式 1：直接调用 Webview 的 Cookies 接口（推荐，需启用 http 插件）
  let cookies = webview.cookies().map_err(|e| e.to_string())?;
  // 筛选出目标域名的 Cookies
  let target_cookies: Vec<String> = cookies
    .iter()
    .filter(|c| c.domain().map_or(false, |d| d.contains(&domain)))
    .map(|c| format!("{}={}", c.name(), c.value()))
    .collect();
  
  Ok(target_cookies.join("; ")) // 返回格式化的 Cookies 字符串
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
        .invoke_handler(tauri::generate_handler![greet,get_cookies,get_webview_cookies])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
