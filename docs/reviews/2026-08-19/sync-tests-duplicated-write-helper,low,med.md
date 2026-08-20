- name: Duplicated write helper with parent-dir creation across sync test files
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/snapshot_tests.rs
- lines: 19-25
- description: The `write(root, relative, contents)` helper — create parent dirs, then `fs::write` with `.expect` — appears in three of the four reviewed files with near-identical bodies:
  - `engine_tests.rs` lines 23-29 (`write(&f.vault, ...)`)
  - `snapshot_tests.rs` lines 19-25 (`write(vault, ...)`)
  - `round_tests.rs` lines 31-38 (`write(device, relative, contents)` — same body plus a `record` call)

  `status_tests.rs` has a stripped-down `note` (23-25) that is a subset of the same helper (no parent-dir creation). This is the most-copy-pasted helper in the sync test suite. A single shared `write(root: &Path, relative: &str, contents: &str)` in a `test_support` module would replace all four, with `round_tests.rs`'s version becoming `write(...); record(device, relative)`. The shared version should keep the parent-dir-creation behavior (so `note` in status_tests.rs gains it for free, allowing nested-note tests there too). This is filed separately from the fixture-helper finding because `write` is independently reusable — even if the fixture structs stay per-file, `write` is a pure leaf helper with no state.
- verification: Read the `write`/`note` helpers in all four files (engine_tests.rs 23-29, snapshot_tests.rs 19-25, round_tests.rs 31-38, status_tests.rs 23-25) and confirmed the duplicated parent-dir + `fs::write` body.
