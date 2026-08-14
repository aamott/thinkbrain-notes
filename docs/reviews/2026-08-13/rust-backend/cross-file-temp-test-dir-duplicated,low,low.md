- name: Cross-file: `temp_test_dir` helper duplicated in three test locations
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/tests.rs
- lines: tests.rs:157-170; themes.rs:278-286; extensions.rs:185-193
- description: The `temp_test_dir(name: &str) -> PathBuf` helper is defined three times with near-identical bodies:
  - `tests.rs:157-170` — `thinkbrain-notes-{name}-{unique}` (nanos from `SystemTime`), canonicalizes the path.
  - `themes.rs:278-286` — `thinkbrain-themes-{name}-{unique}`, no canonicalize.
  - `extensions.rs:185-193` — `thinkbrain-extensions-{name}-{unique}`, no canonicalize.

  The `tests.rs` version canonicalizes (the comment at lines 165-169 explains why: macOS `/var` → `/private/var` symlink breaks FSEvents matching). The other two do not, which is fine for themes/extensions (no watcher) but means the three helpers are not literally identical — they differ in prefix and canonicalization. A single `pub(crate) fn temp_test_dir(name: &str, prefix: &str, canonicalize: bool) -> PathBuf` in `tests.rs` (or a `testutil.rs` module) would replace all three. ~10 lines saved per copy.

  This pairs with the `themes-inline-tests` and `extensions-inline-tests` findings: if those tests move into `tests.rs`, the duplication disappears for free because they can use the existing `tests.rs:temp_test_dir` (with a prefix parameter or by renaming the existing one).

  Low urgency; flag for the test-consolidation pass.
- verification: grepped `fn temp_test_dir` — 3 definitions (tests.rs:157, themes.rs:278, extensions.rs:185). Read all three; bodies differ only in prefix string and canonicalize call.
- estimated savings: ~20 lines (two of the three copies deleted, the third generalized).
