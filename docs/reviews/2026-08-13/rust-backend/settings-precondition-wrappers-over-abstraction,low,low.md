- name: `check_app_settings_precondition` / `check_workspace_settings_precondition` are two-line wrappers over a shared helper
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/settings.rs
- lines: 120-148, 238-248
- description: `check_app_settings_precondition` (lines 120-130) and `check_workspace_settings_precondition` (lines 238-248) are each a single call to `check_settings_precondition` with a different `code` and `message` string. The shared `check_settings_precondition` (lines 137-148) already does the only real work (`current == expected`). The two wrappers are `pub` and called once each in production (`write_app_settings` line 166, `write_workspace_settings` line 266) plus in tests (`tests.rs` lines 1614-1662).

  This is borderline over-abstraction: the wrapper exists to bind a `(code, message)` pair to a document type, but the pair is just two string literals. Two reasonable options:
  - Inline the two call sites: replace each wrapper with a direct `check_settings_precondition(current, expected, "settings.app_conflict", "...")` call. Removes ~20 lines, the indirection, and the `pub` surface. The call sites stay readable because the code/message are right there.
  - Keep the wrappers but make `check_settings_precondition` private (it already is `fn`, not `pub`) and drop the redundant doc comments on the wrappers.

  Prefer inlining — the wrappers add a layer with no behavior, and the `code`/`message` are more readable at the call site than behind a name. Note: `tests.rs` references the two `pub` wrappers (lines 1614-1662), so inlining requires updating those tests to call `check_settings_precondition` directly (it would need to become `pub(crate)` for the test to reach it).
- verification: read lines 120-148 and 238-248; grepped both wrapper names — only call sites are settings.rs:166/266 and tests.rs:1614-1662.
- estimated savings: ~20 lines (wrappers + their doc comments), or 0 if keeping — flag is about indirection, not size.
