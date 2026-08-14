- name: `themes.rs` ships 161 lines of inline unit tests inside the production module file
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/themes.rs
- lines: 268-430
- description: `themes.rs` is 430 lines, of which 162 (lines 268-430) are a `#[cfg(test)] mod tests` block inline in the same file. The other command modules do *not* inline their tests — `git.rs`, `markdown.rs`, `workspace.rs`, `settings.rs`, and `search.rs` all keep their tests in the top-level `src/tests.rs` (which is `mod tests;` from `lib.rs:10`). `extensions.rs` also inlines its tests (lines 179-340), so the codebase is inconsistent, but the dominant pattern is "tests live in `src/tests.rs`."

  Two compaction notes:
  1. Moving the themes tests to `src/tests.rs` would drop `themes.rs` from 430 → 268 lines (well under the 500 preferred) and make the test layout consistent. The tests use `super::*` and the public API, so they port cleanly.
  2. The `temp_test_dir` helper (lines 278-286) is duplicated across `themes.rs:278`, `extensions.rs:185`, and `tests.rs:157` — three copies of the same "unique temp dir from nanos" function. Consolidating into `tests.rs` (or a `testutil.rs`) removes ~10 lines per copy.

  Not a blocker; flag for consistency. The inline tests do not break anything, but the file-size note in AGENTS.md and the existing `tests.rs` convention both point to moving them.
- verification: read themes.rs:268-430 (inline `mod tests`); grepped `temp_test_dir` — found in themes.rs:278, extensions.rs:185, tests.rs:157. Confirmed `lib.rs:10` declares `mod tests;` and the other command modules have no inline `#[cfg(test)]`.
- estimated savings: ~162 lines moved out of themes.rs (file size 430→268), ~20 lines from consolidating `temp_test_dir`.
- resolution: Deferred — high cost, low reward. Moving the 6 inline tests to src/tests.rs requires broadening 3 private helpers (is_theme_file, stem_name, read_theme_name) to pub(crate) just for test access, which leaks implementation details. The temp_test_dir dedup is being handled by another subagent (cross-file-temp-test-dir-duplicated). tests.rs is already 2474 lines; adding ~160 more works against the file-size goal in AGENTS.md. The inline tests pass and do not break anything; the consistency gain is cosmetic.
