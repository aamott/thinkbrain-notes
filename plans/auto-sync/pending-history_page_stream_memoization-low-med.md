# Story: Memoize the paged history event stream

**Status:** ⬜ pending · **Urgency:** low · **Difficulty:** med

> From `docs/reviews/2026-10-02/every-page-recomputes-full-event-stream`
> (finding deleted; this is the tracked work).

## Context

`history_page::page` calls `events()` → `history_walk::gather` — a full
reachable-graph decode plus per-node tree lookups — then `.skip(offset).take(limit)`.
Pagination saves no work: every page re-walks the whole history. It also makes
`the_history_passes_five_thousand_commits` run ~11 full re-gathers of 5,100
commits in one test.

Ordering requires the full sorted stream, so lazy walking alone cannot fix
this. The real fix is memoizing the ordered `Vec<Recorded>` keyed on the
captured/pinned roots — which needs a decision on where the cache lives
(engine? per-call?) and what invalidates it (any new commit changes `main`,
so the key already carries freshness).

## Acceptance

- [ ] Paging a note's history does not re-walk the graph for pages two and on
- [ ] A cursor replay uses the roots the cursor captured, not live roots
- [ ] Decide/record where the memoized stream lives and how it invalidates
