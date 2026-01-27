# Tauri Backend

The backend logic resides in `apps/readest-app/src-tauri`. It is the compiled Rust binary that hosts the web frontend.

## Entry Point (`src/lib.rs`)

The application entry point is `run()`, which:

1.  Initializes the `tauri::Builder`.
2.  Registers plugins.
3.  Sets up the main `WebviewWindow`.
4.  Configures platform-specific window behavior (macOS traffic lights, frameless Windows/Linux).
5.  Handles file opening arguments (Argv or CI).

## Tauri Commands

Frontend invokes these via `invoke('command_name')`.

| Command                    | Description                                       |
| -------------------------- | ------------------------------------------------- |
| `start_server`             | Starts a local server for auth callbacks.         |
| `get_environment_variable` | Retrieve env vars (safe allowlist).               |
| `get_executable_dir`       | Get the directory of the running binary.          |
| `download_file`            | Backend-side file download (used for transfers).  |
| `upload_file`              | Backend-side file upload.                         |
| `auth_with_safari`         | **(macOS)** Triggers Safari-based authentication. |
| `start_apple_sign_in`      | **(macOS)** Native Apple Sign-In.                 |
| `set_traffic_lights`       | **(macOS)** Custom window control styling.        |

## Window Management

- **Mobile:** Inject CSS for Safe Area insets (`env(safe-area-inset-top)`).
- **Android E-Ink:** Detects E-Ink devices to enforcing a white background (optimization).
- **File Access:** Dynamically allows access to files opened via OS association by modifying the `fs_scope` at runtime.
