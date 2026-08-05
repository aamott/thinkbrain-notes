# Desktop App Package (`apps/desktop/`)

Tauri v2 desktop wrapper containing the React frontend user interface and the Rust native backend system process.

## Subdirectories & Subfolder Maps
- **`src/`** - Desktop React UI application. See [apps/desktop/src/AGENTS.md](file:///media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/AGENTS.md).
- **`src-tauri/`** - Native Rust backend & ACP host. See [apps/desktop/src-tauri/AGENTS.md](file:///media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/AGENTS.md).
- **`e2e/`** - End-to-end Playwright tests for desktop application scenarios.

## Rules & Boundaries
- **Process Isolation**: The renderer (`src/`) runs in a web context; the native backend (`src-tauri/`) handles filesystem, Git, and ACP host execution.
- **IPC Boundary**: UI components must never invoke Tauri Rust IPC functions directly. All IPC invocations must pass through `apps/desktop/src/native/` bridge adapters.
