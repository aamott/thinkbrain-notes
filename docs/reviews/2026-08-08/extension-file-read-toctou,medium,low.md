- name: TOCTOU between canonicalize and read in read_extension_file
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/extensions.rs
- lines: 98-161
- description: |
    `resolve_extension_file` canonicalizes both the directory and the candidate
    file, then verifies `canonical_file.starts_with(&canonical_root)` to reject
    symlinks that escape the extension directory (lines 98-114). The module
    docstring (lines 7-11) explicitly claims this protects against symlinks
    pointing outside the directory.

    However, `read_extension_file` then performs a separate `fs::metadata`
    (line 139) and `fs::read_to_string` (line 154) on `canonical_file` — the
    already-resolved path — *after* the containment check. Between the
    `canonicalize` call in `resolve_extension_file` and the `fs::read_to_string`
    call, the file at that path can be replaced (e.g. a directory entry swapped
    for a symlink, or the file replaced via rename). This is a classic
    time-of-check/time-of-use race: the containment proof is computed against
    the path's resolution at canonicalization time, but the bytes are read
    later against whatever the path resolves to then.

    The threat model states a loaded extension is trusted local code with full
    privileges, so the impact is bounded — the extension already runs with app
    privileges once loaded. The realistic concern is a *manifest/entry* read
    being swapped so the validated manifest does not correspond to the code
    that actually executes, which the current design does not prevent. This is
    low severity given the trust model but worth noting because the docstring
    overstates the symlink guarantee.

    A tighter design would open the canonicalized file once (`File::open`)
    and read from the open handle, optionally re-checking the handle's
    canonical path, so the read is bound to the same inode that passed the
    containment check.
- verification: |
    Read extensions.rs lines 98-161: `resolve_extension_file` returns
    `canonical_file` (a `PathBuf`), and `read_extension_file` separately calls
    `fs::metadata(&path)` and `fs::read_to_string(&path)` on that path. No
    file handle is held across the containment check and the read, so the path
    can be rebound between them. The docstring at lines 7-11 claims symlink
    containment, which the TOCTOU window weakens.
