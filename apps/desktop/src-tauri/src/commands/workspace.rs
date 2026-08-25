//! Workspace command facade.
//!
//! Historically a single 800-line module combining window lifecycle, entry
//! CRUD, path security, tree traversal, hashing, and atomic file replacement.
//! Those responsibilities now live in three focused sibling modules, with this
//! file kept as the stable re-export path so frontend command registration
//! (`app_command_handlers!`) and every existing `crate::commands::workspace::*`
//! caller continues to resolve unchanged.
//!
//! Module boundaries:
//! - [`workspace_paths`]: path resolution/security, shared constants, the
//!   entry-mutation lock, ignored-name classification, entry metadata, the
//!   deterministic workspace hash, and the atomic-write re-export. Foundation
//!   module — no dependency on the other two siblings.
//! - [`workspace_windows`]: per-window root registry, opaque label generation,
//!   the off-main-thread window builder, `open_workspace_window`,
//!   `window_workspace_root`, plus the shell-status and `open_workspace`
//!   commands. Depends on `workspace_paths` for root resolution and
//!   description.
//! - [`workspace_entries`]: the `WorkspaceEntry` shape, recursive entry
//!   collection, and the create/rename/delete explorer commands (with their
//!   `#[cfg(test)]` test-only entry points). Depends on `workspace_paths` for
//!   resolution, the mutation lock, parent-dir creation, ignored-name
//!   classification, and entry metadata.
//!
//! Unavoidable coupling: `workspace_windows` and `workspace_entries` both
//! import from `workspace_paths`; the two never import from each other. The
//! private `failed` helper is duplicated per sibling (matching the precedent
//! in `markdown.rs`) so no module widens its API just to share a three-line
//! error builder.

// `#[path]` keeps these focused siblings as files next to `workspace.rs` in
// `commands/` (rather than a `commands/workspace/` directory) while still
// nesting them under the `workspace` module so the glob re-exports below are
// the only public entry point. Callers keep resolving `crate::commands::workspace::*`.
#[path = "workspace_entries.rs"]
mod workspace_entries;
#[path = "workspace_paths.rs"]
mod workspace_paths;
#[path = "workspace_windows.rs"]
mod workspace_windows;

pub use workspace_entries::*;
pub use workspace_paths::*;
pub use workspace_windows::*;
