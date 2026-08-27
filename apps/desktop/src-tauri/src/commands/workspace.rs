//! Stable workspace command facade.
//!
//! Paths own security and metadata, windows own lifecycle, and entries own
//! tree CRUD. Re-exports preserve every `commands::workspace` caller.

// Keep sibling files nested under this public module.
#[path = "workspace_entries.rs"]
mod workspace_entries;
#[path = "workspace_managed.rs"]
mod workspace_managed;
#[path = "workspace_paths.rs"]
mod workspace_paths;
#[path = "workspace_windows.rs"]
mod workspace_windows;

pub use workspace_entries::*;
pub use workspace_managed::*;
pub use workspace_paths::*;
pub use workspace_windows::*;
