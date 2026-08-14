- name: Cross-file: markdown and workspace rename/delete diverge on search-index cleanup and on `record_self_write` coverage
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/markdown.rs
- lines: markdown.rs:189-240, 243-270; workspace.rs:244-299, 308-337
- description: The markdown commands and the workspace commands both rename and delete files, but they have inconsistent post-operation behavior:

  | Operation | `rename_markdown_file` (markdown.rs:189-240) | `rename_workspace_entry` (workspace.rs:244-299) |
  |---|---|---|
  | `record_self_write(source)` | yes (line 224) | yes (line 287) |
  | `record_self_write(dest)` | yes (line 225) | yes (line 288) |
  | `remove_index_document` | yes (line 235) | **no** |
  | Takes `app: tauri::AppHandle` | yes | no |

  | Operation | `delete_markdown_file` (markdown.rs:243-270) | `delete_workspace_entry` (workspace.rs:308-337) |
  |---|---|---|
  | `record_self_write(path)` | yes (line 255) | yes (line 323) |
  | `remove_index_document` | yes (line 265) | **no** |
  | Takes `app: tauri::AppHandle` | yes | no |

  The workspace commands do not update the search index when a markdown file is renamed or deleted through the explorer tree (see the dedicated finding `workspace-rename-delete-skips-search-index,medium,high.md`). This cross-file note calls out the broader pattern: the two command families overlap in responsibility (both can rename/delete a `.md` file) but only one keeps the index consistent. The right fix is probably to make the workspace commands the single source of truth for filesystem mutations and have the markdown commands delegate to them (or vice versa), so the `record_self_write` + `remove_index_document` + lock-acquisition logic lives in one place. Today the same invariants are maintained in two parallel code paths, which is how the index-cleanup gap appeared.

  A smaller fix: have `rename_workspace_entry` / `delete_workspace_entry` call `remove_index_document` when the entry `is_markdown` (requires adding `app: tauri::AppHandle` to their signatures, matching the markdown commands). This is the minimum change to close the bug without consolidating the two paths.
- verification: read markdown.rs:189-270 and workspace.rs:244-337 side by side; grepped `remove_index_document` — only markdown.rs calls it from production code.
