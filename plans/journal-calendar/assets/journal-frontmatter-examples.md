# Journal Frontmatter Examples

Filenames approved by D42; frontmatter contract by D48-D51. Field names other than `date`
are opaque examples, never built-in vocabulary (D4).

Implemented in `packages/core/src/journal/`; every case below has a test there.

## Accepted read filenames

| Form | Example | Meaning |
|---|---|---|
| `YYYY-MM-DD.md` | `2026-08-07.md` | Valid date, unknown time; sorts before timed entries that day |
| `YYYY-MM-DD-HHmm.md` | `2026-08-07-1307.md` | Valid local date and 24-hour minute |
| `YYYY-MM-DD-HHmm-N.md` | `2026-08-07-1307-2.md` | Same-minute collision counter, integer `N >= 2` |

Fixed-width and zero-padded except `N`; valid Gregorian dates; times `0000`-`2359`. The
writer emits only D17's timed form, adding `-N` on collision.

## Rejected as undated

Day/month-first, mixed or alternate separators, ISO `T`, month names, invalid dates/times,
missing padding, extra suffixes, date-only counters, counter `< 2`. Examples:
`01-02-2026.md`, `2026_08_07.md`, `2026-08-07T1307.md`, `2026-02-30.md`, `2026-8-7.md`,
`2026-08-07-1307-1.md`, `2026-08-07-2.md`.

## Frontmatter cases

Definitions used below, per D49:
`mood` single-select `[good, flat]` · `energy` number · `context` multi-select
`[running, reading]`.

| Case | Frontmatter | Behavior |
|---|---|---|
| Minimal — a new entry | `date: 2026-08-07` | Date only; no field is pre-seeded (D22) |
| Full | `date`, `mood: good`, `energy: 7`, `context: [running, reading]` | Each type writes its fixed shape (D49) |
| Absent | *(none)* | Still an entry — a parseable filename date is the only requirement (D33) |
| Malformed | `mood: [good` | Still an entry; diagnostic surfaced, file never rewritten (D33, D50) |
| Duplicate keys | `energy: 3` then `energy: 7` | YAML rejects it outright; reads as no metadata, entry survives |
| Unknown key | `author: sam` | Kept verbatim, labeled unconfigured — indistinguishable from a removed definition (D45, D50) |
| Invalid value | `energy: loads` | Kept verbatim, flagged, excluded from facets; never coerced (D50) |
| Date mismatch | `date: 2026-08-01` in `2026-08-07-1307.md` | Filename wins, mismatch reported, no repair (D20) |
