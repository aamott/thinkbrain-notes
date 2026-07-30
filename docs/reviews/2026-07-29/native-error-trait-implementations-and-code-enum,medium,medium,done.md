# Review Action Items: `apps/desktop/src-tauri/src/error.rs`

## Overview
`apps/desktop/src-tauri/src/error.rs` defines the error structure `NativeError` passed across the Tauri IPC boundary to the frontend renderer.

---

## Action Items

### 1. Implement `std::fmt::Display` and `std::error::Error` for `NativeError`
- **File**: `apps/desktop/src-tauri/src/error.rs`
- **Issue**: `NativeError` derives `Debug, Clone, PartialEq, Eq, Serialize`, but does not implement `std::fmt::Display` or `std::error::Error`.
- **Remediation**: Implement `Display` (formatting `[code] message` and optional details) and `std::error::Error` so `NativeError` can function seamlessly with standard Rust error traits, logging, and error-handling abstractions.

### 2. Introduce Typed Error Codes / Constants
- **File**: `apps/desktop/src-tauri/src/error.rs`
- **Issue**: Error codes (e.g., `"git.not_installed"`, `"workspace.invalid_path"`, `"git.command_failed"`) are specified as string literals in various command modules.
- **Remediation**: Define an enum or static string constants for standard error codes (e.g., `ErrorCode::InvalidPath`) to prevent typos and ensure consistency across native commands and frontend error handling.
