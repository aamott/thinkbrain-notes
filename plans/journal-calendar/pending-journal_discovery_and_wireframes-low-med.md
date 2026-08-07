# Story: Journal Discovery, Moodboards & Wireframes

**Status:** complete (discovery approved 2026-08-07) · **Urgency:** low · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md). Discovery gate;
precedes irreversible data and UI work.

**STOP gate — SATISFIED 2026-08-07.** D1-D47 answer the discovery questions and all
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

## Decision log (D1-D47)

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

## Checkpoint table

| Artifact / version | Reviewer | Status | Follow-up |
|---|---|---|---|
| Question batches 1-10 (D1-D34) | product owner | approved | — |
| P1 popout header v1 | product owner | approved with change (D24) | Metadata widget starts collapsed |
| M1 interactive mockup v1 | product owner | approved as structural basis (D24) | Visual density cleanup deferred |
| P2 undated-file handling | product owner | accepted with constraint (D32) | Minimal space; treatment compared |
| Moodboard v1 (artifact 1) | product owner | approved (D35) | Direction B + A's popout; C rejected |
| Undated treatment comparison | product owner | approved (D36) | Pinned group header chosen |
| Desktop IA v1: IA-1 vs IA-2 (artifact 2) | product owner | resolved as IA-3 (D37) | Group-by control removed |
| State coverage, 12 states | product owner | reviewed with artifact 2 | Referenced by the panel story |
| Keyboard / screen-reader focus order | product owner | reviewed with artifact 2 | Calendar grid model still open |
| IA-3 header levels: 3a vs 3b | product owner | approved 3b (D39) | — |
| Mobile layouts M-1 vs M-2 (artifact 3) | product owner | approved hybrid (D40) | Bottom sheet is new component surface |
| Metadata facet source | product owner | platform index approved (D41) | Indexing story added; no journal cache |
| Filename read table | product owner | narrow ISO family approved (D42) | Date-only sorts first |
| Multi-entry day semantics | product owner | distinct values + entry-level filters (D43) | No synthetic daily value |
| Metadata widget route | product owner | React slot + observable registry (D44) | Platform prerequisite |
| Workspace field definitions | product owner | platform scope + id overlay (D45) | Preserve unconfigured values |
| Calendar entry density | product owner | 3 dots + `+N` in both views (D46) | Exact count remains accessible |
| Built-in namespaces | product owner | feature-scoped semantic ids (D47) | Runtime ids are host-prefixed |

**Approver:** the product owner, per D34.

## Rejected alternatives (consolidated)

| Rejected | In favor of | Why |
|---|---|---|
| Calendar widget in the popout | Grouped list (D15) | A real calendar belongs in the canvas tab |
| One panel with switchable views | Journal popout + calendar tab (D14) | The activity bar is for popouts |
| Calendar activity-bar button | Popout button only (D27) | The calendar is a tab, not a popout |
| Templates in the first slice | No templates (D21) | Not needed for the first usable slice |
| Pre-seeded empty metadata fields | Date-only frontmatter (D22) | Keeps files clean until values are set |
| Seconds in filenames | Counter suffix (D30) | Minute stays the finest unit |
| Guessing ambiguous dates | Undated (D38) | A wrong guess silently misfiles an entry |
| Hiding undated files | Pinned group (D36) | Invisible files in a user-owned folder |
| Toggle beside the filter for undated | Pinned group header (D36) | A small badge is too easy to ignore |
| Direction A "Quiet Instrument" | Direction B (D35) | Status strip reads as build status over prose |
| Direction C "Data Journal" | Direction B (D35) | Contradicts D4's user-defined vocabulary |
| IA-1 flat non-collapsing stream | IA-3 (D37) | Archive reachable only via another surface |
| IA-2 indented drill-down | IA-3 (D37) | Indentation + tree semantics; clashed with group-by |
| 3a month headers only | 3b year + month (D39) | 96 collapsed rows still fails the ten-year case |
| M-1 inline metadata throughout | M-1 + sheet (D40) | Multi-select is cramped inline on a phone |
| M-2 comfortable rows throughout | M-1 + sheet (D40) | Halves entries visible while browsing |
| Bespoke mobile navigation | App shell owns it (D26) | Popout placement is not a journal concern |

## Open questions carried forward

**Blocking discovery sign-off:** none — all three artifacts approved (D35, D37/D39,
D40).

**Owned by the journal panel story:** collapsed-header behavior under search/filter
and collapse-state persistence across sessions/workspaces; narrow-width/mobile
behavior of Direction B's measured column (D35); collapsed-state metadata summary
treatment nuance and widget behavior on malformed frontmatter (D33 keeps it valid);
day click with the popout closed and date filter as a dismissible chip (D25).

**Owned by other implementation stories:**
- Calendar tab singleton/persistence, calendar-on-phone, and the calendar grid keyboard
  model (D31) — calendar view story.
- Exact approved settings list/defaults beyond D7/D4/D23 — settings story.
- Backfill mechanics, counter interaction (D30), rename warnings/folder relocation,
  and error/retry copy — journal service story.
- Built-in activation events, required beta contribution table, unavailable behavior,
  and mobile placement — beta built-ins story. Canonical ids themselves are closed by D47.

## Reconciliation — 2026-08-07 (post-merge)

The `extensions` branch advanced during discovery with no decision here changed or
clobbered. D14/D27 uses the shipped tab seam. D44 and D45 choose platform changes for
the remaining editor-slot and workspace-settings gaps; their implementation stories are
prerequisites, not open product choices. See the epic's **Platform reality check**.

## Acceptance criteria

- [x] User answers recorded for workflow, date/time policy, folder/naming, templates,
  metadata fields, calendar defaults, settings, accessibility, and mobile behavior
  (see D1-D47 above).
- [x] Three labeled composition alternatives (IA-1/IA-2/IA-3) plus two mobile
  alternatives; none treated as chosen before approval; resolution (IA-3) was the
  product owner's.
- [x] Twelve states covered: no workspace, no journal folder, zero entries, new entry,
  existing entry with metadata, malformed frontmatter, calendar-filtered day, filter
  matching nothing, unreadable folder, index unavailable, undated group expanded,
  ambiguous date.
- [x] Desktop/phone layouts identify focus order (popout, 10 stops), accessible names,
  touch-target intent, responsive behavior; calendar grid keyboard model explicitly
  deferred rather than guessed.
- [x] Checkpoint table names artifact version, reviewer, status, follow-up.
- [x] Non-goals and unresolved decisions listed, split into discovery-blocking vs.
  owned-by-a-later-story.

## Tests / manual checks

- No automated code tests expected.
- Manual: walk the daily workflow with a real sample workspace; verify each screen
  can be described without assuming a final visual style or metadata vocabulary.
- Manual: review with keyboard-only and a screen-reader outline; every action needs a
  discoverable label.

## Non-goals

- No React/CSS/Tailwind implementation, production assets, frontmatter parser
  changes, settings schema, or extension registration.
- Do not select a mood scale, activity taxonomy, folder hierarchy, filename format,
  icon, color meaning, or calendar visualization without explicit approval.
- Do not ship a built-in mood or activity vocabulary; D4 makes these user-defined.
- Do not replace D43's distinct-value aggregation with latest-entry or synthetic field rules.
