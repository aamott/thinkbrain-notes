# Symlink/gitlink transitions and symlinked notes are invisible to the history walk

- **Difficulty:** medium
- **Urgency:** low
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/history_walk.rs`
- **Lines:** 242-245, 379-395; test gap in `history_ingest_tests.rs:88-99`

## Description

Three related gaps around non-blob entry modes:

1. `blob_at` (242-245) returns `None` unless `entry.mode().is_blob()`; gix's `is_blob()` covers `Blob`/`BlobExecutable` but not `Link`. A note committed as a symlink in imported history reads as "absent" — no version is ever listed, later versions report as `Added` rather than `Updated`, and its content can't be restored. (Matches the existing convention in `history.rs:273`, so possibly deliberate — but it silently drops a real stored blob.)
2. In `touched` (379-395), `Change::Modification` uses only the *new* `entry_mode` and drops the record unless `mode.is_blob()`. When a note is replaced by a submodule (gitlink) or symlink, the change is filtered out entirely — the ledger loses the `Removed` event for the path even though the file's blob version ceased to exist.
3. Untested: the `commit_editing` fixture can only produce `EntryKind::Blob` entries; no test constructs a symlink (0o120000) or executable entry. Ingest copies them correctly (`collect_reachable` treats non-tree/non-commit as blob), but the read-side filtering is unexercised.

## Recommendation

For `Modification`, if `previous_entry_mode.is_blob() && !entry_mode.is_blob()`, emit `NoteChange::Removed` for the path instead of dropping the record. Decide whether `blob_at` should include `mode.is_link()` (symlinks are stored as blob objects) or document that symlinked notes are intentionally excluded. Extend the test fixture with a link/executable entry kind and pin down the ledger/note-event behavior for file→symlink transitions.

## Verification

`EntryMode::is_blob()` matches only `Blob | BlobExecutable`; `Link` is handled separately elsewhere (apply.rs:397 vs line 302). `Change::Modification` carries both `previous_entry_mode` and `entry_mode`; only `entry_mode` is matched at line 388. Neither test file constructs a `Link` entry.
