- name: vault_relative path-escape check is incomplete on Windows and for `.` components
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/snapshot.rs
- lines: 221-238
- description: `vault_relative` only rejects paths containing a `Component::ParentDir`. Other component types that should not appear in a vault-relative note path are silently passed through:
  - `Component::CurDir` (`./note.md`): not rejected. `tree_path` later filters it out (only `Normal` components are kept), so the *tree* is safe, but the `vault.join(&relative)` in `build_tree` (line 113) joins `vault` with `./note.md`, which resolves correctly — so this is benign today but relies on `tree_path`'s filtering as a second line of defense. A future change to `tree_path` could expose it.
  - `Component::Prefix` (Windows drive letter, e.g. `C:foo.md`): on Windows, a path like `C:notes\note.md` is *not absolute* (`Path::is_absolute` returns false for drive-relative paths), so it falls into the `else` branch (line 226-228) and is passed through unchanged. `tree_path` filters out the `Prefix` component, but `vault.join(&relative)` on Windows with a drive-prefixed relative path can resolve against the *current directory's* drive, not the vault's — a potential escape.
  - `Component::RootDir` on a non-absolute path: not reachable on most platforms but worth a defensive reject.

  The fix is to reject any path whose components are not exclusively `Normal`, after stripping the vault prefix. Concretely, replace the `any(ParentDir)` check with `!relative.components().all(|c| matches!(c, Component::Normal(_)))`. This makes the boundary check positive ("only normal components allowed") rather than negative ("no parent dirs"), which is safer against future component types.

  This is a defense-in-depth concern: the paths reaching here come from the watcher and resolution code (trusted callers), but the doc comment on `vault_relative` (lines 214-220) explicitly says "worth a check even when the caller is trusted," so the check should be complete.
- verification: Read of `vault_relative` (lines 221-238) and `tree_path` (lines 247-256); cross-referenced with `std::path::Component` semantics. No test covers `./note.md` or Windows drive-relative paths.
