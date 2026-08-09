# Story: Journal Discovery, Moodboards & Wireframes

**Status:** complete (discovery approved 2026-08-07) · **Urgency:** low · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md). Discovery gate;
precedes irreversible data and UI work.

**STOP gate — SATISFIED 2026-08-07, extended 2026-08-08.** D1-D79 answer the discovery questions and all
three artifacts (moodboard, wireframes, this log) are approved. Downstream stories may
proceed **within** these decisions; the gate stays closed for anything still open
below. Each downstream story owns its own STOP gate for its own undecided items; no
story may silently settle one. A superseding decision is a new D-number — earlier ones
are never edited.

## Goal

Produce a decision record and low-fidelity moodboard/wireframe set separating
confirmed requirements from open questions, exploring at least two journal/calendar
IAs without presenting either as final.

## Likely files

- `plans/journal-calendar/pending-journal_discovery_and_wireframes-low-med.md` (this file).
- `plans/journal-calendar/assets/journal-calendar-moodboard.md` (approved D35).
- `plans/journal-calendar/assets/journal-calendar-wireframes.md` (IA/mobile
  alternatives, state coverage, focus order; approved D37/D39/D40).
- `plans/technical-decisions.md` (not edited here; needs separate approval).

## Dependencies

`plans/app-vision.md`, `user-noted-todo.md`, mobile/UI-shell plans, beta built-in
integration story — read before discovery. No code dependency; discovery output
blocks data-model and UI stories.

## Decision log (D1-D79)

Recorded 2026-08-05 through 2026-08-07. Each is confirmed unless marked provisional.
Superseded decisions are noted inline.

**D1.** First 30s = ordinary daily journaling + lightweight day-level metadata. No
quick-capture mode, no guided reflection prompt; user opens today's entry, writes, and
may record metadata (activity level, mood) alongside the prose.

**D2.** A journal entry is an ordinary Markdown note, not a special file
type/storage path/DB record. Markdown-as-source-of-truth constraints in
`plans/app-vision.md` / `plans/technical-decisions.md` apply unchanged.

**D3.** Metadata lives at the top of the file, human-legible in a plain text viewer —
readable without parsing the whole file, understandable without the app. Prefer
self-describing keys/plain values over codes; constrains the frontmatter contract in
`pending-journal_data_model_frontmatter-med-hard.md`.

**D4.** Daily metadata fields are user-defined in settings, not a fixed vocabulary. No
shipped mood scale/activity taxonomy. Input types: multi-select, single-select,
number, text. Mood/activity are examples only — supersedes any assumption the app
defines the vocabulary.

**D5.** Calendar serves navigation, reflection, and metadata filtering roughly
equally — no single purpose dominates. Supports jump-to-date, pattern-over-time,
filtering by D4's metadata; cannot hard-code a mood color scale or activity
iconography since the vocabulary is user-defined.

**D6.** Superseded by D27 (was: separate activity-bar entries for journal/calendar).

**D7.** Storage: configurable journal folder of date-named Markdown files. Default
folder `journal`, changeable in settings. Nesting bounded flat to `year/month/day`
max. Default nesting/filename pattern: D17.

**D8.** Multiple entries/day allowed; metadata stored per file, no day-level record.
*Provisional* (aggregation question remains open though grouping mechanism was later
replaced by D37): where the calendar needs one value/day (e.g. mood swatch), last
entry wins — a placeholder, not settled; real policy deferred to
`pending-calendar_data_model-med-med.md`.

**D9.** Journal activity-bar button opens left popout with journal menu; entries open
in main editor. Popout: top menu/actions + body browsing entries, default **list
grouped by week**, each row showing date + first line. Opening/creating opens a
normal editor tab; popout is a navigator, not a writing surface. (Body shape: D15.)

**D10.** Original popout controls, group-by row superseded by D37. Kept: Open
calendar; Filter by metadata (auto-populated from present values); Search entries
(full text, D16). Removed: **Group by** (`none/day/week/month/year`, default week) —
withdrawn by D37. Ordering always chronological, never user-configurable.

**D11.** Day metadata edited via a form widget above the editor body, not hand-written
frontmatter; writes the D3 metadata block, staying plain-text legible. (Trigger
scope: D28. Default collapsed state: D24.)

**D12.** Mobile: left popout renders full screen. Both desktop/mobile in scope;
mobile not deferred.

**D13.** Scale target: thousands of entries. Every list/group-by/filter/search/
calendar interaction must stay usable at that volume — implies dependency on the
indexing epic's SQLite FTS5 cache (disposable, rebuildable, never source of truth per
`plans/technical-decisions.md`) and implies list virtualization is needed.

**D14.** Calendar surfaces: grouped list in popout; full calendar in a canvas tab.
(Superseded calendar half of D6; "own activity-bar entry?" residual closed by D27 —
no.) No calendar grid in popout. Full calendar opens from a popout button into a
canvas tab: week/month views, per-day metadata, **v1 shows only a dot per day with an
entry** (refined in D29). View options in a control strip atop the tab.

**D15.** Journal popout body is a "calendar list" — plain list grouped by
day/week/month/year, not a calendar widget. No date grid/month cells/mini-calendar in
popout; real calendar visuals belong only in the D14 tab.

**D16.** Search is full-text over entries, reusing existing search infra, scoped to
journal. **Filter/search interaction:** when filters are active, search runs within
the filtered set and the UI must **emphasize active filters** — a muted/missable
indicator is a defect.

**D17.** Default path/filename: `journal/YYYY/MM/YYYY-MM-DD-HHmm.md`. Year +
zero-padded month folders; filename = ISO date + 24h time to the minute (e.g.
`journal/2026/08/2026-08-05-1307.md`). `journal` root stays configurable (D7).
**Time component always present** — not a collision fallback; every new entry appends
current time. (Collisions: D30. Read leniency: D33/D38.)

**D18.** "New entry" always creates a new file — never reopens/appends, even for
today. Opening a past entry is via the popout list (D9), not create. ("Today"
behavior came from the withdrawn P1 proposal, not a D-number: opens today's most
recent entry if one exists, else creates one.)

**D19.** Dates use local device time; backfilling allowed. "Today" = device clock.
User may create/adjust entries for past dates. No workspace-pinned timezone, no
configurable day-start offset in v1.

**D20.** Both filename and frontmatter date are written; **filename wins on
conflict**. Frontmatter date is a convenience copy, not source of truth. Reading must
not rewrite a disagreeing frontmatter date (would violate the frontmatter mutation
policy in `plans/technical-decisions.md`) — surfacing the mismatch is fine, silent
repair is not. Unparseable filename: D33/D38 (undated).

**D21.** No templates in v1. Not rejected as a future idea, but nothing in v1 reads a
template file/setting. `pending-journal_service_daily_notes-high-med.md` should drop
template application from its first increment.

**D22.** A new entry's frontmatter contains the date only — no pre-seeded empty
values for configured fields; file stays clean until the user sets something via the
D11 widget. With D21, a new entry has no body content either.

**D23.** Metadata field definitions may be global or per-workspace. Both levels
exist. Precedence/merge rules (replace/extend/shadow on collision) NOT settled here —
owned by `pending-journal_settings_and_accessibility-med-med.md`. Open: behavior when
a workspace narrows a global select list already in use; extension settings currently
have no workspace-scoped path at all (see Reconciliation).

**D24.** M1/P1 approved as structural basis, one change: metadata widget starts
collapsed. Popout zone structure, grouped list, filter-emphasis treatment, calendar
tab composition accepted as basis for wireframes/downstream stories. Visual density
cleanup deferred, not a blocker. Collapsed header must still communicate whether
metadata is set (summary treatment: D35's "dateline").

**D25.** Clicking a day in the full calendar filters the popout list to that day —
not an open-file action, even for a single-entry day. Calendar becomes a
navigation/filtering surface driving the popout; both share filter state. Open:
behavior when popout is closed at click time; date filter as dismissible chip
(journal panel story).

**D26.** Mobile popout placement is the app's concern, not the journal extension's.
All popouts treated uniformly on mobile (some in bottom nav, rest in a left hamburger
menu). Journal registers an ordinary popout and inherits this — must NOT implement
bespoke mobile navigation, a private bottom bar, or its own return path.
`pending-journal_mobile_refinement-med-med.md` narrows to touch targets, collapsed
widget, list density, calendar-tab-on-phone; navigation composition deferred to
`plans/mobile/pending-responsive_layout-low-med.md`.

**D27.** No calendar activity-bar button; journal button is the only activity-bar
entry. (Fully supersedes D6; closes D14's residual question.) Activity bar is for
popouts; calendar is a canvas tab, reached only via the calendar action in the
journal popout. Consequence: `pending-calendar_panel_ui-high-hard.md` is misnamed —
calendar is a **tab view, not a panel**, must not register an activity-bar
contribution; needs re-examination against panel/tab-kind registries.

**D28.** Metadata form widget appears for any note in the journal folder, plus any
note anywhere already carrying the configured fields — two independent triggers. A
note outside the folder with the fields still gets the form (supports moved notes;
consistent with D2). Editor-hook registration must test frontmatter keys as well as
path; "configured fields" is scope-dependent per D23's two levels.

**D29.** Calendar shows one dot per entry, capped — 3 entries shows 3 dots, over cap
shows the cap. Cap value not chosen; overflow treatment (e.g. "+N") and week-view dot
treatment open, owned by the calendar view story.

**D30.** Same-minute collisions get a counter suffix: when `YYYY-MM-DD-HHmm.md`
exists, next entry becomes `-2`, then `-3`. Seconds never added; minute stays finest
filename time unit (D17). Filename parser must accept an optional `-N` suffix without
mistaking it for time; ordering within a minute follows the counter. Backfill
interaction (counter vs existing entries on a backfilled date) open, journal service
story.

**D31.** Accessibility must-haves for v1: keyboard operation and screen-reader
compatibility, required for the popout (actions, search, filter popover, list rows —
group-by dropped by D37) and calendar tab (grid navigation, view switching, day
activation per D25). Deferred: reduced-motion handling, minimum-touch-target audit.
**High contrast is out of scope for this feature** — handled by the theme system;
journal must use `--tn-*` tokens, not hard-coded colors. Calendar grid keyboard model
remains open (calendar view story).

**D32.** P2 (undated-file handling) accepted in principle, hard constraint: undated
files must occupy minimal space. Presentation left open here (settled by D36).
Settled from P2: undated Markdown is not in the chronological stream, ordered by
mtime among itself, reachable via a filter; non-Markdown files (images, PDFs,
attachments) are **hidden** from the popout entirely (file explorer's job).

**D33.** Only requirement to be a journal entry: a parseable filename date. **Read
leniently, write one format** — reader accepts many formats, writer only emits D17's
format. Frontmatter **not required**; malformed frontmatter does **not** disqualify
an entry. Only an unreadable (or ambiguous, D38) date routes to undated. Other
originally-listed states (empty, malformed frontmatter, read-only, unsaved) get **no
journal-specific treatment** — rely on existing editor behavior; no bespoke states.

**D34.** Approval cadence: per-artifact, as drafted — not one batched review. Product
owner is sole approver, may reject/revise any artifact at any time. Downstream
stories update only after their dependent artifacts are approved.

**D35.** Moodboard v1 approved: Direction B ("Page in a Workshop") with Direction A's
popout. Editor surface is a measured column; collapsed metadata widget is a
**dateline** (e.g. `Wednesday, August 5 · good · 7 · running, outdoors`), doubling as
D24's collapsed-state summary. Popout keeps file-explorer density/discipline.
Rejected alternatives: Direction A, Direction C (see table below). Constraints
carried forward: no new color tokens, no mood-color mapping, no emoji vocabulary, no
paper texture/notebook skeuomorphism, no handwriting typefaces, no
wellness/therapeutic framing. Open: measured column behavior at narrow widths/mobile
(full width there).

**D36.** Undated files use a pinned group header (closes D32's presentation
question): a single `Undated` row pinned to top, collapsed, with a count, absent
entirely when none exist. Rejected alternative: toggle beside the filter control (see
table below). Rest of P2 stands (D32).

**D37.** Desktop IA approved as IA-3: a flat stream with collapsible headers, no
indentation. **Group-by control removed** (supersedes D10's `Group by` row). Headers
not indented, rows not in a tree — reads as one stream. Headers collapse, delivering
ten-year navigability without tree semantics. No group-by control — D10's
`none/day/week/month/year` options and `week` default withdrawn; grouping is now a
fixed list property. Retained from D10: full-text search (D16) and metadata filtering
with auto-populated values — now the only two list controls. Rejected alternatives:
IA-1, IA-2 (see table below). Open (closed by D39): which header levels exist.

**D38.** Ambiguous filename dates are treated as undated. **The app never guesses.**
`01-02-2026` (day-first vs month-first both parse and disagree) is **not** an entry —
goes to Undated (D36). Guessing rejected outright, including guess-with-a-flag: a
wrong guess silently misfiles the entry, shown confidently in the wrong place.
Consequence: `pending-journal_data_model_frontmatter-med-hard.md` must enumerate an
accepted format list where every format is unambiguous, with ambiguity-detection
tests.

**D39.** IA-3 header levels: year plus month, both collapsible, neither indented.
Levels distinguished by weight, size, case, background — never padding. Rejected
alternative: month-headers-only (see table below).

**D40.** Mobile: M-1's compact list with M-2's bottom sheet for metadata editing. One
list implementation shared with desktop; bottom sheet confined to metadata editing —
the four D4 input types, multi-select especially, don't fit inline on a phone.
Rejected alternatives: M-1 throughout, M-2 throughout (see table below).
Acknowledged cost: bottom sheet is a new component surface used nowhere else in the
desktop app.

**D41.** D16's auto-populated metadata filter values come from the platform-owned,
disposable index. Extend the indexing/search record and query API to carry structured
frontmatter, return facet values and apply metadata predicates; do not build a
journal-owned cache or defer metadata facets from v1. The index remains rebuildable
derived state, never source of truth. If unavailable, browsing and date filtering still
work while facets show an explicit unavailable state rather than scanning every file.

**D42.** Accepted journal read filenames are the narrow readable ISO family:
`YYYY-MM-DD.md`, `YYYY-MM-DD-HHmm.md`, and `YYYY-MM-DD-HHmm-N.md` for collision
counters `N >= 2`. Values are fixed-width and zero-padded; dates and times must be
valid. Mixed separators, ISO `T`, month names, day/month-first forms, and date-only
counters are undated. The writer still emits D17 only. Date-only entries have unknown
time and sort before timed entries on the same day.

**D43.** A day preserves all distinct per-field metadata values across its entries; it
never picks a winner or calculates a synthetic daily value. Filters remain entry-level:
a day qualifies only when at least one entry satisfies every active predicate, and filtered
dots/counts represent matching entries. Full-text search uses that same matching set.

**D44.** The metadata widget mounts in a new first-class React contribution slot above
the Markdown editor body, not in CodeMirror-owned DOM. The slot has an observable,
disposable registry; already-open editors react when contributions register or unregister.

**D45.** V1 extends the platform with workspace-scoped extension settings and ships both
D23 levels. Workspace field definitions replace complete same-id global definitions;
untouched global fields remain. Definition changes never rewrite notes. Values no longer
configured remain visible and filterable with an `unconfigured` label and diagnostic.

**D46.** Month and week views share one density treatment: show up to three entry dots,
then `+N` for the remainder. Under active filters the dots and remainder count only D43
matches. Accessible text announces the exact matching count regardless of visual cap.

**D47.** Canonical built-in extension ids are `journal-calendar`, `git`, and
`agent-chat`. Relative contribution ids stay semantic lowercase kebab-case and rely on
host prefixing. Journal/calendar uses panel `journal`, tab `calendar`, commands
`new-entry`, `today`, `open-calendar`, and editor contribution `metadata-widget`, yielding
runtime ids such as `journal-calendar.calendar`.

### Approved 2026-08-08 (D48-D70)

Rationale and rejected alternatives: `docs/superpowers/specs/2026-08-08-journal-open-decisions-proposal.md`.

**D48.** Frontmatter date key is `date`, a plain `YYYY-MM-DD` string, no time (time lives in
the filename, which wins per D20). `date` is reserved, as are the note model's `title`,
`tags`, `aliases`, `status`, `created_at`, `updated_at`.

**D49.** A field definition is `{ id, label, type, options? }`. `id` is the literal
frontmatter key, `^[a-z][a-z0-9_-]*$`, not a D48 reserved key. `options` required for the
select types, forbidden otherwise. Value shapes: `text`/`single-select` → string, `number` →
number, `multi-select` → string list. Stored as one `string` setting with a custom
`journal-field-definitions` control.

**D50.** Read leniently, never repair. Unknown keys pass through. A value contradicting its
field's type is kept verbatim, flagged, and excluded from facets — never coerced. A
frontmatter/filename date mismatch is reported, not fixed. Writes happen only on an explicit
widget edit, touching only changed keys. Accepted cost: YAML comments/key order may reflow
until the note-model comment-preserving story lands.

**D51.** Stable v1 contract = D42 filenames + D48 `date`. User-defined keys are never
renamed, migrated, or collected. No schema-version marker in notes. A further reserved key
needs a new decision.

**D52.** Under an active search or filter, headers containing matches auto-expand and show a
match count; clearing restores prior state. Auto-expansion is never persisted.

**D53.** Collapse state persists per workspace in desktop state — not settings, not the vault.

**D54.** An entry with no field values renders its dateline as the bare date
(`Wednesday, August 5`), no placeholder; `Add metadata` lives in the widget. Refines state 4
of the approved wireframes.

**D55.** The measured row responds to the popout's own width: ≥320px date + time + first
line; <320px time joins the date line and the first line wraps; <260px the preview is
dropped. Owned here, consumed by the mobile story.

**D56.** Singleton calendar tab; `open-calendar` focuses an existing one. View mode and active
date persist per workspace.

**D57.** Both views at phone widths; option strip collapses to one segmented control; cells
render dots only, dropping `+N` below 40px cell width while the exact count stays in the
accessible name. A layout threshold, not the D31 touch-target audit.

**D58.** Calendar grid is one tab stop with roving focus: arrows by day, `Home`/`End` to week
bounds, `PageUp`/`PageDown` by month (`Shift` by year), `Enter`/`Space` activates (filters the
popout per D25). Focused day announces its date and exact matching count.

**D59.** Activating a day while the popout is closed opens the popout and applies the filter.

**D60.** The day filter is an independently dismissible chip in the popout chip row;
dismissing it clears only that filter and the calendar selection clears in step.

**D61.** Backfill supplies the **date**; the filename time is the **current clock time**.
Never midnight, never prompted.

**D62.** A missing year/month folder is created silently on backfill.

**D63.** Failure copy. Unreadable folder: **"Can't read the journal folder."** + path,
actions `Retry` / `Choose a different folder…`. No workspace: **"Open a folder to start
journaling."** + `Open folder…`. Invalid root setting: **"The journal folder setting isn't a
valid path."** + value, `Open settings`. Never lead with a raw error string.

**D64.** Exactly four settings: `root` (path, app + workspace, default `journal`),
`fieldDefinitions` (custom control, app + workspace, default empty), `calendarDefaultView`
(enum `week`/`month`, app, default `month`), `startOfWeek` (enum `system`/`monday`/`sunday`,
app, default `system`). Not settings in v1: templates (D21), nesting/filename format (D17),
timezone or day-start (D19), mood colors (D4, D31).

**D65.** Lazy activation on `onView:journal` and `onCommand:new-entry` / `today` /
`open-calendar`. Never `onStartup`.

**D66.** Beta contributions, all real: panel `journal`, tab `calendar`, the three commands,
editor-header `metadata-widget`, settings module. The popout action row uses the existing
`PanelAction` contract.

**D67.** One ordinary left panel, inheriting the shell's mobile placement and return path
(D26). The D40 bottom sheet belongs to the widget, not the registration.

**D68.** The journal service uses `DesktopExtensionContext.workspace`, extended rather than
bypassed. Requires adding `listNotes(prefix)` (relative paths + mtimes) — the API cannot list
notes today, and D32 needs mtime ordering.

**D69.** `DesktopExtensionContext.tabs` gains a scoped `open(kind, title)` limited to kinds the
extension registered. Internal `openTab` stays internal.

**D70.** `DesktopTabContext` stays `{ rootPath, tabId }` for v1.

**D71.** Popout header: an action row of `New entry` (primary — the only filled control in
the panel) with `Today` and `Open calendar` beside it as outlined buttons. Overflow stays in
the panel chrome, which holds nothing else. Order settled by D75.

**D72.** The first-line preview is never dropped. D55's `<260px` tier is withdrawn: below
320px the row is two lines and the preview truncates, at every width down to the shell's
224px minimum. No setting is added; D64's four stand.

**D73.** The filter control is right-aligned in its row, with `showing N of M` filling the
space to its left.

**D74.** The dateline is long form with the year (`Friday, August 7, 2026`) — the
frontmatter date is the backup record if a file is renamed, so it has to be readable. A
filename/frontmatter mismatch is surfaced in the dateline naming both dates and which one
is used; non-blocking, never rewritten (D20/D33).

**D75.** Header order: actions, then search, then the filter row. Search belongs with the
filter and the results — the query and what it returned are one group, and the actions
between them separated a statement from its own answer. Amends D31's focus order to:
overflow, New entry, Today, Open calendar, search, filter, chips, list. Accessible names
are unchanged.

**D76.** At phone widths the row height is decided by touch, not by D55's width tier: the
two-line row at a 44px minimum, ~7 rows on screen. A full-screen popout is 390px wide, which
D55 would put in the one-line tier at ~26px — half the touch minimum, on a control that opens
a file. Desktop keeps the width tiers unchanged.

**D77.** Filter chip rows wrap; never a horizontal scroller. D16 requires active filters to be
unmissable, and a sideways scroller hides them by design.

**D78.** Metadata sheet contract (M-2): it sits above the soft keyboard so the field being
edited stays visible; focus is trapped while open and returns to the control that opened it;
it announces as a dialog named for the entry's date; swipe, scrim tap and the shell's back all
dismiss to the note; values save as they change, so `Done` closes rather than commits.

**D79.** Narrows D56: the calendar tab persists its **view mode** per workspace but always
opens on today's month. The view mode is a preference; the date last browsed to is an accident
of browsing, and landing in March when it is August is a daily annoyance. `Today` stays one
click away.

## Checkpoint table

Every artifact and decision batch was approved by the product owner per D34, across
2026-08-05 to 2026-08-08. The row-by-row approval history was removed once the gate closed;
each decision above records what was chosen, and the consolidated table below records what
was rejected.

## Rejected alternatives (consolidated)

| Rejected | In favor of |
|---|---|
| Calendar widget in the popout | Grouped list (D15) |
| One panel with switchable views | Journal popout + calendar tab (D14) |
| Calendar activity-bar button | Popout button only (D27) |
| Templates in the first slice | No templates (D21) |
| Pre-seeded empty metadata fields | Date-only frontmatter (D22) |
| Seconds in filenames | Counter suffix (D30) |
| Guessing ambiguous dates | Undated (D38) |
| Hiding undated files | Pinned group (D36) |
| Toggle beside the filter for undated | Pinned group header (D36) |
| Direction A "Quiet Instrument" | Direction B (D35) |
| Direction C "Data Journal" | Direction B (D35); D4 |
| IA-1 flat non-collapsing stream | IA-3 (D37) |
| IA-2 indented drill-down | IA-3 (D37) |
| 3a month headers only | 3b year + month (D39) |
| M-1 inline metadata throughout | M-1 + sheet (D40) |
| M-2 comfortable rows throughout | M-1 + sheet (D40) |
| Bespoke mobile navigation | App shell owns it (D26) |

## Open questions carried forward

**None.** Every product question this log tracked is answered by D1-D79; the batch closed
on 2026-08-08 is recorded above. Rename warnings and folder relocation were dropped rather
than decided — moving or renaming an entry is ordinary file management under D2, and the
journal adds no behavior to it.

What remains is implementation and approval process, not undecided product questions:

- Per-artifact mockup sign-off under D34 for the panel and calendar tab stories.
- Platform prerequisites: D44 editor-header slot, D45 workspace-scoped settings, D41
  metadata facets, and the D68/D69 extension API additions.

## Story close-out

Discovery is complete: decisions recorded (D1-D79), three artifacts approved (moodboard
D35, wireframes/IA D37/D39, mobile D40), twelve states and the popout focus order covered
in `assets/journal-calendar-wireframes.md`. No code was written by this story.

Standing constraints for every downstream story: never ship a built-in mood or activity
vocabulary (D4), never guess an ambiguous date (D38), and never replace D43's
distinct-value aggregation with a synthetic daily value.
