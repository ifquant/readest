# Reading Engine

Readest delegates the complexity of parsing and rendering various ebook formats to a local workspace package: `packages/foliate-js`. This is a custom wrapper around the [foliate-js](https://github.com/johnfactotum/foliate-js) library.

## Supported Formats

The engine supports a wide range of formats via different importer modules:

- **EPUB:** Native support via `foliate-js/epub.js`.
- **PDF:** Rendered using `foliate-js/pdf.js` (which typically wraps PDF.js).
- **MOBI/AZW:** Decoded and converted in-memory.
- **Comics (CBZ):** Supported via `foliate-js/comic-book.js`.
- **FB2:** Supported via `foliate-js/fb2.js`.

## Architecture

The reading view is encapsulated in a Custom Element `<foliate-view>` (or similar) which communicates with the React app via events.

### Integration Hooks

- **`useFoliateEvents`**: The primary bridge. It listens for events dispatched by the view:
  - `load`: When a book is ready.
  - `relocate`: When reading progress changes (CFI updates).
  - `select`: When text is selected (for highlights/notes).
- **`useTextTranslation`**: Extracts selected text from the view for translation services.

## Annotations

Annotations (Highlights and Notes) are managed using the **EPUB CFI (Canonical Fragment Identifier)** standard.

- **Rendering:** The `Overlayer` module from `foliate-js` is used to draw highlights directly on top of the document.
- **Storage:** Annotations are stored locally (and synced) as CFI ranges.
