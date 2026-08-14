- name: Cross-file: hidden-name predicate and ignored-folder list duplicated across workspace, markdown, and watcher
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/workspace.rs
- lines: workspace.rs:15,654-656; markdown.rs:331; watcher.rs:156-158
- description: The "is this entry hidden?" predicate (`name.starts_with('.')`) is written three times:
  - `workspace.rs:654-656` — `pub fn is_hidden_name(name: &str) -> bool { name.starts_with('.') }`
  - `markdown.rs:331` — inlined as `name.starts_with('.')` in the `if` condition
  - `watcher.rs:156-158` — `fn is_hidden(name: &str) -> bool { name.starts_with('.') }` (private)

  The "ignored folders" list `["node_modules", "target", "dist", "vendor"]` is written twice:
  - `workspace.rs:15` — `pub const IGNORED_FOLDERS: &[&str] = &["node_modules", "target", "dist", "vendor"];`
  - `markdown.rs:331` — inlined as `["node_modules", "target", "dist", "vendor"].contains(&name.as_str())`

  `watcher.rs` already imports `IGNORED_FOLDERS` from `workspace` (line 47) but defines its own `is_hidden`. `markdown.rs` already imports from `workspace` (lines 9-12) but inlines both.

  **Real risk**: the ignored-folder list can drift. If a new folder (say `.obsidian` is already hidden by the dot rule, but suppose `build/` or `.next/`) is added to `IGNORED_FOLDERS`, the markdown walker will still descend into it and index `.md` files inside, while the explorer and watcher ignore it. The index and the explorer will disagree.

  **Fix**: one `pub` helper in `workspace.rs`:
  ```rust
  pub fn is_ignored_entry_name(name: &str) -> bool {
      is_hidden_name(name) || IGNORED_FOLDERS.contains(&name)
  }
  ```
  Then `markdown.rs:331` becomes `if is_ignored_entry_name(&name) { continue; }` and `watcher.rs:153` becomes `!is_ignored_entry_name(part)`. Delete `watcher.rs:156-158`. Three call sites, one predicate, no drift.
- verification: grepped `node_modules.*target.*dist.*vendor` (2 matches: workspace.rs:15, markdown.rs:331) and `starts_with\('\.'\)` (3 matches: workspace.rs:655, markdown.rs:331, watcher.rs:157). markdown.rs and watcher.rs both already import from `workspace`.
- estimated savings: ~5 lines + removes a drift hazard where the markdown walker can index folders the explorer hides.
