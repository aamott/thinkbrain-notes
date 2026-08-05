# Cross-File Review Action Items: `lib.rs`, `error.rs`, `commands/mod.rs`

## Overview
Analysis of cross-file interactions between `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/src/error.rs`, and `apps/desktop/src-tauri/src/commands/mod.rs`.

---

## Inter-File Connections

1. **IPC & Command Entry point**:
   - `lib.rs` initializes the Tauri runtime and imports command handlers from `commands/mod.rs` (via `use commands::*;` and direct paths like `commands::workspace::...`).
   - `lib.rs` explicitly enumerates all commands in `tauri::generate_handler![...]`.

2. **Error Propagation Boundary**:
   - `lib.rs` re-exports `NativeError` from `error.rs`.
   - Command implementations inside `commands/` return `Result<T, NativeError>`, which Tauri serializes to the frontend renderer.
   - Test suites in `lib.rs` assert exact string matches on `NativeError.code` (e.g. `"workspace.invalid_path"`, `"git.not_installed"`).

3. **Testing Coupling**:
   - `lib.rs` contains unit tests for all command submodules (`git`, `workspace`, `search`, `settings`, `markdown`), coupling command implementation testing with application bootstrapping logic.

---

## Derived Cross-File Action Items

### 1. Synchronize Error Codes Across IPC Boundary & Tests
- **Files**: `apps/desktop/src-tauri/src/error.rs`, `apps/desktop/src-tauri/src/commands/*`, `apps/desktop/src-tauri/src/lib.rs`
- **Issue**: Error code strings like `"workspace.invalid_path"` are defined in individual command files, asserted in `lib.rs` unit tests, and consumed by TypeScript UI code. Lack of central definition risks string drift or typo mismatches.
- **Remediation**: Create a shared `ErrorCode` enum or structured constants in `error.rs` and refactor command handlers and `lib.rs` unit tests to use these constants.

### 2. Decouple `lib.rs` from Command Inventory Changes
- **Files**: `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/src/commands/mod.rs`
- **Issue**: Adding a new Tauri command requires editing both `commands/<submodule>.rs` and the `tauri::generate_handler!` list in `lib.rs`.
- **Remediation**: Define a registration macro/function in `commands/mod.rs` that exposes the combined handler array, allowing `lib.rs` to remain unchanged when adding or modifying command submodules.
