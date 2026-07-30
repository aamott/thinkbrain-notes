# Desktop Tauri Rust Backend (`apps/desktop/src-tauri/`)

Tauri v2 Rust process managing native filesystem access, Git execution, and Agent Client Protocol (ACP) host runtime.

## Module Map
- **`src/main.rs`**: Entry point for Tauri desktop executable.
- **`src/lib.rs`**: Rust library entry point and command handlers (FS, Git, ACP host).
- **`capabilities/`**: Tauri permission definitions and plugin capabilities.
- **`gen/`**: Tauri auto-generated bindings and schemas.

## Rules & Patterns
- **Security & Permissions**: Define explicit capability permissions in `capabilities/`.
- **ACP Host**: Rust owns agent process lifecycle (`agent-client-protocol` crate) and emits Tauri events to renderer.
- **Fail Loudly**: Return typed `Result<T, E>` errors from command handlers to renderer.
