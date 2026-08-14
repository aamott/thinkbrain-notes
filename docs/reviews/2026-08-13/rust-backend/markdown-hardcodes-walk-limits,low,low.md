- name: `collect_markdown_file_entries` hardcodes depth/limit constants instead of sharing `MAX_WORKSPACE_ENTRIES`
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/markdown.rs
- lines: 308
- description: `collect_markdown_file_entries` uses literal `depth > 20 || files.len() > 10_000` as its termination guard (line 308). `workspace.rs` defines `MAX_WORKSPACE_ENTRIES: usize = 10_000` (workspace.rs:16) for the same purpose and uses it in `collect_workspace_entries` (workspace.rs:554, 567). The magic `20` (max recursion depth) and `10_000` (max entries) are duplicated policy: the markdown walker and the workspace walker can disagree on the cap, and a vault with >10000 entries will silently truncate at different points depending on which command the frontend calls.

  Recommend: import `MAX_WORKSPACE_ENTRIES` from `workspace` (markdown.rs already imports from `workspace`) and add a `MAX_MARKDOWN_DEPTH: usize = 20` constant alongside it (or in `markdown.rs`) so the limits are named and shared. The depth limit is reasonable but should be a named const, not a literal in a boolean expression.
- verification: read markdown.rs:308 and workspace.rs:16,554,567; confirmed both use 10_000 but only workspace.rs names it.
- estimated savings: ~2 lines + one named constant; main value is removing a silent policy drift.
