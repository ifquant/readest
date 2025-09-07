// macOS-specific Objective-C bindings for native macOS APIs
// Only compiled and linked on macOS targets
#[cfg(target_os = "macos")]
#[macro_use]  // Import cocoa crate macros into global scope
extern crate cocoa;

// macOS-specific Objective-C runtime bindings for low-level macOS integration
// Provides access to macOS Foundation framework and Objective-C messaging
// Only compiled and linked on macOS targets
#[cfg(target_os = "macos")]
#[macro_use]  // Import objc crate macros into global scope
extern crate objc;

// Import Tauri's background throttling policy configuration
// Controls how the app behaves when in the background on different platforms
use tauri::utils::config::BackgroundThrottlingPolicy;
// macOS-specific title bar style configuration for custom window decorations
// Tauri's TitleBarStyle is primarily used on macOS for:
// - Overlay title bars (translucent, modern look)
// - Unified title bars (content extends behind title bar)
// - Custom traffic light buttons positioning
// Windows/Linux use different window decoration systems
#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;

// Desktop-only imports - mobile platforms have different file system and app management APIs
// PathBuf: Standard file path handling (mobile uses content URIs and sandboxed storage)
// Tauri app management: Desktop-specific window and process management features
// FsExt: File system extensions that rely on desktop file system permissions
#[cfg(desktop)]
use {
    std::path::PathBuf,
    tauri::{AppHandle, Listener, Manager, Url},
    tauri_plugin_fs::FsExt,
};

#[cfg(target_os = "macos")]
mod macos;
mod transfer_file;
use tauri::{command, Emitter, WebviewUrl, WebviewWindowBuilder, Window};
use tauri_plugin_oauth::start;
use transfer_file::{download_file, upload_file};

// Grants file access permissions in Tauri's security scopes for desktop apps
// Required for files passed via command line or drag-and-drop to be accessible by the webview
// fs_scope: File system access scope for direct file operations
// asset_protocol_scope: Custom protocol scope for asset:// URLs in webview
#[cfg(desktop)]
fn allow_file_in_scopes(app: &AppHandle, files: Vec<PathBuf>) {
    let fs_scope = app.fs_scope();
    let asset_protocol_scope = app.asset_protocol_scope();
    for file in &files {
        if let Err(e) = fs_scope.allow_file(file) {
            eprintln!("Failed to allow file in fs_scope: {e}");
        } else {
            println!("Allowed file in fs_scope: {file:?}");
        }
        if let Err(e) = asset_protocol_scope.allow_file(file) {
            eprintln!("Failed to allow file in asset_protocol_scope: {e}");
        } else {
            println!("Allowed file in asset_protocol_scope: {file:?}");
        }
    }
}

// Parses command line arguments to extract file paths for desktop apps
// Handles various file path formats including file:// URLs and direct paths
#[cfg(desktop)]
fn get_files_from_argv(argv: Vec<String>) -> Vec<PathBuf> {
    let mut files = Vec::new();
    // NOTICE: `args` may include URL protocol (`your-app-protocol://`)
    // or arguments (`--`) if your app supports them.
    // files may also be passed as `file://path/to/file`
    // Skip the first argument (executable path), process only file arguments
    for (_, maybe_file) in argv.iter().enumerate().skip(1) {
        // skip flags like -f or --flag
        if maybe_file.starts_with("-") {
            continue;
        }
        // Handle three different file path scenarios:
        // 1. file:// URLs (convert to local file paths)
        // 2. Other URLs (skip, keep as string for webview handling)
        // 3. Regular file paths (use directly)
        if let Ok(url) = Url::parse(maybe_file) {
            if let Ok(path) = url.to_file_path() {
                // Scenario 1: file:// URLs successfully converted to local paths
                files.push(path);
            } else {
                // Scenario 2: Other URLs (http://, https://, etc.) - keep as string
                // These will be handled by webview navigation, not file operations
                files.push(PathBuf::from(maybe_file))
            }
        } else {
            // Scenario 3: Regular file system paths
            files.push(PathBuf::from(maybe_file))
        }
    }
    files
}

// Injects file paths into the webview's JavaScript context for "Open With" functionality
// This allows the frontend to know which files were opened via command line or drag-and-drop
#[cfg(desktop)]
fn set_window_open_with_files(app: &AppHandle, files: Vec<PathBuf>) {
    // Convert file paths to properly escaped JavaScript string array format:
    // 1. Convert PathBuf to string representation
    // 2. Escape backslashes (Windows paths) and quotes for JS string literals
    // 3. Wrap each path in quotes and join with commas
    let files = files
        .into_iter()
        .map(|f| {
            let file = f
                .to_string_lossy()
                .replace("\\", "\\\\")  // Escape backslashes: \ -> \\
                .replace("\"", "\\\""); // Escape quotes: " -> \"
            format!("\"{file}\"",)  // Wrap in quotes: path -> "path"
        })
        .collect::<Vec<_>>()
        .join(",");  // Join into comma-separated string: "path1","path2"
    
    // Get the main webview window and inject JavaScript
    let window = app.get_webview_window("main").unwrap();
    let script = format!("window.OPEN_WITH_FILES = [{files}];");
    
    // Execute the script to set the global variable in the webview
    if let Err(e) = window.eval(&script) {
        eprintln!("Failed to set open files variable: {e}");
    }
}

#[cfg(desktop)]
fn set_rounded_window(app: &AppHandle, rounded: bool) {
    let window = app.get_webview_window("main").unwrap();
    let script = format!("window.IS_ROUNDED = {rounded};");
    if let Err(e) = window.eval(&script) {
        eprintln!("Failed to set IS_ROUNDED variable: {e}");
    }
}

// Starts a local HTTP server for OAuth 2.0 authentication flow
// This is required to handle OAuth redirects from external providers (Google, GitHub, etc.)
// The server listens on localhost and captures the redirect URL containing authentication tokens
#[command]
async fn start_server(window: Window) -> Result<u16, String> {
    start(move |url| {
        // OAuth providers redirect to this local server after authentication
        // The URL contains access tokens, refresh tokens, and other auth data
        // Security note: Localhost ports are accessible to any process on the machine
        // Should validate the URL origin and parameters to prevent malicious redirects
        // Ideally extract only the necessary tokens instead of forwarding the entire URL
        
        // Forward the complete redirect URL to the frontend for processing
        // Frontend will extract tokens and complete the authentication flow
        let _ = window.emit("redirect_uri", url);
    })
    .map_err(|err| err.to_string())
}

#[tauri::command]
fn get_environment_variable(name: &str) -> String {
    std::env::var(String::from(name)).unwrap_or(String::from(""))
}

#[derive(Clone, serde::Serialize)]
#[allow(dead_code)]
struct Payload {
    args: Vec<String>,
    cwd: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // Core plugins required for basic functionality
        .plugin(tauri_plugin_process::init()) // 进程管理：启动和管理外部进程
        // OAuth plugin must be registered early because:
        // 1. start_server command depends on tauri_plugin_oauth::start function
        // 2. Plugin registration order matters - handlers may depend on plugin initialization
        .plugin(tauri_plugin_oauth::init()) // OAuth认证：处理第三方登录和授权流程
        // Register command handlers early to ensure they're available during plugin setup
        // Some plugins may need to call these commands during their initialization
        // 
        // 为什么在注册所有插件之前设置 invoke_handler？
        // 1. 依赖关系：某些插件（如 oauth 插件）的初始化过程可能需要调用这些命令
        // 2. 启动顺序：start_server 命令依赖于 tauri_plugin_oauth::start 函数，该函数在插件初始化时可用
        // 3. 避免循环依赖：如果命令在插件之后注册，插件初始化时无法调用这些命令
        // 4. 早期可用性：确保在应用启动的早期阶段就能处理前端发起的命令调用
        .invoke_handler(tauri::generate_handler![
            start_server,
            download_file,
            upload_file,
            get_environment_variable,
            #[cfg(target_os = "macos")]
            macos::safari_auth::auth_with_safari,
            #[cfg(target_os = "macos")]
            macos::apple_auth::start_apple_sign_in,
            #[cfg(target_os = "macos")]
            macos::traffic_light::set_traffic_lights,
        ])
        // Additional plugins registered after command handlers
        // These plugins don't have interdependencies with the early commands
        .plugin(tauri_plugin_shell::init()) // Shell命令执行：运行系统shell命令和打开外部应用
        .plugin(tauri_plugin_opener::init()) // 外部打开：使用系统默认程序打开文件或URL
        .plugin(tauri_plugin_http::init()) // HTTP客户端：发送HTTP请求和处理网络通信
        .plugin(tauri_plugin_os::init()) // 操作系统信息：获取系统版本、平台信息等
        .plugin(tauri_plugin_dialog::init()) // 系统对话框：显示文件选择、消息提示等原生对话框
        .plugin(tauri_plugin_native_bridge::init()) // 原生桥接：提供平台特定的原生功能
                                                      // - Safari认证 (macOS)
                                                      // - 自定义标签页认证 (Android)
                                                      // - 系统字体获取
                                                      // - 屏幕方向锁定
                                                      // - 应用内购买初始化
        .plugin(tauri_plugin_native_tts::init()) // 原生文本转语音：使用系统TTS引擎
                                                    // - 多语言语音合成
                                                    // - 语速、音调调节
                                                    // - 语音暂停/恢复控制
        .plugin(tauri_plugin_fs::init()); // 文件系统操作：读写文件、目录管理等

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
        let _ = app
            .get_webview_window("main")
            .expect("no main window")
            .set_focus();
        let files = get_files_from_argv(argv.clone());
        if !files.is_empty() {
            allow_file_in_scopes(app, files.clone());
        }
        app.emit("single-instance", Payload { args: argv, cwd })
            .unwrap();
    }));

    let builder = builder.plugin(tauri_plugin_deep_link::init());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

    #[cfg(target_os = "macos")]
    let builder = builder.plugin(macos::traffic_light::init());

    #[cfg(target_os = "macos")]
    let builder = builder.plugin(macos::safari_auth::init());

    #[cfg(target_os = "ios")]
    let builder = builder.plugin(tauri_plugin_sign_in_with_apple::init());

    #[cfg(any(target_os = "ios", target_os = "android"))]
    let builder = builder.plugin(tauri_plugin_haptics::init());

    builder
        .setup(|#[allow(unused_variables)] app| {
            #[cfg(desktop)]
            {
                let files = get_files_from_argv(std::env::args().collect());
                if !files.is_empty() {
                    let app_handle = app.handle().clone();
                    allow_file_in_scopes(&app_handle, files.clone());
                    app.listen("window-ready", move |_| {
                        println!("Window is ready, proceeding to handle files.");
                        set_window_open_with_files(&app_handle, files.clone());
                    });
                }
            }

            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_cli::init())?;

                let app_handle = app.handle().clone();
                app.listen("window-ready", move |_| {
                    let webview = app_handle.get_webview_window("main").unwrap();
                    webview
                        .eval("window.__READEST_CLI_ACCESS = true;")
                        .expect("Failed to set cli access config");

                    set_rounded_window(&app_handle, true);
                    #[cfg(target_os = "windows")]
                    if tauri_plugin_os::version()
                        <= tauri_plugin_os::Version::from_string("10.0.19045")
                    {
                        set_rounded_window(&app_handle, false);
                    }
                    #[cfg(target_os = "linux")]
                    {
                        let is_appimage = std::env::var("APPIMAGE").is_ok()
                            || std::env::current_exe()
                                .map(|path| path.to_string_lossy().contains("/tmp/.mount_"))
                                .unwrap_or(false);

                        let script =
                            format!("window.__READEST_UPDATER_DISABLED = {};", !is_appimage);
                        webview
                            .eval(&script)
                            .expect("Failed to set updater disabled config");
                    }
                });
            }

            #[cfg(any(target_os = "windows", target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }

            if let Err(e) = app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            ) {
                eprintln!("Failed to initialize tauri_plugin_log: {e}");
            };

            let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .background_throttling(BackgroundThrottlingPolicy::Disabled)
                .background_color(tauri::window::Color(50, 49, 48, 255));

            #[cfg(desktop)]
            let win_builder = win_builder.inner_size(800.0, 600.0).resizable(true);

            #[cfg(target_os = "macos")]
            let win_builder = win_builder
                .decorations(true)
                .title_bar_style(TitleBarStyle::Overlay)
                .title("");

            #[cfg(all(not(target_os = "macos"), desktop))]
            let win_builder = {
                let mut builder = win_builder
                    .decorations(false)
                    .visible(false)
                    .shadow(true)
                    .title("Readest");

                #[cfg(target_os = "windows")]
                {
                    builder = builder.transparent(false);
                }
                #[cfg(target_os = "linux")]
                {
                    builder = builder.transparent(true);
                }

                builder
            };

            win_builder.build().unwrap();
            // let win = win_builder.build().unwrap();
            // win.open_devtools();

            #[cfg(target_os = "macos")]
            macos::menu::setup_macos_menu(app.handle())?;

            app.handle().emit("window-ready", ()).unwrap();

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(
            #[allow(unused_variables)]
            |app_handle, event| {
                #[cfg(target_os = "macos")]
                if let tauri::RunEvent::Opened { urls } = event {
                    let files = urls
                        .into_iter()
                        .filter_map(|url| url.to_file_path().ok())
                        .collect::<Vec<_>>();

                    let app_handler_clone = app_handle.clone();
                    allow_file_in_scopes(app_handle, files.clone());
                    app_handle.listen("window-ready", move |_| {
                        println!("Window is ready, proceeding to handle files.");
                        set_window_open_with_files(&app_handler_clone, files.clone());
                    });
                }
            },
        );
}
