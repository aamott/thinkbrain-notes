- name: Duplicated fixture/vault/device bootstrap helpers across all four sync test files
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/engine_tests.rs
- lines: 8-21, 23-29
- description: The same temp-dir + bootstrap + Engine/repo setup is reimplemented in every sync test file:
  - `engine_tests.rs` `fixture` (8-21) + `write` (23-29): `make_temp_test_dir` for app_data + vault, `bootstrap`, `Engine::new`, plus a `write` that creates parent dirs.
  - `snapshot_tests.rs` `fixture` (7-17) + `write` (19-25): `make_temp_test_dir` for vault + git_dir, `hidden_repo::open_or_create`, plus the same parent-dir-creating `write`.
  - `status_tests.rs` `vault` (8-21) + `note` (23-25): identical to `engine_tests.rs`'s `fixture` (same `bootstrap` + `Engine::new`), but `note` is a stripped-down `write` that skips parent-dir creation.
  - `round_tests.rs` `device` (12-22) + `write` (31-38): same shape as `snapshot_tests.rs`'s fixture (vault + git_dir + `hidden_repo::open_or_create`), with `write` additionally calling `record`.

  All four reach into `crate::tests::make_temp_test_dir` and either `bootstrap` or `hidden_repo::open_or_create` to build the same "a vault and its hidden repo" pair. The `write` helper is byte-for-byte identical between engine_tests.rs (23-29) and snapshot_tests.rs (19-25). This is the kind of boilerplate the review brief flags — a single `test_support` module (e.g., `apps/desktop/src-tauri/src/commands/sync/test_support.rs` gated on `#[cfg(test)]`) exposing `fixture()`, `vault_only()`, and `write()` would remove ~60 lines of duplication and ensure the setup cannot drift (e.g., one file forgetting to canonicalize, or one `write` forgetting to create parent dirs). The per-file `Fixture`/`Device`/`Vault` structs differ only in whether they hold an `Engine` or a raw `gix::Repository`; a generic `Fixture<R>` or two thin constructors (`engine_fixture`, `repo_fixture`) covers both.
- verification: Read the helper sections of all four files (engine_tests.rs 8-29, snapshot_tests.rs 7-25, status_tests.rs 8-25, round_tests.rs 12-38) and confirmed the duplicated bootstrap/write logic.
