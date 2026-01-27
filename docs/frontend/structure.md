# Frontend Application Structure

The frontend is built with **Next.js 16 (App Router)** and resides in `apps/readest-app`.

## Directory Structure (`src/`)

```
src/
├── app/             # App Router: Pages and layouts
├── components/      # Reusable UI components
├── store/           # Global state management (Zustand)
├── hooks/           # Custom React hooks
├── services/        # Logic layers (Database, Sync, etc.)
├── helpers/         # Pure utility functions
└── libs/            # Third-party library integrations
```

## App Router (`src/app`)

The application uses a file-system based router.

### Core Routes

| Route              | Description                                                           |
| ------------------ | --------------------------------------------------------------------- |
| `/`                | Root entry point (often redirects to `/library`).                     |
| `/auth`            | Authentication flows (Sign In / Sign Up).                             |
| `/library`         | **Main Bookshelf**. Grid/List views of books, grouped by tags/series. |
| `/reader/[bookId]` | **Reader Interface**. The immersive reading environment.              |
| `/opds`            | **OPDS Client**. Browse and download from online catalogs.            |
| `/user`            | User settings, cloud status, and profile management.                  |
| `/updater`         | Application auto-update interface.                                    |

### API Routes (`src/app/api`)

Next.js API routes are used primarily for server-side logic required by the web version or specific auth callbacks.

## Key Layouts

- **Root Layout (`layout.tsx`):** Handles global providers (Theme, I18n, Toast notifications).
- **Library Layout:** managing the sidebar and navigation for the bookshelf.

## Navigation Protocol

- **Internal:** Standard `next/link`.
- **Reader:** Uses a specialized URL structure: `/reader/[id]?chapter=[...]`.
