# Story: Journal Discovery, Moodboards & Wireframes

**Status:** pending · **Urgency:** low · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md). This is the discovery gate; it must precede irreversible data and UI work.

## Questions first

- What job should the first 30 seconds of journaling accomplish?
- Is the calendar primarily navigation, reflection, metadata filtering, or all three?
- Which journal entry states need distinct affordances (missing, empty, malformed, read-only, unsaved)?
- Which moods, activities, date ranges, and template controls are necessary for the first usable slice?
- Should desktop show two activity-bar entries, and what is the smallest useful mobile navigation model?
- What does the user need to approve at each mockup checkpoint, and who may reject or revise it?

**STOP gate:** Ask the product owner these questions, capture answers, and stop. Do not create a production component, final schema, final folder/name syntax, or implementation PR until the answers and a first desktop/mobile wireframe are explicitly approved.

## Goal

Produce a decision record and low-fidelity moodboard/wireframe set that separates confirmed requirements from open questions. Explore at least two journal/calendar information architectures without presenting either as final.

## Likely files

- `plans/journal-calendar/pending-journal_discovery_and_wireframes-low-med.md` (this decision log, updated with answers and approvals).
- `plans/journal-calendar/assets/journal-calendar-moodboard.md` (new; text references and visual direction, if the repository keeps discovery artifacts as Markdown).
- `plans/journal-calendar/assets/journal-calendar-wireframes.md` (new; desktop and mobile wireframes/alternatives, or links to approved artifacts).
- `plans/technical-decisions.md` (do not edit in this story; propose cross-cutting decisions there only if separately approved).

## Dependencies

- `plans/app-vision.md`, `user-noted-todo.md`, mobile/UI-shell plans, and the beta built-in integration story read before discovery.
- No code dependency. Discovery output blocks data-model and UI stories.

## Decision log

Answers recorded from the product owner. Each entry is a confirmed decision unless
marked provisional. Nothing here authorizes a mockup, schema, or implementation;
the STOP gate stays closed until the remaining batches are answered and a first
wireframe is explicitly approved.

### Batch 1 — recorded 2026-08-05

**D1. The first 30 seconds is ordinary daily journaling, plus lightweight
day-level metadata capture.**
There is no special "quick capture" mode and no guided reflection prompt in the
first slice. The user opens today's entry and writes. Alongside the prose, the
entry may record day-level metadata such as activity/workout level and mood.

**D2. A journal entry is an ordinary Markdown note, not a special file type.**
The journal feature is a way to organize and read a specific folder of notes —
not a new format, not a new storage path, not a database-backed record. Every
constraint in `plans/app-vision.md` and `plans/technical-decisions.md` about
Markdown-as-source-of-truth applies unchanged.

**D3. Metadata lives at the top of the file and must be human-legible in a plain
text viewer.**
Metadata is stored at the head of the note so it can be read without parsing the
whole file — this matters for both journal fields and general note metadata such
as tags. A person opening the raw file in any text editor should be able to
understand what the values mean (for example, that a field records that day's
activity level) without consulting the app. This constrains the eventual
frontmatter contract in
`pending-journal_data_model_frontmatter-med-hard.md`: prefer self-describing keys
and plainly readable values over codes or app-internal identifiers.

**D4. Daily metadata fields are user-defined in the extension's settings, not a
fixed vocabulary.**
The app does not ship a fixed mood scale or activity taxonomy. The user
configures which daily fields exist. Supported input types for the first slice:

| Input type | Notes |
|---|---|
| multi-select | multiple values from a user-defined list |
| single-select | one value from a user-defined list |
| number | numeric value (for example a workout or activity level) |
| text | free-form string |

Mood and workout/activity level are examples of user-configured fields, not
built-in special cases. This supersedes any downstream assumption that the app
defines the mood or activity vocabulary.

**D5. The calendar serves navigation, reflection, and metadata filtering in
roughly equal measure.**
No single purpose dominates the first release. The calendar must support jumping
to a date, seeing patterns over a span of time, and filtering days by the
user-defined metadata from D4. Because the metadata vocabulary is user-defined,
the calendar cannot hard-code a mood colour scale or activity iconography.

**D6. Journal and calendar are separate activity-bar entries on desktop.**
Two distinct activity-bar buttons rather than one panel with switchable views or
a calendar nested inside the journal panel. Registration still goes through the
existing panel registry and `desktopExtensionHost`, per the epic's boundaries.
Mobile navigation is not settled by this decision and remains open.

**D7. Storage layout: a configurable journal folder holding date-named Markdown
files.**
The journal extension creates a journal folder — named `journal` by default,
changeable in the extension's settings — and writes Markdown files named by date
into it. Nesting is bounded: at the flattest, all files sit directly in the
journal folder; at the deepest, `year/month/day`. Layouts deeper than
year/month/day are out of scope. The default nesting and filename pattern are
settled in D17.

### Batch 2 — recorded 2026-08-05

**D8. Multiple entries per day are allowed; metadata is stored per file.**
The user may write several entries in one day, so each file carries its own
metadata block. There is no day-level metadata record separate from the files.

*Provisional:* where the calendar needs a single value for a day (for example a
mood swatch), the last entry of that day wins. This is a placeholder to unblock
discovery, not a settled rule — the real per-day aggregation policy is deferred
to `pending-calendar_data_model-med-med.md` and must be revisited there.

**D9. The journal activity-bar button opens the left popout containing a journal
menu; entries open in the main editor.**
Clicking the journal entry in the activity bar opens the left popout. The popout
has two regions:

- **Top:** menu items / actions.
- **Body:** a browser of entries. Default presentation is a **list grouped by
  week**, each row showing the date with the entry's **first line** rendered
  underneath it.

Creating a new entry or opening a past one opens that file in the **main editor
area** as a normal editor tab with a pre-named file. The popout is a navigator,
not a writing surface.

*Resolved in Batch 3 (D15):* the popout body is a grouped list, not a calendar.

**D10. Required controls in the journal popout.**

| Control | Behavior |
|---|---|
| Open calendar | Opens a calendar view in a tab |
| Filter by metadata | Filter entries by the user-defined fields from D4; filter options are **automatically populated** from values actually present in entries |
| Search entries | Full-text search across entries; see D16 |
| Group by | `none`, `day`, `week`, `month`, `year` — default `week` per D9 |

Ordering is always chronological and is not user-configurable; no sort control is
offered.

**D11. Day metadata is edited through a form widget above the editor body.**
The user fills a form rendered above the Markdown body rather than hand-writing
frontmatter. The form writes the metadata block described in D3, which must
remain legible as plain text. Behavior for notes with absent or malformed
metadata, and whether the widget appears outside the journal folder, is open.

**D12. Mobile: the left popout renders full screen.**
On phone widths the journal popout takes the whole screen rather than sitting
beside the editor. Both desktop and mobile layouts are in scope for the wireframe
set; mobile is not deferred to a later story.

**D13. Scale target: thousands of entries.**
Every list, group-by, filter, search, and calendar interaction must stay usable
at that volume. This has architectural consequences flagged below.

### Analyst notes — gaps and risks raised by Batch 2

Recorded so downstream authors do not rediscover them. None of these are
decisions.

1. **Surface contradiction.** D6 puts journal and calendar on separate
   activity-bar entries; D10 also opens a calendar in a tab. Whether the calendar
   exists as an activity-bar panel, a tab, or both is unresolved (Batch 3).
2. **Index dependency.** Auto-populated filter values, search, and group-by over
   thousands of entries cannot be served by reading files on demand. This implies
   a dependency on the indexing/search epic's SQLite FTS5 cache, which per
   `plans/technical-decisions.md` is a disposable, rebuildable cache and never
   the source of truth. The journal epic currently declares no such dependency —
   the epic's dependency list needs updating once confirmed.
3. **List virtualization.** Group-by `none` over thousands of entries produces an
   unbounded list; the popout body needs windowing/virtualization. Worth stating
   explicitly in the panel story so it is not discovered during implementation.
4. **First-line previews at scale.** Rendering each row's first line requires
   reading into every file. This is the same index concern as (2).
5. **Same-day file naming.** With multiple entries per day (D8), the naming rule
   for the second and later entries of a day is undefined, as is whether "new
   entry for today" creates another file or reopens the existing one.
6. **Field-definition drift.** If the user renames a field or removes a
   select option in settings, existing files keep the old keys and values. The
   read/display behavior for orphaned metadata is undefined.
7. **Widget scope.** Whether the D11 form appears for every note in the journal
   folder, only for app-created entries, or for any note carrying the fields.
8. **Malformed metadata.** What the form widget shows when frontmatter is invalid
   YAML, and whether it may rewrite the file to repair it — noting the frontmatter
   mutation policy in `plans/technical-decisions.md` forbids rewrites on open.
9. **Explorer overlap.** Journal files are ordinary Markdown, so they also appear
   in the normal file explorer. Whether that is acceptable or the journal folder
   should be visually distinguished is undecided.
10. **Deletion and rename.** Whether the popout offers delete/rename of entries,
    or defers to the file explorer.

### Batch 3 — recorded 2026-08-05

**D14. Calendar surfaces: a grouped list in the popout, a full calendar in a
canvas tab.** *(supersedes the calendar half of D6)*
There is no calendar grid in the left popout. A **full calendar opens from a
button in the journal popout** into a tab on the canvas. The full calendar:

- offers **week** and **month** views;
- can surface per-day metadata such as activity and mood;
- **in the first release shows only a dot on days that have an entry** — richer
  metadata encodings come later;
- exposes its view/display options in a control strip at the **top of the
  calendar tab**.

*Residual question:* D6 gave the calendar its own activity-bar entry. With the
calendar now reached via a button in the journal popout, it is unclear whether a
separate calendar activity-bar button still exists. Confirm before any activity-bar
work; do not assume it was removed.

**D15. The journal popout body is a "calendar list", not a calendar widget.**
Literally a list of entries grouped by day, week, month, or year — the grouping
control from D10. No date grid, no month cells, no mini-calendar in the popout.
Anything resembling a real calendar visualization belongs to the full calendar
tab (D14) and must not be pulled into the popout.

**D16. Search is full text over entries and may reuse the existing search
infrastructure, scoped to journal entries.**
This confirms the dependency flagged in Batch 2 analyst note 2: journal search
builds on the app's existing search rather than a journal-private mechanism.

**Filter/search interaction:** when filters are already active (for example a
date range), search runs **within** the filtered set and the UI must
**emphasize the active filters** so the user does not mistake a filtered result
set for the whole journal. A muted or easily-missed filter indicator is a defect,
not a style choice.

### Analyst notes — gaps raised by Batch 3

11. **Day-click behavior in the full calendar** is undefined: open that day's
    entry, filter the popout list to that day, or something else — and what
    happens when the day holds several entries (D8).
12. **Dot semantics with multiple entries.** One dot per day regardless of count,
    or a count/intensity indication.
13. **Calendar tab identity.** Whether the calendar reuses a single tab or can be
    opened multiple times, and whether its view options persist across sessions
    and per workspace.
14. **Filter scope between surfaces.** Whether the full calendar inherits the
    popout's active filters or maintains its own.
15. **Clearing filters.** D16 requires emphasizing active filters; a discoverable
    "clear filters" affordance is implied but not specified.
16. **Calendar tab on mobile.** The canvas/tab model on phone widths is not
    described; D12 only covers the popout going full screen.

### Batch 4 — recorded 2026-08-05

**D17. Default path and filename: `journal/YYYY/MM/YYYY-MM-DD-HHmm.md`.**
Year and zero-padded month folders, with the file named by ISO date plus a
24-hour time **to the minute**. Example: `journal/2026/08/2026-08-05-1307.md`.
The `journal` root remains configurable per D7; the nesting and filename pattern
above are the defaults.

**The time component is always present** — it is not a collision fallback. Every
new entry appends the current time.

**D18. "New entry" always creates a new file.** It never reopens or appends to an
existing entry, even when one already exists for today. Opening a past entry
happens through the popout list (D9), not through the create action.

**D19. Dates use local device time; backfilling is allowed.**
"Today" is decided by the device clock. The user may create or adjust entries for
past dates. No workspace-pinned timezone and no configurable day-start offset in
the first slice.

### Analyst notes — gaps raised by Batch 4

17. **Date authority is undefined and is the highest-risk open item.** With dates
    encoded in the filename *and* backfill allowed, it is unspecified whether the
    filename, a frontmatter date field, or the filesystem timestamp is the source
    of truth for grouping, calendar placement, and ordering. Renaming a file or
    editing a date field would then disagree. The frontmatter contract story
    cannot proceed without this.
18. **Same-minute collision.** Two entries created inside the same minute produce
    the same filename. A collision rule is required.
19. **No "open today" action.** D18 makes create always-new, and D1 described
    resuming today's entry — so the popout menu likely needs a distinct "today"
    affordance separate from "new entry". The top-menu item list is still
    unspecified.
20. **Backfill mechanics.** Whether backfilling means choosing a date in a create
    dialog, editing a date field afterwards, renaming the file, or all three — and
    what time component a backfilled entry receives.
21. **Timezone drift.** Filenames record local wall-clock time with no offset, so
    entries written across timezones or a DST boundary may order or group
    surprisingly. Acceptable for a local-first journal, but worth stating rather
    than discovering.
22. **Folder creation on backfill.** Backfilling into a past year or month implies
    creating `YYYY/MM` folders that do not exist yet.

### Batch 5 — recorded 2026-08-06

**D20. Both the filename and a frontmatter date are written; the filename wins on
conflict.** *(resolves analyst note 17)*
Each entry carries its date in the filename (D17) and in a frontmatter field. The
two are expected to agree. When they disagree — after a manual rename, an external
edit, or a sync artifact — the **filename is authoritative** for grouping,
calendar placement, and ordering. Consequences for downstream stories:

- The frontmatter date is a convenience/portability copy, not the source of truth.
- Reading a note must not rewrite a disagreeing frontmatter date; that would
  violate the frontmatter mutation policy in `plans/technical-decisions.md`.
  Surfacing the mismatch is acceptable; silently repairing it is not.
- A file whose name does not parse as a date needs defined handling (open).

**D21. No templates in the first slice.**
New entries are not pre-filled from a template. Templates are not rejected as a
future idea, but nothing in the first release reads a template file or a template
setting. `pending-journal_service_daily_notes-high-med.md` should drop template
application from its first increment.

### P1. Proposed journal popout header — PROPOSAL, NOT APPROVED

The product owner asked for a recommendation rather than supplying a menu list.
The following is a proposal for approval. **It is not a decision and must not be
implemented or treated as settled.** It is recorded here so the approval has
something concrete to accept, amend, or reject.

Design intent: this is a narrow side panel, not the main canvas. Keep it to three
compact zones and push anything rare into an overflow menu.

**Zone 1 — action row**

| Item | Form | Behavior |
|---|---|---|
| New entry | Primary button, label + icon | Always creates a new file (D18) |
| Today | Icon button | See the "Today" note below |
| Calendar | Icon button | Opens the full calendar tab (D14) |
| Overflow `...` | Icon button | Rarely used items, e.g. journal settings, reveal folder |

**Zone 2 — search row**
A single full-width search input (full text, D16).

**Zone 3 — control strip**
A thin row beneath search: group-by as a compact dropdown on the left showing the
current value (`Week` by default, D10), and a filter button on the right that
opens a popover of the auto-populated metadata filters. The filter button carries
a count badge when filters are active.

**Active-filter chips.** When any filter or search is active, a chip row appears
under the control strip listing each active constraint with an individual dismiss
control, plus "Clear all". This is how P1 satisfies D16's requirement that active
filters be emphasized, and it supplies the clear-filters affordance flagged in
analyst note 15.

**Proposed "Today" behavior — needs explicit approval.** D18 makes "new entry"
always create a new file, which removed the "resume today's entry" path from D1.
The proposal: **Today opens the most recent entry for today if one exists, and
creates one if none does.** This restores the D1 workflow without weakening D18.
Two alternatives were considered and are recorded as rejected-for-now, not
dismissed: (a) Today merely scrolls the list to today without opening anything —
simpler but leaves D1 unserved; (b) no Today action at all — smallest surface but
makes the most common daily action a two-step scroll-and-click.

### Analyst notes — gaps raised by Batch 5

23. **Unparseable filenames.** D20 makes the filename authoritative, so a journal
    folder file whose name is not a date needs defined behavior: hidden, shown
    ungrouped, or flagged.
24. **Files in the journal folder that are not entries.** Related to 23 — a user
    may drop an ordinary note or an attachment into the journal folder.
25. **Rename consequences.** Renaming a file changes its date under D20, silently
    moving it in the calendar and list. Whether the app should warn is undecided.
26. **Empty new entries.** With no templates (D21), it is unspecified whether a
    new file is completely empty or arrives with a frontmatter block pre-seeded
    with the configured fields.
27. **Nesting versus filename date.** D17 stores files under `YYYY/MM` folders
    that duplicate the filename date. If a rename makes the filename disagree with
    its folder, D20 says the filename wins — so the folder is also cosmetic, and
    whether the app relocates the file is undecided.

### Open questions carried forward

- **Approval of P1**, including the proposed "Today" behavior.
- Whether a new entry is empty or pre-seeded with a frontmatter block (note 26).
- Handling of unparseable filenames and non-entry files in the journal folder
  (notes 23-24); rename warnings and folder relocation (notes 25, 27).
- Same-minute filename collision rule.
- Backfill mechanics and the time component of a backfilled entry.
- Whether a separate calendar activity-bar button still exists (D14 residual).
- Per-day aggregation policy for the calendar (D8 provisional).
- Day-click behavior, dot semantics, calendar tab identity, cross-surface filter
  scope, calendar on mobile (analyst notes 11-14, 16).
- Whether metadata field definitions are app-global or per-workspace.
- Entry-state affordances: missing, empty, malformed, read-only, unsaved.
- Field-definition drift and orphaned metadata display.
- Form-widget scope and malformed-frontmatter behavior.
- Accessibility requirements.
- Mockup approval cadence.

## Acceptance criteria

- [ ] User answers are recorded for workflow, date/time policy, folder/naming, templates, mood/activity metadata, calendar defaults, settings, accessibility, and mobile behavior.
- [ ] At least two clearly labeled alternatives are shown for panel/navigation composition; no alternative is treated as chosen until approval.
- [ ] Wireframes cover first-run/no-workspace, no-entry, existing-entry, invalid-frontmatter, create/edit, calendar filtering, and error states.
- [ ] Desktop and phone layouts identify focus order, touch targets, accessible names, and responsive transitions.
- [ ] A checkpoint table names artifact version, reviewer, approval/rejection, and follow-up question.
- [ ] The story lists explicit non-goals and unresolved decisions for downstream authors.

## Tests / manual checks

- No automated code tests expected.
- Manual: walk the proposed daily workflow with a real sample workspace; verify each screen can be described without assuming a final visual style or metadata vocabulary.
- Manual: review with keyboard-only and a screen reader outline; check that every action has a discoverable label in the wireframe.

## Non-goals

- No React/CSS/Tailwind implementation, no production assets, no frontmatter parser changes, no settings schema, and no extension registration.
- Do not select a mood scale, activity taxonomy, folder hierarchy, filename format, icon, color meaning, or calendar visualization without explicit approval.
- Do not ship a built-in mood or activity vocabulary; D4 makes these user-defined.
- Do not settle the calendar's per-day aggregation rule here; D8's "last one wins"
  is a provisional placeholder owned by the calendar data-model story.
