# Synchronization

Readest implements a hybrid synchronization strategy to ensure cross-device consistency for both library content and reading progress.

## 1. Cloud Storage Sync (File Sync)

This layer handles the physical files of the books and their covers.

- **Backend:** Supabase Storage (inferred from roadmap/usage of `uploadFile` to cloud paths).
- **Mechanism:**
  - Checks for file existence locally vs cloud.
  - Uploads/Downloads books and covers on demand or via "Traffic Manager".
  - Uses `CLOUD_BOOKS_SUBDIR` to namespace user content.
- **Key Methods in `AppService`:**
  - `uploadBook()`
  - `downloadBook()` / `downloadCloudFile()`
  - `processTransferQueue()` (managed by `transferStore`)

## 2. Reading Progress Sync (KOSync)

Reading progress is synced using the **KOSync** protocol, making Readest interoperable with other KOSync-compatible readers (most notably **KOReader** on E-Ink devices).

### KOSync Client (`services/sync/KOSyncClient.ts`)

- **Protocol:** REST-like API (`/syncs/progress`).
- **Data:**
  - **Progress:** CFI (Canonical Fragment Identifier) or structural location.
  - **Percentage:** 0-100 float.
  - **Device ID:** Unique identifier for conflict resolution.
  - **Document Hash:** MD5 checksum of the book file is used to match books across devices.
- **Workflow:**
  1.  **Pull:** On book open, fetch latest progress.
  2.  **Push:** Periodically or on close, push current progress.
  3.  **Conflict:** Latest timestamp typically wins (implied).

## Data Consistency

- Books are matched by **MD5 Hash**. If you modify a file (e.g. convert it), the hash changes, and it is treated as a new book for sync purposes.
