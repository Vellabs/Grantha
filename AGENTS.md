# Grantha Agent Guide

High-signal guidance for agents working on the Grantha repository.

## Developer Commands

- **Run Dev App**: `npm run tauri dev` (Runs Vite dev server + Tauri window)
- **Build App**: `npm run build` (Runs `tsc` -> `vite build` -> `tauri build`)
- **Backend Only**: `cargo check` / `cargo build` in `src-tauri/`
- **Frontend Only**: `npm run dev` (Browser-only, but `@tauri-apps/api` calls will fail)

## Architecture

Grantha is a **Tauri 2.0** application (Rust backend + React frontend).

- **Backend (`src-tauri/`)**:
  - `src/lib.rs`: Tauri command handlers and state management (`AppState`).
  - `src/research.rs`: LLM logic using a local **Ollama** instance (expects `http://localhost:11434`).
  - **Database**: SQLite via `rusqlite` stored in `app_data_dir()`. Schema is defined/migrated in `lib.rs` (table: `nodes`, `edges`, `history`).
- **Frontend (`src/`)**:
  - **State**: `zustand` store in `src/store.ts`. Handles all Tauri `invoke` calls.
  - **UI**: React with `lucide-react`. Graphs rendered via custom `KnowledgeGraph` component (likely d3/xyflow based on `package.json`).
  - **Styling**: `App.css` (Plain CSS).

## Critical Context & Quirks

- **LLM Dependency**: Requires **Ollama** running locally with the `gemma4:31b-cloud` model (configurable in `src-tauri/src/research.rs`).
- **Data Flow**: `React -> Zustand -> Tauri Command -> Rust -> Ollama/Wikipedia -> SQLite -> React`.
- **Database Schema**: Managed imperatively in `src-tauri/src/lib.rs` inside the Tauri `setup` hook. No formal migration framework like `diesel` or `sqlx`.
- **Wikipedia API**: Backend fetches from Wikipedia for topic summaries before LLM processing.
- **Graph Visibility**: `visibleNodes` and `visibleEdges` in `store.ts` are filtered subsets of the full DB data to support expanding/collapsing nodes.

## Workflow

1. **Verify Backend**: If changing commands, ensure `AppState` in `lib.rs` is updated.
2. **Verify Frontend**: If adding UI features, update `GranthaStore` in `store.ts` and verify types match Rust structs.
3. **Verification**: Run `npm run tauri dev` to test the full E2E flow. No automated tests are currently present in the root.
