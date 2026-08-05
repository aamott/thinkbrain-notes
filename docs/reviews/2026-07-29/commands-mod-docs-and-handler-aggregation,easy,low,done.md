# Review Action Items: `apps/desktop/src-tauri/src/commands/mod.rs`

## Overview
`apps/desktop/src-tauri/src/commands/mod.rs` serves as the entry module declaring submodules (`git`, `workspace`, `markdown`, `search`, `settings`) for Tauri IPC commands.

---

## Action Items

### 1. Add Subsystem Documentation and Module Docstrings
- **File**: `apps/desktop/src-tauri/src/commands/mod.rs`
- **Issue**: The file contains no module-level docstrings explaining command scope, security guarantees (e.g. path scoping, sandboxing), or structural conventions.
- **Remediation**: Add top-level Google-style docstrings describing the commands subsystem role, architectural boundaries, and safety invariants expected across all submodules.

### 2. Export Centralized Handler Registration Macro or Function
- **File**: `apps/desktop/src-tauri/src/commands/mod.rs`
- **Issue**: Each module exposes raw commands which are individually referenced in `lib.rs`'s `tauri::generate_handler!`.
- **Remediation**: Expose a macro or consolidated registration helper (e.g., `commands::register_all_handlers!`) so new commands added to submodules are automatically aggregated without modifying `lib.rs`.
