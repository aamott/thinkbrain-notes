# `read_media_file` stats and reads via two path lookups, and the read is uncapped

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/media.rs`
- **Lines:** 44–61

## Description

`read_media_file_bytes` checks `fs::metadata(&file_path)` (path lookup #1) and
then `fs::read(&file_path)` (path lookup #2). Unlike `extensions.rs`, which
opens once and takes `metadata()` from the file handle, both lookups here can
observe different files:

- the size cap (256 MiB) is advisory — a file swapped or grown between the
  `metadata` and `read` calls is pulled into renderer memory at whatever size
  it is at read time;
- a symlink/hardlink swap in the window escapes the containment check in the
  same way as the `extensions.rs` canonicalize→open gap.

`extensions.rs` already demonstrates the tighter pattern — open first, take
metadata from the handle, then cap the read with `Read::take(max + 1)`.

## Recommendation

Mirror `read_extension_file`: `fs::File::open`, `file.metadata()` for the size
check, then `file.take(max_bytes + 1).read_to_end` and compare the byte count —
the bound is enforced at read time and check/read are bound to one inode.

## Verification

`media.rs:46` `fs::metadata(&file_path)`; `:60` `fs::read(&file_path)` — two
path lookups, no handle between them. Compare `extensions.rs` `read_extension_file`,
which comments explicitly that the metadata comes from the open handle.
