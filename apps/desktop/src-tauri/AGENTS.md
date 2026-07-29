# Desktop Tauri Rust Backend (`apps/desktop/src-tauri/`)

Tauri v2 Rust process managing filesystem, Git commands, and Agent Client Protocol (ACP) host.

## File Map
- `src/main.rs`: Entry point for Tauri desktop executable.
- `src/lib.rs`: Rust library entry, command handlers (FS, Git, ACP host).
- `capabilities/`: Tauri permission definitions and plugin capabilities.
- `gen/`: Tauri auto-generated bindings and schemas.

## Rules & Patterns
- **Security & Permissions**: Define explicit capability permissions in `capabilities/`.
- **ACP Host**: Rust owns agent process lifecycle and emits events; renderer never interacts with ACP directly.
- **Fail Loudly**: Return typed `Result<T, E>` errors from command handlers to renderer.
