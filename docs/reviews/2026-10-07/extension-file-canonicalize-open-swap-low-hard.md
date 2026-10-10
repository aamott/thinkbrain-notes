# Containment check and `File::open` are separate path lookups — a swapped component escapes

- **Urgency:** low
- **Difficulty:** hard
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/extensions.rs`
- **Lines:** 65–114, 133

## Description

`resolve_extension_file` proves containment by canonicalizing the target path
(`resolve_contained_existing_path`), then returns the canonical `PathBuf`.
`read_extension_file` afterwards calls `fs::File::open(&path)` — a fresh,
path-based lookup. Between canonicalization and `open`, anything with write
access to the extension directory (another process, a sync daemon, a malicious
extension package being swapped on disk) can:

- replace a directory component with a symlink pointing outside the
  extension dir, so `open` follows it out; or
- swap a regular file for a hard link to an arbitrary same-filesystem file —
  which needs no race at all, since canonicalization follows symlinks but
  does not detect hard links: a checked-in `entry.js` hard-linked to
  `~/.ssh/config` resolves inside the directory and passes the check.

The comment on `metadata` already acknowledges binding the size check to the
opened inode ("metadata retrieved from the open file handle is bound to the
same inode"), but the *containment* check is still path-time, not open-time.

Impact is bounded: `directory` is already renderer-chosen (tracked in
`plans/other_tasks/pending-ipc_hardening-low-med.md`), and loaded extensions
are trusted same-realm code, so this only matters for the "extension package
with planted links" scenario and concurrent-writer races.

## Recommendation

If the `directory`-is-untrusted fix from the pending IPC-hardening task lands,
close this gap too by binding containment to the open: resolve with
dirfd-relative opens (`openat2` with `RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS`
on Linux, `openat`-walk elsewhere) or open each component with `O_NOFOLLOW`.
Until then, document that the symlink defense assumes a quiescent directory.

## Verification

`extensions.rs:83` canonicalizes; `:107` re-stats the path (`is_file`);
`:133` opens the path again — three independent path lookups, none bound to
the others. The symlink test (`rejects_a_symlink_pointing_outside_the_directory`,
line ~282) passes only because nothing mutates the tree during the call.
