- name: `classify_event` `EventKind::Modify(ModifyKind::Name(RenameMode::From))` arm is empty-body-single-expression and could fold into `removal`
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/watcher.rs
- lines: 182-187
- description: Lines 182-187:
  ```rust
  EventKind::Modify(ModifyKind::Name(RenameMode::From)) => {
      removal(root, paths)
  }
  EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
      single(root, paths, WorkspaceChangeKind::Created)
  }
  ```
  The `From` arm is a single-expression block wrapping `removal(root, paths)` — the braces add two lines for nothing. The `To` arm is the same with `single(...)`. Both can be written as `=> removal(root, paths),` and `=> single(root, paths, WorkspaceChangeKind::Created),` (the `RenameMode::Both` arm at line 179 already uses the brace-less form). This is a pure style compaction (~4 lines) with no behavior change. Not a major win but it is the kind of inconsistency a quick pass should clean up since the adjacent arm one line up already uses the shorter form.

  Do NOT fold `From` and the catch-all `Name(_)` (line 188) together — they have different semantics (`From` is a known rename-half, `Name(_)` falls through to `classify_unpaired_rename`).
- verification: read lines 175-205; line 179 (`RenameMode::Both`) uses `=> classify_rename(root, paths),` (brace-less), lines 182-187 use braces for one expression.
- estimated savings: ~4 lines.
