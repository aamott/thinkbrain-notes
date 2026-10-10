# Task: `listNotes` prefix filter through the stack

**Status:** ✅ done · **Urgency:** low · **Difficulty:** med

> From `docs/reviews/2026-08-13/extensions/extensionWorkspace-listnotes-loads-all`
> (finding deleted; this is the tracked work).

## Context

`extensionWorkspace.listNotes` calls `listWorkspaceEntries(root, false)` and
filters client-side: every extension note-list request walks the whole vault.
Correct results today, real perf wart for large vaults — but no measured pain
yet, which is why this stayed deferred.

The fix is mechanical but cross-layer: a prefix param on
`workspace_entries.rs` → `commands.ts` arg → adapter → JS filter, plus tests.

## Acceptance

- [ ] `listNotes` passes its prefix to the native layer instead of filtering
      the full listing in JS
- [ ] Tests cover a prefixed listing
