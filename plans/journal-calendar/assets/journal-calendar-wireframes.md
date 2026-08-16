# Journal & Calendar — Wireframes & IA Alternatives

**Status:** APPROVED 2026-08-07 (D37, D39, D40) · **Artifact 2+3 of 3** · Cadence per D34

> Discovery artifact for [Journal Discovery, Moodboards & Wireframes](../pending-journal_discovery_and_wireframes-low-med.md).
> Visual direction is governed by the approved moodboard (D35). Decision reasoning lives
> in the discovery log; this file records the alternatives, what was chosen, and what the
> drawings deliberately left open.

## Desktop information architecture

Three compositions were explored. All three satisfied every decision recorded at the
time; they differed only in how the popout stays navigable at thousands of entries (D13).

### IA-1 — flat chronological stream (rejected)
One virtualized list, group headers as punctuation, group-by control changes the
punctuation but never the shape. Reaching an old entry requires the calendar, search, or
a date filter. **Rejected:** the list itself cannot reach the archive.

### IA-2 — year/month drill-down, indented (rejected)
Popout mirrors the `YYYY/MM` nesting from D17; years collapse to months, months to
entries. **Rejected:** indentation plus tree keyboard semantics, and it contradicted
D10's group-by control — "group by week" has no coherent meaning inside a year→month
tree.

### IA-3 — flat stream with collapsible headers (APPROVED, D37 + D39)
The resolution: keep IA-1's flat, non-indented look and IA-2's collapse-to-reach-the-archive
behavior, and **remove the group-by control** rather than let it contradict the structure.

- Visually flat. Headers are **not** indented; rows do not sit inside a tree.
- **Two header levels: year and month** (D39), both collapsible. Levels are distinguished
  by weight, size, case and background — **never by padding**.
- **No group-by control.** Grouping is a fixed property of the list. `none / day / week /
  month / year` and the `week` default are withdrawn from D10.
- Remaining list controls: **full-text search** (D16) and **metadata filter** with
  auto-populated values.
- Pinned, collapsed **Undated** group at the top with a count, absent when empty,
  mtime-ordered, non-Markdown hidden (D36).
- Virtualization required (D13).
- 3a (month headers only) was rejected: ~96 collapsed month rows still fails the
  ten-year case that motivated collapsing at all.

## Popout header (P1, minus group-by per D37)

| Zone | Contents |
|---|---|
| Actions | `New entry` (primary, always creates — D18) · `Today` · `Open calendar` · overflow |
| Search | full-width full-text search field (D16) |
| Filter | metadata filter with a count badge when active |
| Chips | active-filter chips, each dismissible, plus `Clear all` |

`Today` opens today's most recent entry if one exists and creates one otherwise —
restoring the D1 workflow that D18 removed. Rejected alternatives: Today merely scrolls
the list; no Today action at all.

**Active filters must be unmistakable** (D16): count badge, chip row, *and* an explicit
"Showing N of M entries" line. A muted indicator is a defect, not a style choice.

## Editor surface

Direction B (D35): measured column, and the collapsed metadata widget rendered as a
**dateline** — `Wednesday, August 5 · good · 7 · running, outdoors`. The widget starts
collapsed (D24), and the dateline doubles as the collapsed-state summary. It appears for
any note in the journal folder or any note carrying the configured fields (D28).

## Calendar (canvas tab, D14 + D27)

Opens from the popout's calendar button into a canvas tab. **No activity-bar button.**
Week and month views, options in a strip at the top, **dot only** in the first release,
one dot **per entry**, capped (D29). Clicking a day **filters the popout list** to that
day rather than opening an entry (D25); the two surfaces share filter state.

## State coverage (12 states)

| # | State | Treatment |
|---|---|---|
| 1 | No workspace open | Empty state, `Open folder…` |
| 2 | Workspace, no journal folder | Empty state, `Start journaling` creates `journal/` |
| 3 | Folder exists, zero entries | Empty state, `+ New entry` |
| 4 | New entry just created | Dateline with "no metadata set"; date-only frontmatter (D22), no template (D21) |
| 5 | Existing entry with metadata | Dateline showing values, `edit` to expand |
| 6 | Malformed frontmatter | **Still a valid entry** (D33). Non-blocking notice; never rewritten on open |
| 7 | Calendar filtered to a day | Date chip + "Showing 2 of 1,431 — filtered from the calendar" |
| 8 | Filter matches nothing | Empty state naming the active filter count, `Clear all filters` |
| 9 | Journal folder unreadable | Error banner, `Retry` / `Choose a different folder…` |
| 10 | Search index unavailable | Warning banner; **browsing still works** (D16 dependency) |
| 11 | Undated group expanded | mtime-ordered, labeled as a category not an error (D36) |
| 12 | Ambiguous date filename | Routed to Undated, never guessed (D38) |

## Keyboard & screen-reader outline (D31)

Proposed popout focus order, inherited by the panel story rather than reinvented:

1. `New entry` — "New journal entry, button"
2. `Today` — "Today, button"
3. `Open calendar` — "Open journal calendar, button"; announce that it opens a new tab
4. Overflow — "More journal actions, menu button"
5. Search — "Search entries, search field"; result count announced politely on change,
   not per keystroke
6. Filter — "Filter entries, button, 3 filters active" — the active count belongs in the
   **accessible name**, not only the badge
7. Filter chips — each "Remove filter: mood good, button"
8. Undated group — "Undated files, 3, collapsed, button" — a **category**, never an error
9. Entry list — one tab stop; arrow keys move between rows. Each row "Wednesday August 5,
   1:07 PM, Long run before the heat came in". Group headers announced when crossed.

Year/month headers are collapsible controls and must expose expanded/collapsed state.

**Deliberately unspecified:** the calendar grid's keyboard model — roving focus, month
paging, activation semantics under D25. Owned by the calendar tab story; sketching it
here would be guessing.

## Mobile

Under D26 the app shell owns popout placement and the return path, so these alternatives
covered only journal-owned concerns.

- **M-1 compact** — ~9 rows visible, metadata edited inline via the dateline, no new
  components. Risk: rows near the lower bound for comfortable tapping; previews truncate.
- **M-2 comfortable** — ~5 rows, metadata raised as a bottom sheet with full-size targets.
  Risk: new component surface.
- **APPROVED (D40): M-1's list with M-2's bottom sheet.** Density favors M-1 for
  browsing, but D4's four input types — multi-select especially — do not fit inline on a
  phone. One list implementation shared with desktop; the sheet is confined to metadata
  editing. Acknowledged cost: the bottom sheet exists nowhere else in the app.

## Non-goals

- No production components, no CSS, no frontmatter parser changes, no settings schema,
  no extension registration.
- No new color tokens, no mood-color mapping, no emoji vocabulary, no imagery (D35).
- No calendar visualization richer than dots in the first release (D29).
- No bespoke mobile navigation (D26).

## Open items owned by later stories

Collapsed-header behavior when search matches hidden entries (must auto-expand or show a
count — silently hiding matches is a defect); collapse-state persistence and scope; dot
cap and overflow; dots in week view; calendar tab singleton and option persistence;
calendar on a phone; calendar grid keyboard model; day click with the popout closed; date
filter as a chip; measured-column behavior at narrow widths.
