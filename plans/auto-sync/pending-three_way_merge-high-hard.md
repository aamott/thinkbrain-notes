# Three-Way Text Merge

## Goal

Apply a chosen base to produce one merged document — clean regions merged
automatically, overlapping edits surfaced as structured per-chunk choices in
the existing merge UI. No conflict markers ever reach the frontend.

## Design

- `gix::merge::blob::builtin_driver::text::merge` performs a real three-way
  merge on `(ours, base, theirs)` byte slices. Add `gix-imara-diff` as a
  direct dependency (already vendored transitively) for `InternedInput`.
- Run with `Conflict::Keep` and a diff3 conflict style, then parse the output
  into structured chunks: clean regions plus conflict regions carrying all
  three texts. The UI receives chunks, never `<<<<<<<`.
- Clean regions are merged; conflict regions become per-chunk choices the
  existing `mergeModel` already renders. Auto-resolve only when base
  confidence allows (zero risky hunks, counted on the same merge output).
- Binaries and non-UTF-8 keep whole-file choices (`merge::Kind` unchanged).

## Acceptance Criteria

- A non-overlapping pair against a true base merges with no chunks to review.
- Overlapping regions arrive at the frontend as structured chunks with all
  three texts; the saved result is the assembled preview.
- Markers never appear — a test asserts no `<<<<<<<`/`>>>>>>>` in any
  payload or written file.
- A conflict opened after `ours` changed since triage (unsaved buffer or a
  newer snapshot) re-derives sides rather than reusing stale ones.

## Files

- `apps/desktop/src-tauri/src/commands/sync/{resolve,merge}.rs`
- `apps/desktop/src-tauri/Cargo.toml` (`gix-imara-diff`)
- `apps/desktop/src/sync/mergeModel.ts` and the conflict-view components

Depends on: `cloud_merge_base`
