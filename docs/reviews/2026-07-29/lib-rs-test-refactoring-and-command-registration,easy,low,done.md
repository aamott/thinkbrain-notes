# Review Action Items: `apps/desktop/src-tauri/src/lib.rs`

## Overview
`apps/desktop/src-tauri/src/lib.rs` is the desktop application's main entry point, registering state, plugins, and command handlers, as well as holding a large unit test suite.

---

## Action Items

### 1. Extract Unit Test Suite out of `lib.rs`
- **File**: `apps/desktop/src-tauri/src/lib.rs`
- **Issue**: `lib.rs` is 1,331 lines long, exceeding project modularity guidelines (max 1,000 lines, prefer < 500 lines). The `mod tests` block accounts for ~1,280 lines of the file.
- **Remediation**: Extract tests into dedicated test modules or integration tests (e.g., `tests/` or modular test files under `src/commands/tests/`) to make `lib.rs` a concise entry point (~50 lines).

### 2. Group Command Registrations
- **File**: `apps/desktop/src-tauri/src/lib.rs`
- **Issue**: Over 30 Tauri command invoke handlers are individually listed in `run()`, cluttering the builder pipeline.
- **Remediation**: Provide a consolidated handler macro or registration helper function in `commands` (e.g. `commands::register_handlers!`) to improve maintainability and readability of `lib.rs`.
