# State Management

Readest uses **Zustand** for global state management. The stores are located in `src/store/`.

## Key Stores

### Reader State

- **`readerStore.ts`**: The most complex store. Manages:
  - Current book metadata.
  - Reading location/progress (CFI).
  - Table of Contents (TOC).
  - Annotations (Highlight/Note) active state.
- **`customFontStore.ts` / `customTextureStore.ts`**: User preferences for reading appearance.
- **`proofreadStore.ts`**: State for the Proofread (Edit) mode, handling text replacements.

### Library & App State

- **`libraryStore.ts`**: Manages the list of books, loading states, and view preferences (Grid/List, sorting).
- **`sidebarStore.ts`**: UI state for the collapsible sidebar.
- **`themeStore.ts`**: Application theme (Light/Dark/System) and color accents.
- **`transferStore.ts`**: Manages the queue for background file transfers (Upload/Download).

### System State

- **`deviceStore.ts`**: Information about the running platform (Web/Desktop/Mobile) and capabilities.
- **`settingsStore.ts`**: General application settings.
- **`trafficLightStore.ts`**: macOS-specific UI state for window controls.

## Persistence

Some stores use `persist` middleware to save state to `localStorage` (or filesystem via adapters in Tauri), ensuring user preferences like Theme and Font settings are remembered across restarts.
