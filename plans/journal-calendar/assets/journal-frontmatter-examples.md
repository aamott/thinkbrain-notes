# Journal Frontmatter Examples

Filename table approved by D42. Frontmatter keys/examples remain pending the data-model
field contract and must not be inferred from this file.

## Accepted read filenames

| Form | Example | Meaning |
|---|---|---|
| `YYYY-MM-DD.md` | `2026-08-07.md` | Valid date, unknown time; sorts before timed entries that day |
| `YYYY-MM-DD-HHmm.md` | `2026-08-07-1307.md` | Valid local date and 24-hour minute |
| `YYYY-MM-DD-HHmm-N.md` | `2026-08-07-1307-2.md` | Same-minute collision counter, integer `N >= 2` |

All components are fixed-width and zero-padded except `N`. Dates must be valid Gregorian
dates and times must be `0000` through `2359`. The writer emits only D17's timed form,
adding `-N` on collision.

## Rejected as undated

- Day-first or month-first names, even when one individual value appears unambiguous.
- Mixed or alternate separators, ISO `T` forms, and month names.
- Invalid dates/times, missing zero padding, extra suffixes, and date-only counters.
- Examples: `01-02-2026.md`, `2026_08_07.md`, `2026-08-07T1307.md`,
  `2026-02-30.md`, `2026-8-7.md`, `2026-08-07-1.md`.

## Pending frontmatter fixtures

After the remaining data-model field contract is approved, add minimal, full, absent,
malformed, unknown-field, duplicate, and filename/frontmatter-mismatch examples without
changing the D42 filename table.
