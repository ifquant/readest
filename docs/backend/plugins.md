# Tauri Plugins

Readest relies on a comprehensive suite of plugins for native capabilities.

## Official Plugins

- **`fs`**: File system access (reading books, writing covers).
- **`http`**: Native HTTP client (bypassing CORS for OPDS, etc.).
- **`shell`**: Open external links.
- **`os`**: Operating system information.
- **`dialog`**: Native file open/save dialogs.
- **`updater`**: In-app updates (Sparkle on macOS, etc.).
- **`deep-link`**: Handles `readest://` protocol.
- **`process`**: Process management.
- **`single-instance`**: Ensures only one instance runs (Desktop).

## Custom & Community Plugins

- **`tauri-plugin-sharekit`**: Wrapper for native sharing sheets (iOS/Android/macOS).
- **`tauri-plugin-oauth`**: Local server handling for OAuth flows.
- **`tauri-plugin-native-tts`**: Integration with system Text-to-Speech engines (AVSpeechSynthesizer, etc.).
- **`tauri-plugin-native-bridge`**: Custom bridge for specific Android intents or native logic not covered by standard plugins.
