# Calendar Data Examples

Aggregation and entry-density behavior approved by D43/D46. Field names and values below
are opaque examples, not built-in vocabulary.

## Multi-entry day

Entries:

- `2026-08-07-0900.md`: `context: [running, outdoors]`, `energy: 7`
- `2026-08-07-1800.md`: `context: [reading]`, `energy: 4`

Day summary preserves distinct values: `context = [running, outdoors, reading]`,
`energy = [7, 4]`. It does not choose the later entry or average numbers.

## Entry-level filters

With filters `context = running` AND `energy = 4`, the day does not qualify: no single
entry satisfies both. With `context = running` AND `energy = 7`, one entry qualifies and
the calendar density counts that matching entry only. Full-text search applies within the
same matching-entry set.

## Entry density

- 0 entries: no dots.
- 1–3 matching entries: one dot per entry.
- 4 matching entries: three dots plus `+1`.
- 8 matching entries: three dots plus `+5`.

Month and week views use the same treatment. Accessible text always reports the exact
matching count, for example `8 journal entries`.

## Remaining fixture work

Add fixed malformed-frontmatter, leap-year, timezone-boundary, undated, empty, loading,
and error fixtures during implementation without changing D43/D46 behavior.
