# Story: History timeline does not follow renames

**Status:** ⬜ pending · **Urgency:** low · **Difficulty:** med

> From `docs/reviews/2026-10-02/timeline-does-not-follow-renames` (finding
> deleted; this is the tracked decision).

## Context

`history_walk::note_events` queries only the exact `note` path — no rename
detection anywhere. A rename appears as `Added` and all pre-rename versions
become unreachable from the renamed note. The spec
(`file-history-design.md`) is silent on renames.

## Decision needed

Implement rename-following (real feature work with correctness subtleties —
same-blob vs content-similarity, rename+edit in one commit) or document the
truncation as the contract. A product call, not an autonomous fix.

## Acceptance

- [ ] Rename behavior decided and either implemented or documented in the
      file-history design
